import {describe, expect, it, vi} from "vitest"
import {wizard} from "./wizard.ts"

const answer =
  <T>(value: T) =>
  async () =>
    value

describe("typed wizard", () => {
  it("runs questions in order and types earlier answers", async () => {
    const seen: unknown[] = []
    const flow = wizard()
      .question("name", answer("Ada"))
      .question("age", async ({name}) => {
        const typedName: string = name
        seen.push(typedName)
        return 37
      })

    const result: Promise<{name: string; age: number}> = flow.run({})
    await expect(result).resolves.toEqual({name: "Ada", age: 37})
    expect(seen).toEqual(["Ada"])
  })

  it("passes initial context to questions", async () => {
    const flow = wizard<{directory: string}>().question(
      "configPath",
      ({directory}) => `${directory}/config.yaml`,
    )

    await expect(flow.run({directory: "/tmp/app"})).resolves.toEqual({
      configPath: "/tmp/app/config.yaml",
    })
  })

  it("runs only the selected branch and makes branch answers optional", async () => {
    const matched = vi.fn(async () => "enabled")
    const otherwise = vi.fn(async () => "skipped")
    const flow = wizard()
      .question("enabled", answer(true))
      .when(({enabled}) => enabled, {
        match: wizard().question("featureStatus", matched),
        otherwise: wizard().question("skipReason", otherwise),
      })

    const result: Promise<{
      enabled: boolean
      featureStatus?: string
      skipReason?: string
    }> = flow.run({})
    await expect(result).resolves.toEqual({
      enabled: true,
      featureStatus: "enabled",
    })
    expect(matched).toHaveBeenCalledOnce()
    expect(otherwise).not.toHaveBeenCalled()
  })

  it("supports lazy branches that use earlier answers", async () => {
    const flow = wizard()
      .question("appName", answer("example"))
      .question("configureDb", answer(true))
      .when(({configureDb}) => configureDb, {
        match: () =>
          wizard<{appName: string}>().question(
            "dbLabel",
            ({appName}) => `${appName}-db`,
          ),
        otherwise: wizard().question("skip", answer(true)),
      })

    await expect(flow.run({})).resolves.toEqual({
      appName: "example",
      configureDb: true,
      dbLabel: "example-db",
    })
  })

  it("keeps top-level caller context keys reserved", async () => {
    const invalid = wizard<{name: string}>().question(
      "name" as never,
      answer("overwritten"),
    )

    await expect(invalid.run({name: "original"})).rejects.toThrow(
      'Wizard answer key "name" already exists in the current context',
    )
  })

  it("stores nested workflow answers under a namespace", async () => {
    const database = wizard()
      .question("name", answer("postgres"))
      .question("port", answer(5432))
    const flow = wizard()
      .question("name", answer("my-app"))
      .workflow("database", () => database)

    await expect(flow.run({})).resolves.toEqual({
      name: "my-app",
      database: {name: "postgres", port: 5432},
    })
  })

  it("starts each run with fresh answer state", async () => {
    let id = 0
    const flow = wizard().question("id", async () => ++id)

    await expect(flow.run({})).resolves.toEqual({id: 1})
    await expect(flow.run({})).resolves.toEqual({id: 2})
  })

  it("propagates question failures", async () => {
    const failure = new Error("prompt cancelled")
    const flow = wizard().question("value", async () => {
      throw failure
    })

    await expect(flow.run({})).rejects.toBe(failure)
  })
})
