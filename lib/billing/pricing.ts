import type { LanguageModelUsage } from "ai"

import type { GameModelId } from "@/lib/games/model-catalog"
import { NANODOLLARS_PER_DOLLAR } from "./format"

// No "server-only": the Trigger.dev worker prices steps with this

const TOKENS_PER_MILLION = BigInt(1_000_000)

// Dollars per million tokens, as nanodollars per million tokens. Rounded once
// here, so every amount after this is integer math
function perMillion(dollars: number) {
  return BigInt(Math.round(dollars * Number(NANODOLLARS_PER_DOLLAR)))
}

type ModelPrice = {
  input: bigint
  cachedInput: bigint
  output: bigint
}

// OpenAI doesn't charge cache writes separately: they're billed as input
export const gameModelPrices = {
  "gpt-6-astra": {
    input: perMillion(10),
    cachedInput: perMillion(1),
    output: perMillion(50),
  },
  "gpt-6-sol": {
    input: perMillion(2),
    cachedInput: perMillion(0.2),
    output: perMillion(10),
  },
  "gpt-6-luna": {
    input: perMillion(0.1),
    cachedInput: perMillion(0.01),
    output: perMillion(0.5),
  },
} satisfies Record<GameModelId, ModelPrice>

function tokens(count: number | undefined) {
  return BigInt(Math.max(0, count ?? 0))
}

// Cost of one step in nanodollars, rounded up to a whole nanodollar.
// inputTokens counts cached reads too, so fresh input is the remainder.
// outputTokens already includes reasoning tokens
export function priceUsage(modelId: GameModelId, usage: LanguageModelUsage) {
  const price = gameModelPrices[modelId]
  const cached = tokens(usage.inputTokenDetails.cacheReadTokens)
  const input = tokens(usage.inputTokens)
  const fresh = input > cached ? input - cached : BigInt(0)
  const output = tokens(usage.outputTokens)

  const total =
    fresh * price.input + cached * price.cachedInput + output * price.output

  return (total + TOKENS_PER_MILLION - BigInt(1)) / TOKENS_PER_MILLION
}
