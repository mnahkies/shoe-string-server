import {saveComposeFile} from "../lib/compose-files/compose-files.ts"
import type {
  ExtendedComposeSpecification,
  ExtendedService,
} from "../types/docker-compose-extensions.ts"

/**
 * Creates a test compose specification object with sensible defaults
 */
export function createTestComposeSpec(
  overrides?: Partial<ExtendedComposeSpecification>,
): ExtendedComposeSpecification {
  return {
    services: {
      app: createTestService(),
    },
    ...overrides,
  }
}

/**
 * Creates a test service definition with sensible defaults.
 */
export function createTestService(
  overrides?: Partial<ExtendedService>,
): ExtendedService {
  return {
    image: "test:latest",
    ...overrides,
  }
}

/**
 * Creates and writes a compose file using the active FsAdaptor,
 * filling in defaults for any omitted fields.
 */
export async function createTestComposeFile(
  filePath: string,
  overrides?: Partial<ExtendedComposeSpecification>,
): Promise<string> {
  const spec = createTestComposeSpec(overrides)
  await saveComposeFile(filePath, spec)
  return filePath
}
