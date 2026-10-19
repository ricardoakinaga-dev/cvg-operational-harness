// Loader hooks (probe only): wrap the process helper of build-installed-reference.mjs
// and node:child_process of boundary-semantic-compiled.mjs to record argv/stdout.
// Nothing in the candidate is modified; the real modules are re-exported.
const WRAP_OWNED = new URL('./wrap-owned.mjs', import.meta.url).href
const WRAP_CP = new URL('./wrap-cp.mjs', import.meta.url).href
export async function resolve(specifier, context, next) {
  const parent = context.parentURL ?? ''
  if (specifier === './boundary-reference-process.mjs' && /\/build-installed-reference\.mjs$/.test(parent)) {
    const real = new URL(specifier, parent).href
    return { url: WRAP_OWNED + '?real=' + encodeURIComponent(real), shortCircuit: true }
  }
  if (specifier === 'node:child_process' && /\/boundary-semantic-compiled\.mjs$/.test(parent))
    return { url: WRAP_CP, shortCircuit: true }
  return next(specifier, context)
}
