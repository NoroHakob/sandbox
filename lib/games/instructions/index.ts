import type { Instructions } from "ai"

import { runtime } from "@/lib/games/instructions/runtime"
import { workflow } from "@/lib/games/instructions/workflow"

export const gameInstructions = [
  { role: "system", content: workflow },
  { role: "system", content: runtime },
] satisfies Instructions
