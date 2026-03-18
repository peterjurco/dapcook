import { randomBytes } from 'crypto'

export function generateInviteToken(): string {
  return randomBytes(16).toString('hex')
}

export function isValidInviteToken(token: string): boolean {
  return /^[a-f0-9]{32}$/.test(token)
}
