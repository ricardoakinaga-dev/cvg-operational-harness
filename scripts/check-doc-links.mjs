/**
 * AUD19-012 — internal documentation link checker.
 *
 * Scans Markdown files for relative links ([text](path), [text]: path,
 * <path>) and reports targets that do not exist on disk. A terminal `:line`
 * suffix is treated as source location metadata, not as part of the filename.
 * Absolute URLs, absolute filesystem paths and mailto: links are reported
 * separately as non-portable/external, never as broken-internal.
 *
 * Usage: node scripts/check-doc-links.mjs [roots...]
 * Exit 0 when no broken internal link exists in the scanned roots.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

const roots = process.argv.slice(2)
if (roots.length === 0) {
  console.error('usage: node scripts/check-doc-links.mjs <root...>')
  process.exit(2)
}

function walkMarkdown(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '.git') continue
      walkMarkdown(full, out)
    } else if (entry.endsWith('.md')) {
      out.push(full)
    }
  }
  return out
}

const linkPattern = /\[[^\]]*\]\(([^)]+)\)|^\s*\[[^\]]+\]:\s*(\S+)/gm
const anglePattern =
  /<((?:\.{1,2}\/|\/)[^<>\s]+\.md(?:#[^<>\s]*)?(?::[1-9]\d*)?)>/g

const broken = []
const nonPortableAbsolute = []
const unallowlistedNonPortableAbsolute = []

const policyPath = resolve(
  process.env.DOC_LINK_POLICY ?? 'docs/doc-link-policy.json'
)
let linkPolicy = { schemaVersion: 1, entries: [] }
if (existsSync(policyPath)) {
  try {
    linkPolicy = JSON.parse(readFileSync(policyPath, 'utf8'))
  } catch (error) {
    console.error(`DOC_LINK_POLICY_INVALID=${error.message}`)
    process.exit(1)
  }
}

function relativeFile(file) {
  return relative(process.cwd(), file).split(sep).join('/')
}

function isAllowlistedAbsolute(file, target) {
  const filePolicy = linkPolicy.entries?.find(
    (entry) => entry.file === relativeFile(file)
  )
  return Boolean(
    filePolicy?.targetSuffixes?.some((suffix) => target.endsWith(suffix))
  )
}

function parseTarget(rawTarget) {
  let target = rawTarget.trim()
  const hashIndex = target.indexOf('#')
  if (hashIndex >= 0) target = target.slice(0, hashIndex)

  target = target.replace(/:[1-9]\d*$/, '')

  return { path: target }
}

for (const root of roots) {
  const resolved = resolve(root)
  const stat = statSync(resolved)
  const files = stat.isDirectory()
    ? walkMarkdown(resolved)
    : stat.isFile() && resolved.endsWith('.md')
      ? [resolved]
      : []
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const candidates = new Set()
    for (const match of text.matchAll(linkPattern)) {
      const target = (match[1] ?? match[2] ?? '').trim()
      if (target) candidates.add(target)
    }
    for (const match of text.matchAll(anglePattern)) {
      candidates.add(match[1].trim())
    }
    for (let target of candidates) {
      if (
        target.startsWith('http://') ||
        target.startsWith('https://') ||
        target.startsWith('mailto:') ||
        target.startsWith('#')
      ) {
        continue
      }
      // Angle-bracket autolinks captured inside parens: strip the brackets.
      // A dangling leading `<` (unclosed absolute reference with a :line
      // suffix, as found in frozen critic reports) is also stripped here
      // and classified below as a non-portable absolute reference.
      if (target.startsWith('<') && target.endsWith('>')) {
        target = target.slice(1, -1).trim()
      } else if (target.startsWith('<')) {
        target = target.slice(1).trim()
      }
      const parsed = parseTarget(target)
      if (!parsed.path) continue
      if (parsed.path.startsWith('/')) {
        const allowed = isAllowlistedAbsolute(file, target)
        nonPortableAbsolute.push({
          file,
          target,
          policy: allowed ? 'historical-preserved' : 'unclassified'
        })
        if (!allowed) {
          unallowlistedNonPortableAbsolute.push({ file, target })
        }
        continue
      }
      const decoded = decodeURIComponent(parsed.path)
      const absolute = resolve(dirname(file), decoded)
      if (!existsSync(absolute)) broken.push({ file, target })
    }
  }
}

console.log(
  JSON.stringify(
    {
      scannedRoots: roots,
      broken,
      nonPortableAbsolute,
      unallowlistedNonPortableAbsolute
    },
    null,
    2
  )
)
if (broken.length > 0 || unallowlistedNonPortableAbsolute.length > 0) {
  if (broken.length > 0) {
    console.error(`BROKEN_INTERNAL_LINKS=${broken.length}`)
  }
  if (unallowlistedNonPortableAbsolute.length > 0) {
    console.error(
      `UNALLOWLISTED_NON_PORTABLE_ABSOLUTES=${unallowlistedNonPortableAbsolute.length}`
    )
  }
  process.exit(1)
}
console.error('DOC_LINKS_OK')
