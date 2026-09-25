import { randomBytes } from 'crypto'

export function generateInviteToken(): string {
  return randomBytes(16).toString('hex')
}

export function isValidInviteToken(token: string): boolean {
  return /^[a-f0-9]{32}$/.test(token)
}

/** Accepts what people actually paste — the whole invite link — as well as a bare token. */
export function extractInviteToken(input: string): string | null {
  const trimmed = input.trim()
  if (isValidInviteToken(trimmed)) return trimmed
  const match = trimmed.match(/\/join\/([a-f0-9]{32})(?:[/?#]|$)/)
  return match ? match[1] : null
}

export function inviteUrl(token: string): string {
  return `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/join/${token}`
}
