#!/usr/bin/env node

import {glob, readFile, stat, writeFile} from "node:fs/promises"
import {remark} from "remark"
import remarkToc from "remark-toc"

async function generateToc(filename: string) {
  const content = await readFile(filename, "utf-8")
  const result = await remark().use(remarkToc).process(content)

  const newContent = String(result)
  if (newContent !== content) {
    await writeFile(filename, newContent, "utf-8")
    console.log(`Updated TOC in ${filename}`)
  } else {
    console.log(`No TOC changes needed for ${filename}`)
  }
}

async function resolveFiles(patterns: string[]): Promise<string[]> {
  const files = new Set<string>()

  for (const pattern of patterns) {
    let matched = false

    // 1. Check if direct file or directory
    try {
      const s = await stat(pattern)
      if (s.isFile()) {
        files.add(pattern)
        matched = true
      } else if (s.isDirectory()) {
        for await (const entry of glob(`${pattern}/**/*.md`, {
          exclude: (p) => p.includes("node_modules") || p.includes(".git"),
        })) {
          try {
            const entryStat = await stat(entry)
            if (entryStat.isFile()) {
              files.add(entry)
              matched = true
            }
          } catch {
            // Ignore stat errors
          }
        }
      }
    } catch {
      // Not a direct path, fall through to glob matching
    }

    // 2. Try glob matching if not a direct file
    if (!matched) {
      for await (const entry of glob(pattern, {
        exclude: (p) => p.includes("node_modules") || p.includes(".git"),
      })) {
        try {
          const entryStat = await stat(entry)
          if (entryStat.isFile()) {
            files.add(entry)
            matched = true
          }
        } catch {
          // Ignore stat errors
        }
      }
    }

    if (!matched) {
      console.warn(`Warning: No files matched pattern "${pattern}"`)
    }
  }

  return Array.from(files)
}

async function main() {
  const args = process.argv.slice(2)
  const patterns = args.length > 0 ? args : ["**/*.md"]

  const files = await resolveFiles(patterns)

  if (files.length === 0) {
    console.log("No markdown files found to process.")
    return
  }

  console.log(`Processing ${files.length} file(s)...`)
  for (const file of files) {
    try {
      await generateToc(file)
    } catch (err) {
      console.error(`Error processing ${file}:`, err)
      process.exitCode = 1
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err)
  process.exit(1)
})
