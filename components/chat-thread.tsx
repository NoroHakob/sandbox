"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"

import { ChatComposer } from "@/components/chat-composer"
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

// The server loads the stored thread, so only send the new message
const transport = new DefaultChatTransport({
  prepareSendMessagesRequest: ({ id, messages }) => ({
    body: { id, message: messages.at(-1) },
  }),
})

export function ChatThread({
  gameId,
  initialMessages,
}: {
  gameId: string
  initialMessages: UIMessage[]
}) {
  const { messages, sendMessage, status } = useChat({
    id: gameId,
    messages: initialMessages,
    transport,
  })
  const [input, setInput] = useState("")

  // A new game is stored with only the prompt, so request the reply once
  const requestedFor = useRef<string | null>(null)
  useEffect(() => {
    if (requestedFor.current === gameId) return
    if (initialMessages.at(-1)?.role !== "user") return

    // useChat's cleanup calls chat.stop(), which aborts a request still being
    // prepared, so StrictMode's simulated unmount would cancel a direct send.
    // Defer it so that cleanup cancels the timer and the remount reschedules.
    const timeout = setTimeout(() => {
      requestedFor.current = gameId
      // No argument: request a reply to the stored message without appending
      sendMessage()
    })
    return () => clearTimeout(timeout)
  }, [gameId, initialMessages, sendMessage])

  function submit(value: string) {
    sendMessage({ text: value })
    setInput("")
  }

  return (
    <div className="flex h-svh flex-col">
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
                            part.type === "text" ? (
                              <span key={index}>{part.text}</span>
                            ) : null
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
          disabled={status === "submitted" || status === "streaming"}
          placeholder="Ask for a change…"
        />
      </div>
    </div>
  )
}
