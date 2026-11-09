"use client"

import { useChat } from "@ai-sdk/react"
import type { InferChatUIMessageFromTools } from "@trigger.dev/sdk/ai"
import type { ChatSessionPersistedState } from "@trigger.dev/sdk/chat"
import { useTriggerChatTransport } from "@trigger.dev/sdk/chat/react"
import {
  type ChatTransport,
  type DynamicToolUIPart,
  getToolName,
  type InferUITools,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ToolUIPart,
  type UIMessage,
  type UIMessageChunk,
} from "ai"
import { CheckIcon, CircleAlertIcon } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react"

import { ChatComposer } from "@/components/chat-composer"
import { Markdown } from "@/components/markdown"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import { Message, MessageAvatar, MessageContent } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoiceDescription,
  QuestionnaireChoices,
  QuestionnaireError,
  QuestionnaireItem,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@/components/ui/questionnaire"
import { Spinner } from "@/components/ui/spinner"
import {
  OUT_OF_CREDITS_ERROR,
  OUT_OF_CREDITS_PART,
} from "@/lib/billing/out-of-credits"
import { mintChatAccessToken, startChatSession } from "@/lib/games/chat-actions"
import type { GameModelId } from "@/lib/games/model-catalog"
import type { createGameTools } from "@/lib/games/tools"
import type { gameChat } from "@/trigger/chat"

type GameTools = ReturnType<typeof createGameTools>
type GameMessage = InferChatUIMessageFromTools<GameTools>
type AskPlayer = InferUITools<GameTools>["ask_player"]
type ToolPart = ToolUIPart | DynamicToolUIPart

const TOOL_VERBS: Record<string, { active: string; done: string }> = {
  read_file: { active: "Reading", done: "Read" },
  write_file: { active: "Writing", done: "Wrote" },
  replace_text: { active: "Editing", done: "Edited" },
  list_files: { active: "Listing files", done: "Listed files" },
  delete_file: { active: "Deleting", done: "Deleted" },
  ask_player: { active: "Asking", done: "Asked" },
}
const FALLBACK_VERBS = { active: "Working", done: "Ran tool" }

function getToolStatus(part: ToolPart): {
  status: "active" | "done" | "failed"
  error?: string
} {
  switch (part.state) {
    case "output-error":
      return { status: "failed", error: part.errorText }
    case "output-denied":
      return { status: "failed", error: part.approval.reason }
    case "output-available": {
      // Our tools return expected problems as a result instead of throwing
      const output = part.output as
        { ok?: boolean; error?: string } | null | undefined

      return output?.ok === false
        ? { status: "failed", error: output.error }
        : { status: "done" }
    }
    default:
      return { status: "active" }
  }
}

function ToolCallMarker({ part }: { part: ToolPart }) {
  const { status, error } = getToolStatus(part)
  const verbs = TOOL_VERBS[getToolName(part)] ?? FALLBACK_VERBS
  // A failed call didn't happen, so it keeps the present form
  const verb = status === "done" ? verbs.done : verbs.active
  // Partial while the input streams, and unchecked if the input was invalid
  const path = (part.input as { path?: unknown } | null | undefined)?.path

  return (
    <Marker
      className={status === "failed" ? "text-destructive" : undefined}
      title={error}
    >
      <MarkerIcon>
        {status === "active" && <Spinner />}
        {status === "done" && <CheckIcon />}
        {status === "failed" && <CircleAlertIcon />}
      </MarkerIcon>
      <MarkerContent>
        {typeof path === "string" && path ? `${verb} ${path}` : verb}
      </MarkerContent>
    </Marker>
  )
}

function AskPlayerQuestion({
  input,
  disabled,
  onAnswer,
}: {
  input: AskPlayer["input"]
  disabled: boolean
  onAnswer: (output: AskPlayer["output"]) => void
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Enter submits past the disabled button, and an answer given mid-stream
    // would never be sent, as useChat only auto-sends when idle
    if (disabled) return

    const optionId = new FormData(event.currentTarget).get("answer")
    const option = input.options.find(({ id }) => id === optionId)

    if (option) onAnswer({ optionId: option.id, label: option.label })
  }

  return (
    <Questionnaire onSubmit={submit} className="rounded-lg border p-4">
      <QuestionnaireItem name="answer" required>
        <QuestionnaireTitle>{input.question}</QuestionnaireTitle>
        <QuestionnaireChoices>
          {input.options.map((option) => (
            <QuestionnaireChoice key={option.id} value={option.id}>
              {option.label}
              <QuestionnaireChoiceDescription>
                {option.description}
              </QuestionnaireChoiceDescription>
            </QuestionnaireChoice>
          ))}
        </QuestionnaireChoices>
        <QuestionnaireError />
      </QuestionnaireItem>
      <QuestionnaireActions>
        <QuestionnaireSubmit disabled={disabled}>
          Build this
        </QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  )
}

function AskPlayerAnswer({
  question,
  answer,
}: {
  question: string
  answer: string
}) {
  return (
    <div className="flex w-full flex-col gap-1 rounded-lg border p-4 text-sm">
      <p className="text-muted-foreground">{question}</p>
      <p className="font-medium">{answer}</p>
    </div>
  )
}

function OutOfCreditsNotice() {
  return (
    <div className="flex w-full flex-col gap-1 rounded-lg border p-4 text-sm">
      <p className="font-medium">You&apos;re out of credits</p>
      <p className="text-muted-foreground">
        This build didn&apos;t start. Add credits on the{" "}
        <Link href="/billing" className="text-foreground underline">
          billing page
        </Link>
        , then send your message again.
      </p>
    </div>
  )
}

function AssistantAvatar() {
  return (
    <MessageAvatar className="size-8 self-start rounded-lg bg-transparent">
      <Image
        src="/logo.svg"
        alt="Sandbox"
        width={32}
        height={32}
        className="size-8"
      />
    </MessageAvatar>
  )
}

// The helper alone also matches a turn that ended on a server tool step, such
// as one cut off by the step limit, which would start a new turn by itself
function isAskPlayerAnswered({ messages }: { messages: GameMessage[] }) {
  if (!lastAssistantMessageIsCompleteWithToolCalls({ messages })) return false

  const parts = messages.at(-1)?.parts ?? []
  const lastStepStart = parts.findLastIndex(
    (part) => part.type === "step-start"
  )

  return parts
    .slice(lastStepStart + 1)
    .some(
      (part) =>
        part.type === "tool-ask_player" && part.state === "output-available"
    )
}

export function ChatThread({
  gameId,
  initialModelId,
  initialMessages,
  session,
  onTurnFinish,
}: {
  gameId: string
  initialModelId: GameModelId
  initialMessages: UIMessage[]
  // Stored after each turn, so a reload resumes the stream
  session?: ChatSessionPersistedState
  onTurnFinish?: () => void
}) {
  const router = useRouter()
  const [modelId, setModelId] = useState(initialModelId)
  const clientData = useMemo(() => ({ modelId }), [modelId])
  const transport = useTriggerChatTransport<typeof gameChat>({
    task: "game-chat",
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    // A blocked start comes back as a value, as server action errors are
    // redacted in production. Thrown here, it reaches useChat's error intact
    startSession: async ({ chatId, clientData }) => {
      const result = await startChatSession({ chatId, clientData })
      if ("outOfCredits" in result) throw new Error(OUT_OF_CREDITS_ERROR)
      return result
    },
    clientData,
    sessions: session && { [gameId]: session },
  })
  // The stored reply a resumed turn may continue, read once on mount. Only a
  // thread ending on a reply can be continued; otherwise nothing is filtered
  const [resumedHeadId] = useState(() => {
    const head = initialMessages.at(-1)
    return head?.role === "assistant" ? head.id : undefined
  })
  const chatTransport = useMemo(
    (): ChatTransport<GameMessage> => ({
      sendMessages: (options) => transport.sendMessages(options),
      // A turn that continues a message, such as the reply to an ask_player
      // answer, starts with that message's id. A resumed stream starts from an
      // empty message, so useChat would replace the stored one with it and drop
      // the question and answer. Without the chunk, the rest of the turn is
      // appended as its own message instead
      reconnectToStream: async (options) => {
        const stream = await transport.reconnectToStream(options)
        if (!stream || !resumedHeadId) return stream

        return stream.pipeThrough(
          new TransformStream<UIMessageChunk, UIMessageChunk>({
            transform(chunk, controller) {
              if (chunk.type === "start" && chunk.messageId === resumedHeadId) {
                return
              }
              controller.enqueue(chunk)
            },
          })
        )
      },
    }),
    [transport, resumedHeadId]
  )
  const { messages, sendMessage, addToolOutput, stop, status, error } =
    useChat<GameMessage>({
      id: gameId,
      // Stored as plain UIMessages, with the shape the tools produced
      messages: initialMessages as GameMessage[],
      transport: chatTransport,
      resume: !!session,
      sendAutomaticallyWhen: isAskPlayerAnswered,
      // The agent sends this after charging a step. The balance is rendered by
      // the server layout, so refresh it to show the new amount
      onData: (part) => {
        if (part.type === "data-credits") router.refresh()
      },
      onFinish: () => onTurnFinish?.(),
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
  // Recomputed from the parts, so parallel questions get answered in turn
  const pendingQuestion = messages
    .at(-1)
    ?.parts.findLast(
      (part) =>
        part.type === "tool-ask_player" && part.state === "input-available"
    )

  return (
    <div className="flex h-full flex-col">
      <MessageScrollerProvider defaultScrollPosition="end">
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-8">
              {messages.map((message) => (
                <MessageScrollerItem key={message.id} messageId={message.id}>
                  <Message align={message.role === "user" ? "end" : "start"}>
                    {message.role === "assistant" && <AssistantAvatar />}
                    <MessageContent>
                      <Bubble
                        variant={
                          message.role === "user" ? "secondary" : "ghost"
                        }
                        align={message.role === "user" ? "end" : "start"}
                      >
                        <BubbleContent className="flex flex-col items-start gap-2">
                          {message.parts.map((part, index) => {
                            if (isToolUIPart(part)) {
                              if (
                                part.type === "tool-ask_player" &&
                                part.state === "output-available"
                              ) {
                                return (
                                  <AskPlayerAnswer
                                    key={part.toolCallId}
                                    question={part.input.question}
                                    answer={part.output.label}
                                  />
                                )
                              }

                              if (
                                part.type === "tool-ask_player" &&
                                part.state === "input-available" &&
                                part === pendingQuestion
                              ) {
                                return (
                                  <AskPlayerQuestion
                                    key={part.toolCallId}
                                    input={part.input}
                                    disabled={generating}
                                    onAnswer={(output) =>
                                      addToolOutput({
                                        tool: "ask_player",
                                        toolCallId: part.toolCallId,
                                        output,
                                      })
                                    }
                                  />
                                )
                              }

                              return (
                                <ToolCallMarker
                                  key={part.toolCallId}
                                  part={part}
                                />
                              )
                            }

                            // The reply of a turn the run blocked
                            if (part.type === OUT_OF_CREDITS_PART) {
                              return <OutOfCreditsNotice key={index} />
                            }

                            if (part.type !== "text") return null

                            return message.role === "assistant" ? (
                              <Markdown key={index}>{part.text}</Markdown>
                            ) : (
                              <span key={index} className="whitespace-pre-wrap">
                                {part.text}
                              </span>
                            )
                          })}
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              ))}
              {/* A session start was blocked, so no run exists to reply. Not
                  stored: useChat clears it when the next message is sent */}
              {error?.message === OUT_OF_CREDITS_ERROR && (
                <MessageScrollerItem messageId="out-of-credits">
                  <Message align="start">
                    <AssistantAvatar />
                    <MessageContent>
                      <Bubble variant="ghost" align="start">
                        <BubbleContent className="flex flex-col items-start gap-2">
                          <OutOfCreditsNotice />
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              )}
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
          modelId={modelId}
          onModelChange={setModelId}
          disabled={generating || !!pendingQuestion}
          onStop={generating ? cancel : undefined}
          placeholder="Ask for a change…"
        />
      </div>
    </div>
  )
}
