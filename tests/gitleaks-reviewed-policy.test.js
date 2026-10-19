// @vitest-environment node
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadReviewedExceptions } from '../scripts/gitleaks-reviewed-policy.mjs'

const roots = []
const hash = (value) => createHash('sha256').update(value).digest('hex')
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const exactLiteral = (value) => {
  const body = escape(value)
  return `^${/^[a-fA-F0-9]{40}$/.test(value) ? `${body.slice(0, 20)}(?:)${body.slice(20)}` : body}$`
}

function fixture(options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reviewed-policy-'))
  roots.push(root)
  const literal = options.literal ?? randomBytes(20).toString('hex')
  const relative = options.path ?? 'docs/synthetic-fixture[1].txt'
  const template = 'api_key = "{literal}"'
  const source = `Synthetic test only\n${template.replace('{literal}', literal)}\n`
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true })
  fs.writeFileSync(path.join(root, relative), source)
  const entry = {
    detector: 'generic-api-key',
    path: relative,
    digest: hash(literal),
    sourceDigest: hash(source),
    template,
    reason: 'Generated synthetic unit fixture',
    lines: [2]
  }
  const manifest = {
    schemaVersion: 1,
    gitleaksVersion: '8.28.0',
    entries: [entry]
  }
  const block = {
    description: `Reviewed literal ${entry.digest}`,
    condition: 'AND',
    paths: [`^${escape(relative)}$`],
    regexTarget: 'secret',
    regexes: [exactLiteral(literal)]
  }
  const state = {
    root,
    literal,
    relative,
    source,
    entry,
    manifest,
    block,
    before: '[extend]\nuseDefault = true\n[[rules]]\nid = "generic-api-key"\n',
    header: '',
    extra: '',
    after: '',
    save() {
      fs.writeFileSync(
        path.join(root, '.gitleaks-reviewed.json'),
        JSON.stringify(manifest)
      )
      fs.writeFileSync(
        path.join(root, '.gitleaks.toml'),
        `${this.before}# BEGIN REVIEWED EXACT FINDINGS\n${this.header}[[rules.allowlists]]\n${Object.entries(
          block
        )
          .map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
          .join(
            '\n'
          )}\n${this.extra}# END REVIEWED EXACT FINDINGS\n${this.after}`
      )
    }
  }
  state.save()
  return state
}

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

describe('reviewed exact exception policy', () => {
  it('loads the exact pair and returns the verified literal without logging it', () => {
    const f = fixture()
    const entries = loadReviewedExceptions(f.root)
    expect(entries.length).toBe(1)
    expect(hash(entries[0].literal)).toBe(f.entry.digest)
    expect(entries[0].path).toBe(f.relative)
    expect(entries[0].sourceDigest).toBe(hash(f.source))
  })

  it('escapes only JS regex metacharacters, retaining slash and hyphen literally', () => {
    const f = fixture({
      literal: `${randomBytes(12).toString('hex')}-/.+?[](){}|\\^$`
    })
    expect(hash(loadReviewedExceptions(f.root)[0].literal)).toBe(f.entry.digest)
  })

  it('accepts a single inherited sourcegraph rule switch', () => {
    const f = fixture()
    f.entry.detector = 'sourcegraph-access-token'
    f.header = '[[rules]]\nid = "sourcegraph-access-token"\n'
    f.save()
    expect(loadReviewedExceptions(f.root)[0].detector).toBe(
      'sourcegraph-access-token'
    )
  })

  it('ignores existing config outside the delimited region', () => {
    const f = fixture()
    f.before += '# Existing allowlists belong to their separate guard\n'
    f.after = '# Unrelated trailing config\n'
    f.save()
    expect(loadReviewedExceptions(f.root).length).toBe(1)
  })

  const invalidBlocks = [
    [
      'OR permits path-only or value-only exceptions',
      (f) => {
        f.block.condition = 'OR'
      }
    ],
    [
      'implicit OR',
      (f) => {
        delete f.block.condition
      }
    ],
    [
      'wrong regex target',
      (f) => {
        f.block.regexTarget = 'match'
      }
    ],
    [
      'loose path',
      (f) => {
        f.block.paths = [f.relative]
      }
    ],
    [
      'directory wildcard',
      (f) => {
        f.block.paths = ['^docs/.*$']
      }
    ],
    [
      'path alternation',
      (f) => {
        f.block.paths = [`^${escape(f.relative)}$|elsewhere`]
      }
    ],
    [
      'two paths',
      (f) => {
        f.block.paths.push('^elsewhere$')
      }
    ],
    [
      'non-array path',
      (f) => {
        f.block.paths = f.block.paths[0]
      }
    ],
    [
      'escaped slash',
      (f) => {
        f.block.paths[0] = f.block.paths[0].replace('/', '\\/')
      }
    ],
    [
      'escaped hyphen',
      (f) => {
        f.block.paths[0] = f.block.paths[0].replace('-', '\\-')
      }
    ],
    [
      'broad value',
      (f) => {
        f.block.regexes = ['^.*$']
      }
    ],
    [
      'character class',
      (f) => {
        f.block.regexes = ['^[a-f0-9]{40}$']
      }
    ],
    [
      'alternation',
      (f) => {
        f.block.regexes = ['^left|right$']
      }
    ],
    [
      'capture group',
      (f) => {
        f.block.regexes = ['^(value)$']
      }
    ],
    [
      'quantifier',
      (f) => {
        f.block.regexes = ['^value+$']
      }
    ],
    [
      'shorthand character class',
      (f) => {
        f.block.regexes = ['^\\w+$']
      }
    ],
    [
      'encoded character',
      (f) => {
        f.block.regexes = ['^\\x61$']
      }
    ],
    [
      'empty value',
      (f) => {
        f.block.regexes = ['^$']
      }
    ],
    [
      'missing anchors',
      (f) => {
        f.block.regexes = [f.literal]
      }
    ],
    [
      'two values',
      (f) => {
        f.block.regexes.push('^extra$')
      }
    ],
    [
      'non-array values',
      (f) => {
        f.block.regexes = f.block.regexes[0]
      }
    ],
    [
      'wrong literal digest',
      (f) => {
        f.block.regexes = [exactLiteral(randomBytes(20).toString('hex'))]
      }
    ],
    [
      'wrong description',
      (f) => {
        f.block.description = 'Unreviewed'
      }
    ],
    [
      '40hex without self-heuristic break',
      (f) => {
        f.block.regexes = [`^${f.literal}$`]
      }
    ],
    [
      'break in wrong position',
      (f) => {
        f.block.regexes = [
          `^${f.literal.slice(0, 19)}(?:)${f.literal.slice(19)}$`
        ]
      }
    ],
    [
      'duplicate breaks',
      (f) => {
        f.block.regexes[0] = f.block.regexes[0].replace('(?:)', '(?:)(?:)')
      }
    ],
    [
      'unknown allowlist key',
      (f) => {
        f.block.stopwords = ['value']
      }
    ],
    [
      'missing description',
      (f) => {
        delete f.block.description
      }
    ]
  ]
  it.each(invalidBlocks)('rejects %s', (_name, mutate) => {
    const f = fixture()
    mutate(f)
    f.save()
    expect(() => loadReviewedExceptions(f.root)).toThrow(
      /^Invalid reviewed Gitleaks policy:/
    )
  })

  const invalidManifests = [
    [
      'wrong schema',
      (f) => {
        f.manifest.schemaVersion = 2
      }
    ],
    [
      'missing schema',
      (f) => {
        delete f.manifest.schemaVersion
      }
    ],
    [
      'wrong scanner version',
      (f) => {
        f.manifest.gitleaksVersion = '8.27.0'
      }
    ],
    [
      'extra root key',
      (f) => {
        f.manifest.allowAll = true
      }
    ],
    [
      'empty manifest',
      (f) => {
        f.manifest.entries = []
      }
    ],
    [
      'duplicate manifest pair',
      (f) => {
        f.manifest.entries.push({ ...f.entry })
      }
    ],
    [
      'extra manifest entry',
      (f) => {
        f.manifest.entries.push({
          ...f.entry,
          detector: 'sourcegraph-access-token'
        })
      }
    ],
    [
      'unmanifested block',
      (f) => {
        f.entry.digest = hash('different synthetic value')
      }
    ],
    [
      'unsupported detector',
      (f) => {
        f.entry.detector = 'github-pat'
      }
    ],
    [
      'extra entry key',
      (f) => {
        f.entry.literal = 'unapproved'
      }
    ],
    [
      'missing entry key',
      (f) => {
        delete f.entry.reason
      }
    ],
    [
      'incorrect full source digest',
      (f) => {
        f.entry.sourceDigest = hash('changed')
      }
    ],
    [
      'empty reason',
      (f) => {
        f.entry.reason = ' '
      }
    ],
    [
      'template without placeholder',
      (f) => {
        f.entry.template = 'api_key = value'
      }
    ],
    [
      'two template placeholders',
      (f) => {
        f.entry.template = '{literal}{literal}'
      }
    ],
    [
      'missing source lines',
      (f) => {
        f.entry.lines = []
      }
    ],
    [
      'wrong source line',
      (f) => {
        f.entry.lines = [1]
      }
    ],
    [
      'zero source line',
      (f) => {
        f.entry.lines = [0]
      }
    ],
    [
      'duplicate source line',
      (f) => {
        f.entry.lines = [2, 2]
      }
    ],
    [
      'noninteger source line',
      (f) => {
        f.entry.lines = [2.5]
      }
    ],
    [
      'wrong path',
      (f) => {
        f.entry.path = 'different-file'
      }
    ]
  ]
  it.each(invalidManifests)('rejects manifest %s', (_name, mutate) => {
    const f = fixture()
    mutate(f)
    f.save()
    expect(() => loadReviewedExceptions(f.root)).toThrow(
      /^Invalid reviewed Gitleaks policy:/
    )
  })

  const invalidRegions = [
    ['unknown detector switch', '[[rules]]\nid = "github-pat"\n'],
    [
      'rule regex override',
      '[[rules]]\nid = "sourcegraph-access-token"\nregex = "broad"\n'
    ],
    [
      'rule keyword override',
      '[[rules]]\nid = "sourcegraph-access-token"\nkeywords = ["anything"]\n'
    ],
    [
      'rule entropy override',
      '[[rules]]\nid = "sourcegraph-access-token"\nentropy = 0\n'
    ],
    [
      'second rule switch',
      '[[rules]]\nid = "sourcegraph-access-token"\n[[rules]]\nid = "sourcegraph-access-token"\n'
    ],
    ['global allowlist', '[[allowlists]]\n'],
    ['missing rule id', '[[rules]]\n']
  ]
  it.each(invalidRegions)('rejects region %s', (_name, header) => {
    const f = fixture()
    f.header = header
    f.save()
    expect(() => loadReviewedExceptions(f.root)).toThrow(
      /^Invalid reviewed Gitleaks policy:/
    )
  })

  it('rejects an extra config block', () => {
    const f = fixture()
    f.extra = `[[rules.allowlists]]\n${Object.entries(f.block)
      .map(([key, value]) => `${key} = ${JSON.stringify(value)}`)
      .join('\n')}\n`
    f.save()
    expect(() => loadReviewedExceptions(f.root)).toThrow(/duplicate allowlist/)
  })

  it.each(['BEGIN', 'END'])('rejects missing %s region marker', (marker) => {
    const f = fixture()
    const configPath = path.join(f.root, '.gitleaks.toml')
    fs.writeFileSync(
      configPath,
      fs
        .readFileSync(configPath, 'utf8')
        .replace(`# ${marker} REVIEWED EXACT FINDINGS`, '# removed')
    )
    expect(() => loadReviewedExceptions(f.root)).toThrow(/region markers/)
  })

  it('rejects duplicate region markers', () => {
    const f = fixture()
    fs.appendFileSync(
      path.join(f.root, '.gitleaks.toml'),
      '# END REVIEWED EXACT FINDINGS\n'
    )
    expect(() => loadReviewedExceptions(f.root)).toThrow(/region markers/)
  })

  it('rejects duplicate TOML keys', () => {
    const f = fixture()
    f.extra = 'condition = "AND"\n'
    f.save()
    expect(() => loadReviewedExceptions(f.root)).toThrow(/region syntax/)
  })

  it('rejects non-JSON TOML values', () => {
    const f = fixture()
    const configPath = path.join(f.root, '.gitleaks.toml')
    fs.writeFileSync(
      configPath,
      fs.readFileSync(configPath, 'utf8').replace('"AND"', "'AND'")
    )
    expect(() => loadReviewedExceptions(f.root)).toThrow(
      /unreadable or malformed input/
    )
  })

  it('binds the entire source, including unrelated lines', () => {
    const f = fixture()
    fs.appendFileSync(path.join(f.root, f.relative), 'unreviewed change\n')
    expect(() => loadReviewedExceptions(f.root)).toThrow(/source digest/)
  })

  it('requires the literal in the bound source even with an updated source digest', () => {
    const f = fixture()
    fs.writeFileSync(path.join(f.root, f.relative), 'synthetic replacement\n')
    f.entry.sourceDigest = hash('synthetic replacement\n')
    f.save()
    expect(() => loadReviewedExceptions(f.root)).toThrow(/source binding/)
  })

  it.each([
    '.gitleaks-reviewed.json',
    '.gitleaks.toml',
    'docs/synthetic-fixture[1].txt'
  ])('fails closed when %s is missing', (relative) => {
    const f = fixture()
    fs.unlinkSync(path.join(f.root, relative))
    expect(() => loadReviewedExceptions(f.root)).toThrow(
      /unreadable or malformed input/
    )
  })

  it('rejects symlink sources', () => {
    const f = fixture()
    fs.renameSync(path.join(f.root, f.relative), path.join(f.root, 'target'))
    fs.symlinkSync(path.join(f.root, 'target'), path.join(f.root, f.relative))
    expect(() => loadReviewedExceptions(f.root)).toThrow(/symlink/)
  })

  it.each([
    '../outside',
    '/absolute',
    'docs/../target',
    'docs//target',
    'C:/target',
    'docs\\target'
  ])('rejects noncanonical source path %s', (relative) => {
    const f = fixture()
    f.entry.path = relative
    f.block.paths = [`^${escape(relative)}$`]
    f.save()
    expect(() => loadReviewedExceptions(f.root)).toThrow(/relative path/)
  })

  it('does not leak literals or malformed input through errors', () => {
    const f = fixture()
    fs.writeFileSync(path.join(f.root, '.gitleaks-reviewed.json'), f.literal)
    let error
    try {
      loadReviewedExceptions(f.root)
    } catch (caught) {
      error = caught
    }
    expect(error instanceof Error).toBe(true)
    expect(error.message.includes(f.literal)).toBe(false)
    expect(error.message).toBe(
      'Invalid reviewed Gitleaks policy: unreadable or malformed input'
    )
  })
})
