/** Format a credit amount as a dollar string. 1 credit = $1. */
export function formatDollars(credits: number): string {
  return `$${credits}`
}
