import * as fs from "node:fs/promises"
import {compile} from "json-schema-to-typescript"

const res = await fetch(
  "https://raw.githubusercontent.com/compose-spec/compose-go/refs/heads/main/schema/compose-spec.json",
)

if (!res.ok) {
  throw new Error("Failed to fetch schema", {cause: await res.text()})
}

const json = await res.json()

const result = await compile(json, "compose-spec.json")

await fs.writeFile(
  new URL("../src/generated/types/docker-compose.ts", import.meta.url),
  result,
)
