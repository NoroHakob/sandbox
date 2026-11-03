import { openai } from "@ai-sdk/openai"
import { auth } from "@clerk/nextjs/server"
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  generateId,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type UIMessage,
} from "ai"

import { getGame, saveGameMessages } from "@/lib/games/queries"

export async function POST(req: Request) {
  const { userId, orgId } = await auth()
  if (!userId || !orgId) return new Response("Unauthorized", { status: 401 })

  // The client sends only the new message; the stored thread is the source of truth
  const { id, message }: { id: string; message: UIMessage } = await req.json()

  const game = await getGame(id)
  if (!game) return new Response("Not found", { status: 404 })

  const messages = await validateUIMessages({
    messages: [...game.messages, message],
  })

  const result = streamText({
    model: openai("gpt-6-luna"),
    messages: await convertToModelMessages(messages),
  })

  // Run to completion so the thread is saved even if the client disconnects
  result.consumeStream()

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      generateMessageId: generateId,
      onEnd: async ({ messages }) => {
        await saveGameMessages({ id, orgId, messages })
      },
    }),
  })
}
