"use client"

import { useChat } from "@ai-sdk/react"
import type { ChatSessionPersistedState } from "@trigger.dev/sdk/chat"
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import type { UIMessage } from "ai"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"

import { ChatComposer } from "@/components/chat-composer"
import { Markdown } from "@/components/markdown"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { mintChatAccessToken, startChatSession } from "@/lib/games/chat-actions"
import type { gameChat } from "@/trigger/chat"

export function ChatThread({
  gameId,
  initialMessages,
  session,
}: {
  gameId: string
  initialMessages: UIMessage[]
  // Stored after each turn, so a reload resumes the stream
  session?: ChatSessionPersistedState
}) {
  const transport = useTriggerChatTransport<typeof gameChat>({
    task: "game-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId }) => startChatSession({ chatId }),
    sessions: session && { [gameId]: session },
  })
  const { messages, sendMessage, stop, status } = useChat({
    id: gameId,
    messages: initialMessages,
    transport,
    resume: !!session,
  })
  const [input, setInput] = useState("")

  // A new game is stored with only the prompt, so request the reply once
  const requestedFor = useRef<string | null>(null)
  useEffect(() => {
    if (requestedFor.current === gameId) return
    if (initialMessages.at(-1)?.role !== "user") return
    // A stored session means the reply was already requested; resume streams it
    if (session) return

    // useChat's cleanup calls chat.stop(), which aborts a request still being
    // prepared, so StrictMode's simulated unmount would cancel a direct send.
    // Defer it so that cleanup cancels the timer and the remount reschedules.
    const timeout = setTimeout(() => {
      requestedFor.current = gameId
      // No argument: request a reply to the stored message without appending
      sendMessage()
    })
    return () => clearTimeout(timeout)
  }, [gameId, initialMessages, sendMessage, session])

  function submit(value: string) {
    sendMessage({ text: value })
    setInput("")
  }

  // useChat's stop() only closes the local stream, and a resumed stream
  // doesn't own the turn, so also signal the run to abort its streamText
  function cancel() {
    stop()
    transport.stopGeneration(gameId)
  }

  const generating = status === "submitted" || status === "streaming"

  return (
    <div className="flex h-full flex-col">
      <MessageScrollerProvider defaultScrollPosition="end">
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-8">
              {messages.map((message) => (
                <MessageScrollerItem key={message.id} messageId={message.id}>
                  <Message align={message.role === "user" ? "end" : "start"}>
                    {message.role === "assistant" && (
                      <MessageAvatar className="size-8 self-start rounded-lg bg-transparent">
                        <Image
                          src="/logo.svg"
                          alt="Sandbox"
                          width={32}
                          height={32}
                          className="size-8"
                        />
                      </MessageAvatar>
                    )}
                    <MessageContent>
                      <Bubble
                        variant={
                          message.role === "user" ? "secondary" : "ghost"
                        }
                        align={message.role === "user" ? "end" : "start"}
                      >
                        <BubbleContent>
                          {message.parts.map((part, index) =>
                            part.type !== "text" ? null : message.role ===
                              "assistant" ? (
                              <Markdown key={index}>{part.text}</Markdown>
                            ) : (
                              <span key={index} className="whitespace-pre-wrap">
                                {part.text}
                              </span>
                            )
                          )}
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-4">
        <ChatComposer
          value={input}
          onValueChange={setInput}
          onSubmit={submit}
          disabled={generating}
          onStop={generating ? cancel : undefined}
          placeholder="Ask for a change…"
        />
      </div>
    </div>
  )
}
