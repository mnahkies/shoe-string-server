import fs from "node:fs"
import http from "node:http"
import process from "node:process"

const port = Number.parseInt(process.env.PORT || "8080", 10)

function sendJson(res, data, statusCode = 200) {
  res.writeHead(statusCode, {"Content-Type": "application/json"})
  res.end(JSON.stringify(data))
}

const server = http.createServer((req, res) => {
  const url = new URL(
    req.url || "/",
    `http://${req.headers.host || "localhost"}`,
  )
  const pathname = url.pathname

  console.info(`${req.method} ${pathname}`)

  if (req.method === "GET") {
    if (pathname === "/") {
      sendJson(res, {
        status: "ok",
        app: "hello",
        hostname: process.env.HOSTNAME || "hello",
      })
      return
    }

    if (pathname === "/fs/read") {
      try {
        const content = fs.readFileSync("/data/test.txt", "utf8").trim()
        sendJson(res, {content})
      } catch (err) {
        sendJson(res, {error: String(err)}, 500)
      }
      return
    }

    if (pathname === "/secrets") {
      try {
        const secret = fs
          .readFileSync("/run/secrets/TEST_SECRET", "utf8")
          .trim()
        sendJson(res, {secret})
      } catch (err) {
        sendJson(res, {error: String(err)}, 500)
      }
      return
    }

    if (pathname === "/whoami") {
      let selinux = "unknown"
      if (fs.existsSync("/proc/self/attr/current")) {
        try {
          selinux = fs.readFileSync("/proc/self/attr/current", "utf8").trim()
        } catch (err) {
          selinux = `error: ${err}`
        }
      }
      sendJson(res, {
        uid: typeof process.getuid === "function" ? process.getuid() : -1,
        gid: typeof process.getgid === "function" ? process.getgid() : -1,
        selinux,
      })
      return
    }
  } else if (req.method === "POST") {
    if (pathname === "/fs/write") {
      try {
        fs.writeFileSync("/data/write.txt", "written by e2e test-app\n")
        sendJson(res, {status: "written"})
      } catch (err) {
        sendJson(res, {error: String(err)}, 500)
      }
      return
    }
  }

  res.writeHead(404)
  res.end()
})

function handleExit() {
  server.close(() => {
    process.exit(0)
  })
  setTimeout(() => process.exit(0), 2000).unref()
}

process.on("SIGTERM", handleExit)
process.on("SIGINT", handleExit)

server.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${port}`)
})
