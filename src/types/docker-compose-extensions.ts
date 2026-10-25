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
  confDir: string
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
  "x-requires"?: string[]
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

export const extProxyMarkSchema = z.object({
  name: z.string(),
  confDir: z.string(),
})

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
  "x-requires": z.array(z.string()).default([]),
})

// The JSON schema doesn't use $ref as much as it could, this is a manual naming of the generated schema

export type ContainerSpecVolume = {
  /**
   * The mount type: bind for mounting host directories, volume for named volumes, tmpfs for temporary filesystems, cluster for cluster volumes, npipe for named pipes, or image for mounting from an image.
   */
  type: "bind" | "volume" | "tmpfs" | "cluster" | "npipe" | "image"
  /**
   * The source of the mount, a path on the host for a bind mount, a docker image reference for an image mount, or the name of a volume defined in the top-level volumes key. Not applicable for a tmpfs mount.
   */
  source: string
  /**
   * The path in the container where the volume is mounted.
   */
  target: string
  /**
   * Flag to set the volume as read-only.
   */
  read_only?: boolean | string
  /**
   * The consistency requirements for the mount. Available values are platform specific.
   */
  consistency?: string
  /**
   * Configuration specific to bind mounts.
   */
  bind?: {
    /**
     * The propagation mode for the bind mount: 'shared', 'slave', 'private', 'rshared', 'rslave', or 'rprivate'.
     */
    propagation?: string
    /**
     * Create the host path if it doesn't exist.
     */
    create_host_path?: boolean | string
    /**
     * Recursively mount the source directory.
     */
    recursive?: "enabled" | "disabled" | "writable" | "readonly"
    /**
     * SELinux relabeling options: 'z' for shared content, 'Z' for private unshared content.
     */
    selinux?: "z" | "Z"
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^x-".
     */
    [k: string]: unknown
  }
  /**
   * Configuration specific to volume mounts.
   */
  volume?: {
    /**
     * Either a dictionary mapping keys to values, or a list of strings.
     */
    labels?:
      | {
          /**
           * Value for the key, which can be a string, number, boolean, or null.
           *
           * This interface was referenced by `undefined`'s JSON-Schema definition
           * via the `patternProperty` ".+".
           */
          [k: string]: string | number | boolean | null
        }
      | string[]
    /**
     * Flag to disable copying of data from a container when a volume is created.
     */
    nocopy?: boolean | string
    /**
     * Path within the volume to mount instead of the volume root.
     */
    subpath?: string
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^x-".
     */
    [k: string]: unknown
  }
  /**
   * Configuration specific to tmpfs mounts.
   */
  tmpfs?: {
    /**
     * Size of the tmpfs mount in bytes.
     */
    size?: number | string
    /**
     * File mode of the tmpfs in octal.
     */
    mode?: number | string
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^x-".
     */
    [k: string]: unknown
  }
  /**
   * Configuration specific to image mounts.
   */
  image?: {
    /**
     * Path within the image to mount instead of the image root.
     */
    subpath?: string
    /**
     * This interface was referenced by `undefined`'s JSON-Schema definition
     * via the `patternProperty` "^x-".
     */
    [k: string]: unknown
  }
  /**
   * This interface was referenced by `undefined`'s JSON-Schema definition
   * via the `patternProperty` "^x-".
   */
  [k: string]: unknown
}
