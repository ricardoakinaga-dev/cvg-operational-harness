/**
 * SPEC0259 §4.11 (DB10) — login pacer of the three-host proof. Every browser
 * context leaves through the same edge address, so the real start (10/min)
 * and callback (30/min) limiters see one client. The edge releases at most
 * 9 starts and 25 callbacks in any 70 s window, counted by release time, and
 * waits when needed. A flow that needs several slots without a wait in the
 * middle (Q9i2, Q9i3) reserves them at once: the reservation succeeds only
 * when the releases of the last 70 s plus the reserved slots fit the limit,
 * so every window that contains a reserved release still fits.
 */
export type PacedKind = 'start' | 'callback'

export const PACER_WINDOW_MS = 70_000
export const PACER_LIMITS: Readonly<Record<PacedKind, number>> = {
  start: 9,
  callback: 25
}

interface Waiter {
  readonly kind: PacedKind
  readonly resolve: () => void
}

export class LoginPacer {
  private readonly releases: Record<PacedKind, number[]> = {
    start: [],
    callback: []
  }
  private readonly reserved: Record<PacedKind, number> = {
    start: 0,
    callback: 0
  }
  private readonly waiters: Waiter[] = []
  private timer: NodeJS.Timeout | undefined

  constructor(private readonly now: () => number = Date.now) {}

  private recent(kind: PacedKind): number {
    const since = this.now() - PACER_WINDOW_MS
    const list = this.releases[kind]
    while (list.length > 0 && list[0]! <= since) list.shift()
    return list.length
  }

  private fits(kind: PacedKind, count: number): boolean {
    return this.recent(kind) + this.reserved[kind] + count <= PACER_LIMITS[kind]
  }

  /** Releases one request: immediately from a reservation, else when it fits. */
  async release(kind: PacedKind): Promise<number> {
    if (this.reserved[kind] > 0) {
      this.reserved[kind] -= 1
    } else if (!this.fits(kind, 1)) {
      await new Promise<void>((resolve) => {
        this.waiters.push({ kind, resolve })
        this.schedule()
      })
      // `wake` held one slot for this waiter.
      this.reserved[kind] -= 1
    }
    const at = this.now()
    this.releases[kind].push(at)
    return at
  }

  /** Reserves slots for a flow that cannot wait between its requests. */
  async reserve(slots: Partial<Record<PacedKind, number>>): Promise<void> {
    for (;;) {
      const ok = (Object.keys(slots) as PacedKind[]).every((kind) =>
        this.fits(kind, slots[kind] ?? 0)
      )
      if (ok) {
        for (const kind of Object.keys(slots) as PacedKind[]) {
          this.reserved[kind] += slots[kind] ?? 0
        }
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }

  /** Drops slots a flow reserved and did not use. */
  cancelReservations(): void {
    this.reserved.start = 0
    this.reserved.callback = 0
    this.wake()
  }

  private schedule(): void {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.wake()
    }, 250)
  }

  private wake(): void {
    for (let index = 0; index < this.waiters.length; ) {
      const waiter = this.waiters[index]!
      if (this.fits(waiter.kind, 1)) {
        this.waiters.splice(index, 1)
        // Count it now so the next waiter sees this release.
        this.reserved[waiter.kind] += 1
        waiter.resolve()
      } else {
        index += 1
      }
    }
    if (this.waiters.length > 0) this.schedule()
  }

  snapshot() {
    return {
      start: this.recent('start'),
      callback: this.recent('callback'),
      reserved: { ...this.reserved },
      waiting: this.waiters.length
    }
  }
}
