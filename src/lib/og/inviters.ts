const MAX_NAMED = 3

/**
 * The people line on an invite card: "Peter, Mária and Janka invite you to".
 * Past three names the rest collapse into "and N others"; with nobody named it
 * falls back to a plain invitation.
 */
export function inviteLine(names: (string | null | undefined)[]): string {
  const named = names.map((name) => name?.trim()).filter((name): name is string => Boolean(name))
  if (named.length === 0) return "You're invited to"
  if (named.length === 1) return `${named[0]} invites you to`

  const shown = named.length > MAX_NAMED ? named.slice(0, MAX_NAMED) : named.slice(0, -1)
  const rest = named.length > MAX_NAMED ? `${named.length - MAX_NAMED} others` : named[named.length - 1]
  return `${shown.join(', ')} and ${rest} invite you to`
}
