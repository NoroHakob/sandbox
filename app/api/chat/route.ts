import { openai, type OpenAILanguageModelResponsesOptions } from "@ai-sdk/openai"
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

  // The first message is stored when the game is created, so the client's
  // initial request resends a message the thread already has
  const isStored = game.messages.some(({ id }) => id === message.id)

  const messages = await validateUIMessages({
    messages: isStored ? game.messages : [...game.messages, message],
  })

  const result = streamText({
    model: openai("gpt-6-luna"),
    instructions:
      "You are a game design assistant. Keep replies short and concise (a few sentences).",
    messages: await convertToModelMessages(messages),
    maxOutputTokens: 800,
    providerOptions: {
      openai: {
        reasoningEffort: "low",
      } satisfies OpenAILanguageModelResponsesOptions,
    },
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
