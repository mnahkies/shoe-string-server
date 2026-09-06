import {z} from "zod"
import type {
  ComposeSpecification,
  Service,
} from "../generated/types/docker-compose.ts"

export * from "../generated/types/docker-compose.ts"

export interface ExtTcpPortConfig {
  /** port to bind to on the proxy*/
  "proxy-port": number
  /** container port to proxy to */
  "container-port": number
  /**
   * enable PROXY protocol header, allowing original client ip / port to be
   * forwarded for non-HTTP protocols like postgres, ssh, etc
   **/
  "send-proxy"?: boolean
  /** x-ext-proxy.name to bind to */
  "proxy-name": string
}

export interface ExtHostnameConfig {
  /** FQDN to bind to, used for virtual hosting by the proxy */
  name: string
  /** port to bind to on the proxy*/
  "proxy-port"?: number
  /** container port to proxy to */
  "container-port": number
  /** x-ext-proxy.name to bind to */
  "proxy-name": string
  /** Mark the route as authenticated (forward-auth via the proxy frontend). */
  auth?: boolean
  /** Generate an additional websocket-aware use_backend line for the hostname. */
  wss?: boolean
}

/**
 * Marks a service as a haproxy container
 */
export type ExtProxyMark = {
  /** the name services should use to bind to this proxy */
  name: string
}

export interface ExtendedService extends Service {
  /** http(s) hosts exposed by this service */
  "x-ext-hostnames"?: ExtHostnameConfig[]
  /** tcp hosts exposed by this service */
  "x-ext-tcp-ports"?: ExtTcpPortConfig[]
  /** marks this service as a haproxy container */
  "x-ext-proxy"?: ExtProxyMark
}

export interface ExtendedComposeSpecification extends ComposeSpecification {
  "x-podman"?: {
    in_pod?: boolean
  }
  services?: {
    [k: string]: ExtendedService
  }
}

export const extHostNameSchema = z.object({
  name: z.string(),
  "proxy-port": z.number().optional().default(443),
  "container-port": z.number(),
  "proxy-name": z.string(),
  auth: z.boolean().optional().default(false),
  wss: z.boolean().optional().default(false),
})

export const extTcpPortSchema = z.object({
  "proxy-port": z.number(),
  "container-port": z.number(),
  "send-proxy": z.boolean().optional().default(false),
  "proxy-name": z.string(),
})

export const extProxyMarkSchema = z.object({name: z.string()})

export const minimalServiceSchema = z.looseObject({
  image: z.string().optional(),
  container_name: z.string().optional(),
  hostname: z.string().optional(),
  user: z.string().optional(),
  security_opt: z.array(z.string()).optional(),
  volumes: z
    .array(z.union([z.string(), z.record(z.string(), z.unknown())]))
    .optional(),
  environment: z
    .union([z.record(z.string(), z.unknown()), z.array(z.string())])
    .optional(),
  labels: z
    .union([z.record(z.string(), z.string()), z.array(z.string())])
    .optional(),
  "x-ext-proxy": z.unknown().optional(),
  "x-ext-hostnames": z.unknown().optional(),
  "x-ext-tcp-ports": z.unknown().optional(),
})

export const minimalComposeSchema = z.looseObject({
  services: z.record(z.string(), minimalServiceSchema).optional(),
  networks: z
    .union([z.record(z.string(), z.unknown()), z.array(z.string())])
    .optional(),
  volumes: z.record(z.string(), z.unknown()).optional(),
  "x-podman": z
    .object({
      in_pod: z.boolean().optional(),
    })
    .optional(),
})
