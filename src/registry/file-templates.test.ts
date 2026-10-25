import {describe, expect, it} from "vitest"
import {renderEtaTemplate} from "./file-templates.ts"

describe("registry/file-template", () => {
  it("rejects unknown template names", () => {
    expect(() => {
      // @ts-expect-error: testing error handling
      return renderEtaTemplate("does/not/exist.eta", {})
    }).toThrow("does/not/exist.eta")
  })

  it("validates inputs against the registered schema before rendering", () => {
    expect(() => {
      // @ts-expect-error: testing error handling
      return renderEtaTemplate("haproxy/haproxy.cfg.template.eta", {name: 42})
    }).toThrow()
  })

  it("parses valid template name + inputs", () => {
    const rendered = renderEtaTemplate("haproxy/haproxy.cfg.template.eta", {
      name: "test",
    })
    expect(rendered).toContain("frontend test")
  })
})
