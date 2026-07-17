import { randomBytes } from 'node:crypto'

export function createShareToken(): string {
  return randomBytes(24).toString('base64url')
}
