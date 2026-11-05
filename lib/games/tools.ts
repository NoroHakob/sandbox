import { posix } from "node:path"

import {
  DaytonaBadRequestError,
  DaytonaFileAccessDeniedError,
  DaytonaFileNotFoundError,
  type Sandbox,
} from "@daytona/sdk"
import { tool } from "ai"
import { z } from "zod"

import { GAME_DIR, getGameSandbox } from "@/lib/daytona/utils"

const ENTRY_FILE = `${GAME_DIR}/index.html`
const ENGINE_DIR = `${GAME_DIR}/engine`
const MAX_READ_BYTES = 128 * 1024
const MAX_LIST_DEPTH = 10
const SAFE_PATH = /^[a-zA-Z0-9._/-]+$/

const pathSchema = z
  .string()
  .describe(
    'Path relative to the game folder, e.g. "index.html" or "js/game.js"'
  )

// A mistake the model can fix, returned as a tool result instead of thrown
class ToolProblem extends Error {}

function isExpectedFailure(error: unknown) {
  return (
    error instanceof ToolProblem ||
    error instanceof DaytonaFileNotFoundError ||
    error instanceof DaytonaFileAccessDeniedError ||
    // Covers paths of the wrong kind, e.g. writing over a folder
    error instanceof DaytonaBadRequestError
  )
}

function resolveGamePath(path: string) {
  if (!SAFE_PATH.test(path)) {
    throw new ToolProblem(
      `Invalid path "${path}": only a-z, A-Z, 0-9, ".", "_", "-" and "/" are allowed`
    )
  }

  if (path.startsWith("/") || path.split("/").includes("..")) {
    throw new ToolProblem(
      `Invalid path "${path}": use a path relative to the game folder, without ".."`
    )
  }

  const resolved = posix.resolve(GAME_DIR, path)

  if (resolved !== GAME_DIR && !resolved.startsWith(`${GAME_DIR}/`)) {
    throw new ToolProblem(`Invalid path "${path}": outside the game folder`)
  }

  return resolved
}

function resolveWritablePath(path: string) {
  const resolved = resolveGamePath(path)

  if (resolved === ENGINE_DIR || resolved.startsWith(`${ENGINE_DIR}/`)) {
    throw new ToolProblem(
      `Cannot change "${path}": engine/ is read-only. Import it from "./engine/index.js" and put your changes in the game's own files`
    )
  }

  return resolved
}

// Called once per turn, so the sandbox and the queue last for a single turn
export function createGameTools(gameId: string) {
  let sandboxPromise: Promise<Sandbox> | undefined
  let queue: Promise<unknown> = Promise.resolve()

  function getSandbox() {
    sandboxPromise ??= getGameSandbox(gameId)
      .then(({ sandbox }) => sandbox)
      .catch((error) => {
        sandboxPromise = undefined
        throw error
      })

    return sandboxPromise
  }

  async function attempt<T>(action: (sandbox: Sandbox) => Promise<T>) {
    // Outside the try: failing to reach the sandbox is not the model's mistake
    const sandbox = await getSandbox()

    try {
      return { ok: true as const, ...(await action(sandbox)) }
    } catch (error) {
      if (!isExpectedFailure(error)) throw error

      return { ok: false as const, error: (error as Error).message }
    }
  }

  // A step can call tools in parallel, and two edits of one file would
  // otherwise read the same content and lose one of the changes
  function run<T>(action: (sandbox: Sandbox) => Promise<T>) {
    const result = queue.then(() => attempt(action))
    queue = result.catch(() => {})

    return result
  }

  return {
    list_files: tool({
      description:
        "List the files and folders of the game, including nested ones.",
      inputSchema: z.object({
        path: pathSchema.optional().describe("Folder to list, default is all"),
      }),
      execute: ({ path = "." }) =>
        run(async (sandbox) => {
          const entries = await sandbox.fs.listFiles(resolveGamePath(path), {
            depth: MAX_LIST_DEPTH,
          })

          return {
            entries: entries.map((entry) => ({
              // Optional in the type, but always set when depth is passed
              path: posix.relative(GAME_DIR, entry.path!),
              type: entry.isDir ? "folder" : "file",
              size: entry.size,
            })),
          }
        }),
    }),

    read_file: tool({
      description: `Read a text file of the game. Files over ${MAX_READ_BYTES / 1024}KB are cut off.`,
      inputSchema: z.object({ path: pathSchema }),
      execute: ({ path }) =>
        run(async (sandbox) => {
          const file = await sandbox.fs.downloadFile(resolveGamePath(path))

          return {
            content: file.subarray(0, MAX_READ_BYTES).toString("utf8"),
            truncated: file.length > MAX_READ_BYTES,
          }
        }),
    }),

    write_file: tool({
      description:
        "Create a file or replace all of its content. Parent folders are created for you.",
      inputSchema: z.object({
        path: pathSchema,
        content: z.string().describe("The complete content of the file"),
      }),
      execute: ({ path, content }) =>
        run(async (sandbox) => {
          const file = resolveWritablePath(path)
          const data = Buffer.from(content, "utf8")

          await sandbox.fs.createFolder(posix.dirname(file), "755")
          await sandbox.fs.uploadFile(data, file)

          return { path, bytes: data.length }
        }),
    }),

    replace_text: tool({
      description:
        "Replace an exact piece of text in a file. Whitespace must match. Fails if the text is missing, or found more than once unless replace_all is true.",
      inputSchema: z.object({
        path: pathSchema,
        old_text: z.string().describe("The exact text to find"),
        new_text: z.string().describe("The text to put in its place"),
        replace_all: z
          .boolean()
          .optional()
          .describe("Replace every occurrence, default is false"),
      }),
      execute: ({ path, old_text, new_text, replace_all = false }) =>
        run(async (sandbox) => {
          const file = resolveWritablePath(path)

          if (!old_text) throw new ToolProblem("old_text must not be empty")

          const content = await sandbox.fs.downloadFile(file)
          // split and join, as String.replace would expand "$&" in new_text
          const parts = content.toString("utf8").split(old_text)
          const replacements = parts.length - 1

          if (replacements === 0) {
            throw new ToolProblem(`old_text was not found in ${path}`)
          }

          if (replacements > 1 && !replace_all) {
            throw new ToolProblem(
              `old_text was found ${replacements} times in ${path}: add surrounding text to make it unique, or set replace_all`
            )
          }

          await sandbox.fs.uploadFile(
            Buffer.from(parts.join(new_text), "utf8"),
            file
          )

          return { path, replacements }
        }),
    }),

    delete_file: tool({
      description: "Delete a file of the game. index.html cannot be deleted.",
      inputSchema: z.object({ path: pathSchema }),
      execute: ({ path }) =>
        run(async (sandbox) => {
          const file = resolveWritablePath(path)

          if (file === ENTRY_FILE) {
            throw new ToolProblem("index.html cannot be deleted")
          }

          await sandbox.fs.deleteFile(file)

          return { path }
        }),
    }),
  }
}
