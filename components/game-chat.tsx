"use client"

import { type ComponentProps, useState } from "react"

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
}: Omit<ComponentProps<typeof ChatThread>, "onTurnFinish"> & {
  sandboxId: string | null
}) {
  const [revision, setRevision] = useState(0)

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
          <ChatThread
            gameId={gameId}
            onTurnFinish={() => setRevision((current) => current + 1)}
            {...props}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          defaultSize="60"
          minSize="30"
          className="flex h-full flex-col"
        >
          <ChatPreview
            key={gameId}
            gameId={gameId}
            // The page's sandboxId is stale once the first turn has created one
            ready={!!sandboxId || revision > 0}
            revision={revision}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}
