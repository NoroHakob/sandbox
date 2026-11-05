import { readdir } from "node:fs/promises"
import path from "node:path"

import type { FileUpload } from "@daytona/sdk"

// Resolved from process.cwd() because the Trigger.dev worker is bundled, so
// import.meta.url wouldn't point here. additionalFiles in trigger.config.ts
// copies this folder into the deployed build, as nothing imports it.
const RUNTIME_DIR = path.join(process.cwd(), "lib/games/runtime")

export async function readRuntimeFiles(destination: string) {
  const entries = await readdir(RUNTIME_DIR, {
    recursive: true,
    withFileTypes: true,
  })

  const folders: string[] = []
  const files: FileUpload[] = []

  for (const entry of entries) {
    const source = path.join(entry.parentPath, entry.name)
    // Sandbox paths are always posix, even when this runs on Windows
    const relativePath = path
      .relative(RUNTIME_DIR, source)
      .split(path.sep)
      .join("/")
    const sandboxPath = path.posix.join(destination, relativePath)

    if (entry.isDirectory()) folders.push(sandboxPath)
    else if (entry.isFile()) files.push({ source, destination: sandboxPath })
  }

  // A parent's path is a prefix of its children's, so it always sorts first
  return { folders: folders.sort(), files }
}
