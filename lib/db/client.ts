import { parseEnv } from "@neon/env"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import neonConfig from "@/neon"
import * as schema from "./schema"

// No "server-only" here: the Trigger.dev worker imports this directly. Next.js
// code should import from "@/lib/db", which keeps the guard.
const { postgres } = parseEnv(neonConfig, ["DATABASE_URL"])

const globalForDb = globalThis as unknown as { pool?: Pool }

const pool =
  globalForDb.pool ?? new Pool({ connectionString: postgres.databaseUrl })

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool

export const db = drizzle(pool, { schema })

export * from "./schema"
