import {defineConfig} from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.{ts,mts}"],
          environment: "node",
        },
      },
      {
        test: {
          name: "e2e",
          include: ["e2e/**/*.e2e.{ts,mts}"],
          environment: "node",
          testTimeout: process.env["CI"] ? 10_000 : 5_000,
          hookTimeout: process.env["CI"] ? 60_000 : 30_000,
        },
      },
    ],
  },
})
