"use client"

import type { ComponentProps } from "react"

import { ChatPreview } from "@/components/chat-preview"
import { ChatThread } from "@/components/chat-thread"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

export function GameChat({
  sandboxId,
  gameId,
  ...props
}: ComponentProps<typeof ChatThread> & { sandboxId: string | null }) {
  if (!sandboxId) {
    return (
      <div className="flex h-svh flex-col">
        <ChatThread gameId={gameId} {...props} />
      </div>
    )
  }

  return (
    // The group sets an inline height: 100%, which overrides a height class on
    // it, so a fixed-height parent is what keeps scrolling inside the panels
    <div className="h-svh">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel
          defaultSize="40"
          minSize="25"
          className="flex h-full flex-col"
        >
          <ChatThread gameId={gameId} {...props} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          defaultSize="60"
          minSize="30"
          className="flex h-full flex-col"
        >
          <ChatPreview key={gameId} gameId={gameId} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
