import {
  chmodSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import {request as httpRequest} from "node:http"
import {userInfo} from "node:os"
import path from "node:path"
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest"
import {$} from "zx"
import {main} from "../src/cli.ts"

const ROOT_DIR = path.resolve(__dirname, "..")
const TEST_DIR = path.resolve(ROOT_DIR, "e2e")
const WRITE_FILE_PATH = path.resolve(TEST_DIR, "data", "hello", "write.txt")
const SECRETS_FILE_PATH = path.resolve(TEST_DIR, "secrets.encrypted.yaml")
const HAPROXY_CERT_PATH = path.resolve(TEST_DIR, "data", "haproxy", "invalid")
const BASE_URL = `http://127.0.0.1:8080`
const TEST_HOST = "hello.test"

async function generateTestSecrets(): Promise<{
  privateKey: string
  encryptedYaml: string
}> {
  const {stdout: keygenOut} = await $`age-keygen`.quiet()
  const privateKeyMatch = keygenOut.match(/^AGE-SECRET-KEY-\S+/m)
  const publicKeyMatch = keygenOut.match(/^# public key: (\S+)/m)

  if (!privateKeyMatch || !publicKeyMatch) {
    throw new Error(`Failed to parse age-keygen output: ${keygenOut}`)
  }

  const privateKey = privateKeyMatch[0]
  const publicKey = publicKeyMatch[1]

  const plaintext = "TEST_SECRET: supersecret123\n"
  const {stdout: encryptedYaml} =
    await $`echo ${plaintext} | sops --encrypt --age ${publicKey} --filename-override secrets.yaml /dev/stdin`.quiet()

  return {privateKey, encryptedYaml}
}

async function generateTestCertificate(): Promise<void> {
  const keyPath = `${HAPROXY_CERT_PATH}.key`
  const certPath = `${HAPROXY_CERT_PATH}.crt`
  await $`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${keyPath} -out ${certPath} -subj "/CN=invalid." -days 365`.quiet()
  chmodSync(keyPath, 0o644)
  chmodSync(certPath, 0o644)
}

interface FetchResponse {
  status: number
  ok: boolean
  headers: Record<string, string | string[] | undefined>
  text: () => Promise<string>
  json: <T = unknown>() => Promise<T>
}

interface FetchOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
}

function fetchWithHost(
  url: string,
  options: FetchOptions = {},
): Promise<FetchResponse> {
  return new Promise((res, rej) => {
    const parsed = new URL(url)
    const req = httpRequest(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: options.method ?? "GET",
        headers: options.headers ?? {},
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on("data", (chunk: Buffer) => chunks.push(chunk))
        response.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8")
          res({
            status: response.statusCode ?? 0,
            ok:
              (response.statusCode ?? 0) >= 200 &&
              (response.statusCode ?? 0) < 300,
            headers: response.headers,
            text: async () => raw,
            json: async <T = unknown>() => JSON.parse(raw) as T,
          })
        })
      },
    )
    req.on("error", rej)
    if (options.body) {
      req.write(options.body)
    }
    req.end()
  })
}

async function waitForProxy(timeoutMs = 2_000): Promise<void> {
  const start = Date.now()
  let lastError: unknown
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetchWithHost(`${BASE_URL}/`, {
        headers: {Host: TEST_HOST},
      })
      if (res.ok) {
        return
      }
      lastError = `status ${res.status}: ${await res.text()}`
    } catch (err) {
      lastError = err
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(
    `Timeout waiting for proxy at ${BASE_URL} with Host ${TEST_HOST}. Last error: ${lastError}`,
  )
}

async function clean() {
  if (existsSync(WRITE_FILE_PATH)) {
    rmSync(WRITE_FILE_PATH)
  }
  if (existsSync(SECRETS_FILE_PATH)) {
    rmSync(SECRETS_FILE_PATH)
  }
  if (existsSync(`${HAPROXY_CERT_PATH}.key`)) {
    rmSync(`${HAPROXY_CERT_PATH}.key`)
  }
  if (existsSync(`${HAPROXY_CERT_PATH}.crt`)) {
    rmSync(`${HAPROXY_CERT_PATH}.crt`)
  }
}

describe("End-to-End Cluster Tests", () => {
  beforeAll(async () => {
    await clean()
    const {privateKey, encryptedYaml} = await generateTestSecrets()
    writeFileSync(SECRETS_FILE_PATH, encryptedYaml, "utf-8")
    vi.stubEnv("SOPS_AGE_KEY", privateKey)

    await generateTestCertificate()

    // Start cluster via in-process CLI execution
    await main(["node", "shoe-string", "up", `--data-dir=${TEST_DIR}`])

    // Wait until HAProxy and the test test-app respond
    await waitForProxy()
  })

  afterAll(async () => {
    try {
      await main(["node", "shoe-string", "down", `--data-dir=${TEST_DIR}`])
    } catch (err) {
      console.warn("Failed to tear down cluster:", err)
      throw err
    } finally {
      await clean()
    }
  })

  it("routes HTTP traffic through HAProxy using hostname matching", async () => {
    const res = await fetchWithHost(`${BASE_URL}/`, {
      headers: {Host: TEST_HOST},
    })
    expect(res.status).toBe(200)
    const body = await res.json<{
      status: string
      app: string
      hostname: string
    }>()
    expect(body).toEqual({
      status: "ok",
      app: "hello",
      hostname: "hello",
    })
  })

  it("denies requests with unknown hostname (default backend)", async () => {
    const res = await fetchWithHost(`${BASE_URL}/`, {
      headers: {Host: "unknown.e2e"},
    })
    expect(res.status).toBe(403)
  })

  it("allows reading files from mounted data volume", async () => {
    const res = await fetchWithHost(`${BASE_URL}/fs/read`, {
      headers: {Host: TEST_HOST},
    })
    expect(res.status).toBe(200)
    const body = await res.json<{content: string}>()
    expect(body).toEqual({content: "hello from data mount"})
  })

  it("allows writing files to mounted data volume and verifies host persistence", async () => {
    const res = await fetchWithHost(`${BASE_URL}/fs/write`, {
      method: "POST",
      headers: {Host: TEST_HOST},
    })
    expect(res.status).toBe(200)
    const body = await res.json<{status: string}>()
    expect(body).toEqual({status: "written"})

    expect(existsSync(WRITE_FILE_PATH)).toBe(true)
    const content = readFileSync(WRITE_FILE_PATH, "utf-8")
    expect(content).toBe("written by e2e test-app\n")
  })

  it("uses the correct selinux labels and user/group on data and conf directories", async () => {
    const dataDir = path.resolve(TEST_DIR, "data", "hello")
    const {stdout: dataLs} = await $`ls -laZ ${dataDir}`
    expect(dataLs).toMatch(/container_file_t:s0:c100,c203,c204 .+ test.txt/)
    expect(dataLs).toMatch(/container_file_t:s0:c100,c203,c204 .+ write.txt/)
    expect(dataLs).toContain(userInfo().username)

    const confDir = path.resolve(TEST_DIR, "conf", "hello")
    const {stdout: confLs} = await $`ls -laZ ${confDir}`
    expect(confLs).toMatch(/container_file_t:s0:c100,c203,c204 .+ config.json/)
    expect(confLs).toContain(userInfo().username)
  })

  it("injects decrypted secrets as files into /run/secrets", async () => {
    const res = await fetchWithHost(`${BASE_URL}/secrets`, {
      headers: {Host: TEST_HOST},
    })
    expect(res.status).toBe(200)
    const body = await res.json<{secret: string}>()
    expect(body).toEqual({secret: "supersecret123"})
  })

  it("enforces configured user ID and SELinux MCS level", async () => {
    const res = await fetchWithHost(`${BASE_URL}/whoami`, {
      headers: {Host: TEST_HOST},
    })
    expect(res.status).toBe(200)

    const body = await res.json<{uid: number; gid: number; selinux: string}>()
    expect(body).toEqual({
      uid: 2000,
      gid: 2000,
      selinux: expect.stringContaining("container_t:s0:c100,c203,c204"),
    })
  })
})
