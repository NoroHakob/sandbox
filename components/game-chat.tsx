"use client"

import type { ComponentProps } from "react"

import { ChatPreview } from "@/components/chat-preview"
import { ChatThread } from "@/components/chat-thread"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

export function GameChat(props: ComponentProps<typeof ChatThread>) {
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
          <ChatThread {...props} />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          defaultSize="60"
          minSize="30"
          className="flex h-full flex-col"
        >
          <ChatPreview />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
