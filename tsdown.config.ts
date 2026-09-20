import {defineConfig} from "tsdown"

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
  },
  format: "esm",
  clean: true,
  platform: "node",
  deps: {
    alwaysBundle: ["*"],
  },
})
