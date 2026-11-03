"use client"

import Image from "next/image"

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

const messages = [
  {
    id: "1",
    role: "user",
    content: "Make a voxel survival game set on a floating island.",
  },
  {
    id: "2",
    role: "assistant",
    content:
      "On it! I'll start with a procedurally generated floating island, a day/night cycle, and basic block mining and placing. Should hunger and health be part of the survival loop?",
  },
  {
    id: "3",
    role: "user",
    content: "Yes, both. And add some hostile mobs that spawn at night.",
  },
  {
    id: "4",
    role: "assistant",
    content:
      "Got it. I've added hunger and health bars, plus slime mobs that spawn after dusk and chase the player. Crafting a sword from wood and stone will help you fend them off.",
  },
  {
    id: "5",
    role: "user",
    content: "Can the island edges crumble if you mine too close to them?",
  },
  {
    id: "6",
    role: "assistant",
    content:
      "Done. Blocks near the edge now lose support when you mine beneath them and fall into the void after a short shake. Give it a try and let me know what to tune next.",
  },
] as const

export function ChatThread() {
  return (
    <div className="flex h-svh flex-col">
      <MessageScrollerProvider defaultScrollPosition="end">
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl p-4">
              {messages.map((message) => (
                <MessageScrollerItem key={message.id} messageId={message.id}>
                  {message.role === "assistant" ? (
                    <Message>
                      <MessageAvatar>
                        <Image
                          src="/logo.svg"
                          alt="Assistant"
                          width={32}
                          height={32}
                        />
                      </MessageAvatar>
                      <MessageContent>
                        <Bubble variant="muted">
                          <BubbleContent>{message.content}</BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  ) : (
                    <Message align="end">
                      <MessageContent>
                        <Bubble align="end">
                          <BubbleContent>{message.content}</BubbleContent>
                        </Bubble>
                      </MessageContent>
                    </Message>
                  )}
                </MessageScrollerItem>
              ))}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <div className="mx-auto w-full max-w-3xl p-4 pt-0">
        <ChatComposer />
      </div>
    </div>
  )
}
