/**
 * AUD19-012 / RA25-03 — internal documentation link checker.
 *
 * Scans Markdown files for relative links ([text](path), [text]: path,
 * <path>) and reports targets that do not exist on disk. A terminal `:line`
 * suffix is treated as source location metadata, not as part of the filename.
 * Absolute URLs, absolute filesystem paths and mailto: links are reported
 * separately as non-portable/external, never as broken-internal.
 *
 * Extraction runs against a masked copy of the source: fenced code blocks and
 * paired inline code spans are blanked out first, and a link destination may
 * not cross a line ending. Without that boundary a link-like fragment inside a
 * code span (for example `[label](destination)`) runs forward to the next ")"
 * in prose and is reported as a broken link. Normative rules: SPEC-DOC-002 in
 * docs/02_spec/0130_doc_link_checker_extraction.md.
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

const linkPattern = /\[[^\]]*\]\(([^)\n]+)\)|^\s*\[[^\]]+\]:\s*(\S+)/gm
const anglePattern =
  /<((?:\.{1,2}\/|\/)[^<>\s]+\.md(?:#[^<>\s]*)?(?::[1-9]\d*)?)>/g
const fencePattern = /^ {0,3}(`{3,}|~{3,})(.*)$/
const fenceClosePattern = /^ {0,3}(`{3,}|~{3,})[ \t]*$/

/**
 * R2 — pair backtick runs on a single line and blank the whole span.
 * A run of length N closes on the next run of exactly length N on the same
 * line; an unpaired run is literal text and masks nothing (SPEC-DOC-002 R2).
 * Replacements are spaces so character offsets and line numbers are stable.
 */
function maskCodeSpans(line) {
  let out = line
  let i = 0
  while (i < out.length) {
    if (out[i] !== '`') {
      i += 1
      continue
    }
    let j = i
    while (j < out.length && out[j] === '`') j += 1
    const runLength = j - i
    let k = j
    let close = -1
    while (k < out.length) {
      if (out[k] !== '`') {
        k += 1
        continue
      }
      let l = k
      while (l < out.length && out[l] === '`') l += 1
      if (l - k === runLength) {
        close = k
        break
      }
      k = l
    }
    if (close < 0) {
      i = j
      continue
    }
    const end = close + runLength
    out = `${out.slice(0, i)}${' '.repeat(end - i)}${out.slice(end)}`
    i = end
  }
  return out
}

/**
 * R1 — blank fenced code blocks, then inline code spans on the remaining
 * lines. R1b: a fence never closed before end of file masks nothing, so a
 * genuinely broken link can never be hidden by a missing delimiter.
 */
function maskSource(text) {
  const lines = text.split('\n')
  const masked = new Array(lines.length)
  let i = 0
  while (i < lines.length) {
    const open = fencePattern.exec(lines[i])
    const info = open ? open[2] : ''
    const isFence = Boolean(open) && !(open[1][0] === '`' && info.includes('`'))
    if (isFence) {
      const marker = open[1][0]
      const openLength = open[1].length
      let closeIndex = -1
      for (let k = i + 1; k < lines.length; k += 1) {
        const close = fenceClosePattern.exec(lines[k])
        if (close && close[1][0] === marker && close[1].length >= openLength) {
          closeIndex = k
          break
        }
      }
      if (closeIndex >= 0) {
        for (let k = i; k <= closeIndex; k += 1) {
          masked[k] = ' '.repeat(lines[k].length)
        }
        i = closeIndex + 1
        continue
      }
    }
    masked[i] = maskCodeSpans(lines[i])
    i += 1
  }
  return masked.join('\n')
}

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
    // R3 — extract only from source with code blocks and code spans blanked.
    const text = maskSource(readFileSync(file, 'utf8'))
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
