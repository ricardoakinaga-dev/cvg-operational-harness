// P1: largest array that `result.push(...array)` accepts in this Node (default stack).
const out = { node: process.version, stack: 'default', results: [] }
for (const n of [50000, 100000, 110000, 120000, 125000, 130000, 150000, 200000, 400000]) {
  const arr = Array.from({ length: n }, (_, i) => '100644 p/' + i)
  const result = []
  try { result.push(...arr); out.results.push({ n, ok: true, len: result.length }) }
  catch (e) { out.results.push({ n, ok: false, error: e.constructor.name + ': ' + e.message }) }
}
// binary search the threshold
let lo = 1, hi = 1_000_000
while (lo < hi) { const mid = (lo + hi + 1) >> 1; try { [].push(...new Array(mid).fill('x')); lo = mid } catch { hi = mid - 1 } }
out.maxSpreadPush = lo
console.log(JSON.stringify(out, null, 2))
