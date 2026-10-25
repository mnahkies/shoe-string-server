import {load as loadYaml} from "js-yaml"
import {describe, expect, it, vi} from "vitest"
import {z} from "zod"
import {InMemoryFsAdaptor} from "../lib/file-system/in-memory.fs-adaptor.ts"
import {ApplicationRegistry, volume} from "./application-registry.ts"

// biome-ignore lint/suspicious/noTemplateCurlyInString: Compose interpolation placeholder
const DATA_BASE_PATH = "${DATA_BASE_PATH}"

describe("application registry rendering", () => {
  it("writes Compose objects and only renders enabled files under the cluster root", async () => {
    const registry = new ApplicationRegistry()
    const fs = new InMemoryFsAdaptor()
    const skippedRender = vi.fn(() => "must not be written")
    const application = registry.defineApplication({
      name: "example",
      type: "service",
      description: "registry renderer test",
      inputs: z.object({name: z.string(), addExtraFile: z.boolean()}),
      templates: {
        compose: ({name}) => ({
          name,
          services: {
            [name]: {image: "nginx:alpine", container_name: name},
          },
        }),
        files: [
          {
            name: () => "conf/example/enabled.txt",
            shouldRender: ({addExtraFile}) => addExtraFile,
            render: () => "included",
          },
          {
            name: () => "conf/example/skipped.txt",
            shouldRender: ({addExtraFile}) => !addExtraFile,
            render: skippedRender,
          },
        ],
      },
    })

    const created = await registry.renderApplication(
      application,
      {name: "example", addExtraFile: true},
      fs,
      {appsDir: "/cluster/applications", rootConfDir: "/cluster"},
    )

    expect(created).toEqual([
      "/cluster/applications/example.yaml",
      "/cluster/conf/example/enabled.txt",
    ])
    expect(
      loadYaml(await fs.readFile("/cluster/applications/example.yaml")),
    ).toMatchObject({
      name: "example",
      services: {example: {image: "nginx:alpine", container_name: "example"}},
    })
    expect(await fs.readFile("/cluster/conf/example/enabled.txt")).toBe(
      "included",
    )
    expect(await fs.exists("/cluster/conf/example/skipped.txt")).toBe(false)
    expect(skippedRender).not.toHaveBeenCalled()
  })
})

describe("application volume paths", () => {
  it("resolves cluster-root paths and rejects unsafe mount sources", () => {
    expect(
      volume.conf({source: "./conf/haproxy-public", target: "/etc/haproxy"})
        .source,
    ).toBe(`${DATA_BASE_PATH}/conf/haproxy-public`)
    expect(
      volume.conf({source: "conf/haproxy/public", target: "/etc/haproxy"})
        .source,
    ).toBe(`${DATA_BASE_PATH}/conf/haproxy/public`)
    expect(
      volume.data({
        source: "data/lego/certificates/example.crt",
        target: "/cert",
      }).source,
    ).toBe(`${DATA_BASE_PATH}/data/lego/certificates/example.crt`)

    expect(() =>
      volume.conf({source: "haproxy/public", target: "/etc/haproxy"}),
    ).toThrow("must live under the 'conf/' directory")
    expect(() =>
      volume.data({
        source: `${DATA_BASE_PATH}/data/lego/example.crt`,
        target: "/cert",
      }),
    ).toThrow("must not include the DATA_BASE_PATH prefix")
    expect(() =>
      volume.conf({source: "/etc/haproxy", target: "/etc/haproxy"}),
    ).toThrow("must be relative to the cluster root")
  })
})
