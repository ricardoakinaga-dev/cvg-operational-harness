// Synthetic probe (no network, no port): the real InMemoryRateLimiter of
// apps/api/src/rate-limit.ts (anchored window, same rule as the PG limiter's
// SQL) against the r2 pacer "at most N releases in any W ms of release time,
// waiting when needed" (SPEC0259 r2 §4.11 / DB10). Server time = release time
// + an end-to-end delay in [0, D]. Counts start denials (policy 10 / 60 s).
import { InMemoryRateLimiter } from '/mnt/dados/cvg-work/cvg-d9ef-u08-oidc-b-20261023/apps/api/src/rate-limit.ts'

function rng(seed: number) { let x = seed >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32) }

function run(seed: number, N: number, W: number, D: number, starts: number) {
  const rand = rng(seed)
  const releases: number[] = []
  let t = 0
  for (let i = 0; i < starts; i++) {
    // demand: flows ask for a start every 0–3 s (bursty matrix)
    t += Math.floor(rand() * 3000)
    const inWindow = releases.filter((r) => r > t - W)
    if (inWindow.length >= N) t = Math.max(t, inWindow[inWindow.length - N]! + W)
    releases.push(t)
  }
  const events = releases.map((r) => r + Math.floor(rand() * D)).sort((a, b) => a - b)
  let now = 0
  const limiter = new InMemoryRateLimiter({ now: () => now })
  let denied = 0
  for (const s of events) {
    now = s
    const res = limiter.check('oidc:start:ip:198.51.100.7', { max: 10, windowMs: 60_000 })
    if (!res.allowed) denied++
  }
  return denied
}

for (const [label, N, W, D] of [
  ['r2: 9 per 60 s, delay ≤ 300 ms', 9, 60_000, 300],
  ['r2: 9 per 60 s, delay ≤ 2 s', 9, 60_000, 2_000],
  ['fix: 9 per 70 s, delay ≤ 2 s', 9, 70_000, 2_000],
  ['fix: 9 per 70 s, delay ≤ 5 s', 9, 70_000, 5_000]
] as const) {
  let runsWithDenial = 0
  const trials = 2000
  for (let seed = 1; seed <= trials; seed++) if (run(seed, N, W, D, 40) > 0) runsWithDenial++
  console.log(JSON.stringify({ label, trials, runsWithDenial }))
}
