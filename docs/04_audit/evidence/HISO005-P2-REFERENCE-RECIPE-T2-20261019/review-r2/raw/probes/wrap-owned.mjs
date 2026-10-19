const real = new URL(import.meta.url).searchParams.get('real')
const m = await import(real)
export const referenceEnvironment = m.referenceEnvironment
export const unavailable = m.unavailable
export async function runOwnedProcess(tool, args, options = {}) {
  const row = { tool, args: [...args] }
  ;(globalThis.__ownedLog ??= []).push(row)
  try {
    const r = await m.runOwnedProcess(tool, args, options)
    row.ok = true
    if (args.includes('ls-tree') && r.stdout) row.stdout = Buffer.from(r.stdout)
    return r
  } catch (e) {
    row.ok = false
    row.code = e.code
    throw e
  }
}
