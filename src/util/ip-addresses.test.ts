import type {NetworkInterfaceInfo, NetworkInterfaceInfoIPv4} from "node:os"
import os from "node:os"
import {afterEach, describe, expect, it, vi} from "vitest"
import {detectPrivateIp, detectPublicIp} from "./ip-addresses.ts"

vi.mock("node:dgram", () => ({
  default: {createSocket: vi.fn()},
}))

vi.mock("node:os", () => ({
  default: {networkInterfaces: vi.fn(() => ({}))},
}))

interface StubSocket {
  once: ReturnType<typeof vi.fn>
  connect: ReturnType<typeof vi.fn>
  address: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

function stubSocket(address: string): StubSocket {
  const socket: StubSocket = {
    once: vi.fn(),
    connect: vi.fn(),
    address: vi.fn(() => ({address, port: 53})),
    close: vi.fn(),
  }
  return socket
}

function mockInterfaces(interfaces: Record<string, NetworkInterfaceInfo[]>) {
  vi.mocked(os.networkInterfaces).mockReturnValue(interfaces)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("detectPublicIp", () => {
  it("resolves the outbound address of the default route", async () => {
    const {default: dgram} = await import("node:dgram")
    const socket = stubSocket("203.0.113.7")
    vi.mocked(dgram.createSocket).mockReturnValue(socket as never)

    const promise = detectPublicIp()
    socket.connect.mock.calls[0]?.[2]()

    await expect(promise).resolves.toBe("203.0.113.7")
    expect(socket.close).toHaveBeenCalled()
  })

  it("rejects loopback addresses", async () => {
    const {default: dgram} = await import("node:dgram")
    const socket = stubSocket("127.0.0.1")
    vi.mocked(dgram.createSocket).mockReturnValue(socket as never)

    const promise = detectPublicIp()
    socket.connect.mock.calls[0]?.[2]()

    await expect(promise).resolves.toBeUndefined()
  })

  it("resolves undefined when the socket errors", async () => {
    const {default: dgram} = await import("node:dgram")
    const socket = stubSocket("203.0.113.7")
    vi.mocked(dgram.createSocket).mockReturnValue(socket as never)

    const promise = detectPublicIp()
    socket.once.mock.calls[0]?.[1](new Error("no network"))

    await expect(promise).resolves.toBeUndefined()
    expect(socket.close).toHaveBeenCalled()
  })
})

describe("detectPrivateIp", () => {
  const address = (ip: string): NetworkInterfaceInfoIPv4 => ({
    address: ip,
    family: "IPv4",
    internal: false,
    mac: "00:00:00:00:00:00",
    netmask: "255.255.255.255",
    cidr: `${ip}/32`,
  })

  it("prefers the tailscale interface", async () => {
    mockInterfaces({
      tailscale0: [address("100.120.0.1")],
      wg0: [address("100.64.0.9")],
    })

    await expect(detectPrivateIp()).resolves.toBe("100.120.0.1")
  })

  it("falls back to the wg0 interface", async () => {
    mockInterfaces({wg0: [address("100.64.0.9")]})

    await expect(detectPrivateIp()).resolves.toBe("100.64.0.9")
  })

  it("ignores loopback and ipv6 addresses on the mesh interfaces", async () => {
    mockInterfaces({
      tailscale0: [
        {
          address: "fd7a:115c:a1e0::1",
          family: "IPv6",
          internal: false,
          mac: "00:00:00:00:00:00",
          netmask: "ffff:ffff:ffff:ffff::",
          cidr: "fd7a:115c:a1e0::1/48",
          scopeid: 0,
        },
        {
          address: "127.0.0.1",
          family: "IPv4",
          internal: true,
          mac: "00:00:00:00:00:00",
          netmask: "255.0.0.0",
          cidr: "127.0.0.1/8",
        },
      ],
    })

    await expect(detectPrivateIp()).resolves.toBeUndefined()
  })

  it("resolves undefined when no mesh interface exists", async () => {
    mockInterfaces({eth0: [address("192.168.1.10")]})

    await expect(detectPrivateIp()).resolves.toBeUndefined()
  })
})
