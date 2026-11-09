// No "server-only": plain math with no secrets, safe to use from either side

export const NANODOLLARS_PER_DOLLAR = BigInt(1_000_000_000)

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

// Ledger amounts are nanodollars. Split into whole dollars and a fraction
// before going to a number, so large balances keep their cents exact
export function formatCredits(amount: bigint) {
  const dollars = amount / NANODOLLARS_PER_DOLLAR
  const fraction = amount % NANODOLLARS_PER_DOLLAR

  return usd.format(
    Number(dollars) + Number(fraction) / Number(NANODOLLARS_PER_DOLLAR)
  )
}
