import dgram from "node:dgram"
import os from "node:os"

/**
 * Detects the outbound IP of the default route (no packets are sent). Returns
 * undefined when detection fails or only loopback is available.
 */
export async function detectPublicIp(): Promise<string | undefined> {
  const {promise, resolve} = Promise.withResolvers<string | undefined>()
  const socket = dgram.createSocket("udp4")
  let settled = false

  const done = (value?: string) => {
    if (settled) {
      return
    }
    settled = true
    socket.close()
    resolve(value)
  }

  socket.once("error", () => done())
  socket.connect(53, "1.1.1.1", () => {
    const {address} = socket.address()
    done(
      address === "0.0.0.0" || address.startsWith("127.") ? undefined : address,
    )
  })

  return promise
}

/**
 * Detects the private mesh IP from the local network interfaces, preferring
 * the tailscale interface and falling back to a plain wireguard wg0.
 */
export async function detectPrivateIp(): Promise<string | undefined> {
  const interfaces = os.networkInterfaces()
  for (const name of ["tailscale0", "wg0"]) {
    const address = (interfaces[name] ?? []).find(
      (it) => !it.internal && it.family === "IPv4",
    )?.address
    if (address) {
      return address
    }
  }
  return undefined
}
