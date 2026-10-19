// Explicit node:test entrypoint; intentionally outside Vitest's *.test.* collection.
// Builtins and the builtin-only policy helper are the complete dependency graph.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomInt } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { loadReviewedExceptions } from '../scripts/gitleaks-reviewed-policy.mjs'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const childTimeoutMs = 15_000
const totalTimeoutMs = 300_000
const outputLimitBytes = 1024 * 1024
const findingsExitCode = 23

// Every fixture must clear the detector's entropy floor. Unconstrained random
// hexadecimal strings can fall below it and invalidate the negative control.
function syntheticHex() {
  const shuffle = (chars) => {
    for (let i = chars.length - 1; i > 0; i--) {
      const other = randomInt(i + 1)
      ;[chars[i], chars[other]] = [chars[other], chars[i]]
    }
    return chars
  }
  const alphabet = [...'0123456789abcdef']
  const chars = shuffle([
    ...alphabet,
    ...alphabet,
    ...shuffle([...alphabet]).slice(0, 8)
  ])
  // Eight symbols occur twice and eight three times: entropy is always >3.97.
  return chars.join('')
}

test(
  'Gitleaks 8.28.0 enforces every reviewed path/value boundary',
  { timeout: totalTimeoutMs },
  async (t) => {
    const bin = process.env.GITLEAKS_BIN
    assert.ok(
      typeof bin === 'string' && path.isAbsolute(bin),
      'GITLEAKS_BIN must be an absolute executable path'
    )
    assert.ok(fs.statSync(bin).isFile(), 'GITLEAKS_BIN must be a regular file')
    fs.accessSync(bin, fs.constants.X_OK)
    const entries = loadReviewedExceptions(projectRoot)
    const configBytes = fs.readFileSync(
      path.join(projectRoot, '.gitleaks.toml')
    )
    const temporary = fs.mkdtempSync(
      path.join(os.tmpdir(), 'cvg-reviewed-boundaries-')
    )
    const deadline = Date.now() + totalTimeoutMs - 1000
    try {
      const home = path.join(temporary, 'home')
      const tmp = path.join(temporary, 'tmp')
      fs.mkdirSync(home)
      fs.mkdirSync(tmp)
      const env = {
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        HOME: home,
        TMPDIR: tmp,
        XDG_CONFIG_HOME: path.join(home, '.config'),
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
        GIT_AUTHOR_NAME: 'Synthetic boundary fixture',
        GIT_AUTHOR_EMAIL: 'synthetic@example.invalid',
        GIT_COMMITTER_NAME: 'Synthetic boundary fixture',
        GIT_COMMITTER_EMAIL: 'synthetic@example.invalid',
        GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
        LC_ALL: 'C',
        NO_COLOR: '1'
      }
      const child = (executable, args, cwd) => {
        const remaining = deadline - Date.now()
        assert.ok(remaining > 0, 'native proof total time budget exhausted')
        const result = spawnSync(executable, args, {
          cwd,
          env,
          encoding: 'utf8',
          timeout: Math.min(childTimeoutMs, remaining),
          maxBuffer: outputLimitBytes,
          killSignal: 'SIGKILL',
          stdio: ['ignore', 'pipe', 'pipe']
        })
        // stdout/stderr and spawn errors can contain fixture data: never forward them.
        assert.ok(
          !result.error && !result.signal && Number.isInteger(result.status),
          'native child failed or exceeded its bounds (output withheld)'
        )
        return result
      }
      const version = child(bin, ['version'], temporary)
      assert.ok(
        version.status === 0 && version.stdout.trim() === '8.28.0',
        'Gitleaks must report exactly version 8.28.0 (output withheld)'
      )
      const actualConfig = path.join(temporary, 'actual.toml')
      const controlConfig = path.join(temporary, 'defaults-only.toml')
      fs.writeFileSync(actualConfig, configBytes)
      fs.writeFileSync(controlConfig, '[extend]\nuseDefault = true\n')
      let sequence = 0
      const git = (args, cwd) => {
        const result = child(
          'git',
          [
            '-c',
            'core.hooksPath=/dev/null',
            '-c',
            'core.excludesFile=/dev/null',
            '-c',
            'commit.gpgsign=false',
            ...args
          ],
          cwd
        )
        assert.ok(
          result.status === 0,
          'synthetic git operation failed (output withheld)'
        )
      }
      const repository = (relative, content) => {
        const repo = path.join(temporary, `repo-${++sequence}`)
        fs.mkdirSync(repo)
        git(['init', '--quiet', '--initial-branch=synthetic'], repo)
        const filename = path.join(repo, relative)
        // The policy loader has already rejected absolute paths, traversal and symlinks.
        fs.mkdirSync(path.dirname(filename), { recursive: true })
        fs.writeFileSync(filename, content)
        git(['add', '--force', '--', relative], repo)
        git(
          [
            'commit',
            '--quiet',
            '--no-verify',
            '-m',
            'Synthetic boundary fixture'
          ],
          repo
        )
        return repo
      }
      const scan = (repo, config) => {
        const report = path.join(temporary, `report-${++sequence}.json`)
        const result = child(
          bin,
          [
            'git',
            '--no-banner',
            '--redact=100',
            '--exit-code',
            String(findingsExitCode),
            '--config',
            config,
            '--report-format',
            'json',
            '--report-path',
            report,
            '--log-opts=--all',
            repo
          ],
          temporary
        )
        assert.ok(
          result.status === 0 || result.status === findingsExitCode,
          'scanner failed without a scan verdict (output withheld)'
        )
        assert.ok(fs.existsSync(report), 'scanner must write its report')
        let findings
        try {
          findings = JSON.parse(fs.readFileSync(report, 'utf8'))
        } catch {
          assert.fail('invalid native report (output withheld)')
        }
        assert.ok(Array.isArray(findings), 'scanner report must be an array')
        assert.ok(
          (result.status === 0) === (findings.length === 0),
          'scanner verdict/report mismatch'
        )
        return findings
      }
      const detected = (repo, config, detector, relative) => {
        const findings = scan(repo, config)
        assert.ok(
          findings.some(
            (finding) =>
              finding.RuleID === detector && finding.File === relative
          ),
          'required detector did not detect the synthetic fixture (output withheld)'
        )
      }
      for (const [index, entry] of entries.entries()) {
        await t.test(
          `reviewed pair ${index + 1}: effective control and six boundaries`,
          () => {
            const render = (value) =>
              `${entry.detector === 'sourcegraph-access-token' ? 'sourcegraph\n' : ''}${entry.template.replace('{literal}', () => value)}\n`
            const approved = repository(entry.path, render(entry.literal))
            detected(approved, controlConfig, entry.detector, entry.path)
            assert.ok(
              scan(approved, actualConfig).length === 0,
              'approved exact pair must be accepted (output withheld)'
            )

            const otherPath = `unreviewed-location/${entry.path}`
            detected(
              repository(otherPath, render(entry.literal)),
              actualConfig,
              entry.detector,
              otherPath
            )

            let replacement
            do {
              replacement = syntheticHex()
            } while (entries.some((item) => item.literal === replacement))
            detected(
              repository(entry.path, render(replacement)),
              controlConfig,
              entry.detector,
              entry.path
            )
            detected(
              repository(entry.path, render(replacement)),
              actualConfig,
              entry.detector,
              entry.path
            )

            // Generated fake tokens are never copied from a provider or logged.
            const modernSourcegraph = `sgp_${syntheticHex()}`
            const legacySourcegraph = syntheticHex()
            const github = `ghp_${syntheticHex().slice(0, 36)}`
            const providerContent = `sourcegraph\napi_key = "${modernSourcegraph}"\napi_key = "${legacySourcegraph}"\napi_key = "${github}"\n`
            const providerFindings = scan(
              repository(entry.path, providerContent),
              actualConfig
            )
            assert.ok(
              providerFindings.filter(
                (finding) =>
                  finding.RuleID === 'sourcegraph-access-token' &&
                  finding.File === entry.path
              ).length >= 2,
              'modern and legacy Sourcegraph fake tokens must remain detected (output withheld)'
            )
            assert.ok(
              providerFindings.some(
                (finding) =>
                  finding.RuleID === 'github-pat' && finding.File === entry.path
              ),
              'other-provider fake token must remain detected (output withheld)'
            )
          }
        )
      }
      // Detect concurrent writes to the frozen inputs; successful scans cannot certify drift.
      assert.ok(
        configBytes.equals(
          fs.readFileSync(path.join(projectRoot, '.gitleaks.toml'))
        ),
        'frozen config changed during proof'
      )
      const current = loadReviewedExceptions(projectRoot)
      assert.ok(
        JSON.stringify(current) === JSON.stringify(entries),
        'frozen manifest or sources changed during proof'
      )
    } finally {
      fs.rmSync(temporary, { recursive: true, force: true })
    }
  }
)
