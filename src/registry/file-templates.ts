import path from "node:path"
import {Eta} from "eta"
import {z} from "zod"

const eta = new Eta({
  views: path.resolve(import.meta.dirname, "templates"),
  autoTrim: false,
  autoEscape: false,
})

const registry = {
  "haproxy/directory.html.eta": z.object({}),
  "haproxy/haproxy.cfg.template.eta": z.object({
    name: z.string(),
    staticDirectory: z.boolean().default(false),
  }),
}

export type TemplateName = keyof typeof registry

export type TemplateInputs<Name extends TemplateName> = z.input<
  (typeof registry)[Name]
>

export function renderEtaTemplate<Name extends TemplateName>(
  name: Name,
  inputs: TemplateInputs<Name>,
): string {
  if (!(name in registry)) {
    throw new Error(`unknown template: ${name}`)
  }

  return eta.render(name, registry[name].parse(inputs))
}
