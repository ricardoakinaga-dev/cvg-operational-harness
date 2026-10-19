import { createHash } from 'node:crypto'

export function createSenderRefFingerprint(
  tenantId: string,
  senderRef: string
): string {
  return createHash('sha256')
    .update(`${tenantId}\u0000${senderRef}`, 'utf8')
    .digest('hex')
}
