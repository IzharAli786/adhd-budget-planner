// The hello at the top of Today: "Hi Sam", or "Hi there" with no name. Pure and tested.

/** Longest display name kept; it only has to fit one line above the numbers. */
export const DISPLAY_NAME_MAX = 40

/** "Hi Sam" (spaces tidied, capped), or "Hi there" when no name is set. */
export function greeting(name = ''): string {
  const who = name.trim().replace(/\s+/g, ' ').slice(0, DISPLAY_NAME_MAX)
  return who ? `Hi ${who}` : 'Hi there'
}
