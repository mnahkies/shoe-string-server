import {z} from "zod"

const NAME_PATTERN = /^[a-z][a-z0-9-]*$/

const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/

const CONTAINER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/

export const containerNameSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || CONTAINER_NAME_PATTERN.test(value),
    "must be a valid container name",
  )
  .optional()

export const portSchema = z
  .string()
  .trim()
  .refine((value) => {
    const port = Number(value)
    return Number.isInteger(port) && port >= 1 && port <= 65535
  }, "must be a port number between 1 and 65535")
  .optional()

export const nameSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || NAME_PATTERN.test(value),
    "must be lowercase alphanumeric/hyphens, starting with a letter",
  )

export const hostnameSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === "" || HOSTNAME_PATTERN.test(value),
    "must be a lowercase hostname (letters, digits, hyphens, dots)",
  )
