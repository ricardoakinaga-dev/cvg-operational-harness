// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// AUD-0621 F25 (PISO-007): the product recipe has no shell in its runtime and
// confines egress to the backend network. These checks guard the recipe; the
// built-image and network proofs are scripts/image-contract.mjs and
// scripts/infra-egress-proof.mjs, run against a real image. The production
// host firewall (deploy/egress-policy.example.nft) needs the host operator.

const deploy = join(dirname(fileURLToPath(import.meta.url)), '../../deploy')
const read = (name: string) => readFileSync(join(deploy, name), 'utf8')

interface Stage {
  from: string
  name: string
  lines: string[]
}

function stages(dockerfile: string): Stage[] {
  const logical = dockerfile
    .replace(/\\\n/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
  const result: Stage[] = []
  for (const line of logical) {
    const from = /^FROM\s+(\S+)\s+AS\s+(\S+)$/i.exec(line)
    if (from) {
      result.push({ from: from[1]!, name: from[2]!, lines: [] })
      continue
    }
    result.at(-1)?.lines.push(line)
  }
  return result
}

describe('F25: product runtime image has no shell or package manager', () => {
  const all = stages(read('Dockerfile'))
  const runtime = all.find((stage) => stage.name === 'runtime')!

  it('pins every base image by digest', () => {
    expect(all.length).toBeGreaterThanOrEqual(2)
    for (const stage of all) {
      expect(stage.from).toMatch(/@sha256:[0-9a-f]{64}$/)
    }
  })

  it('runs on the distroless C runtime with the pinned Node binary only', () => {
    expect(runtime.from).toMatch(
      /^gcr\.io\/distroless\/cc-debian12(?::[\w.-]+)?@sha256:[0-9a-f]{64}$/
    )
    expect(runtime.lines.some((line) => /^RUN\b/i.test(line))).toBe(false)
    expect(runtime.lines).toContain(
      'COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node'
    )
    const copies = runtime.lines.filter((line) => /^COPY\b/i.test(line))
    for (const copy of copies) {
      expect(copy).not.toMatch(/\/(?:usr\/)?s?bin\/(?:sh|bash|dash|busybox)\b/)
      expect(copy).not.toMatch(/npm|npx|corepack|node_modules/)
    }
  })

  it('never copies deploy files such as an operator .env into the build', () => {
    const build = all.find((stage) => stage.name === 'build')!
    const copies = build.lines.filter((line) => /^COPY\b/.test(line))
    expect(copies.some((line) => /^COPY products\s/.test(line))).toBe(false)
    for (const copy of copies) expect(copy).not.toMatch(/deploy|\.env/)
    const ignore = read('Dockerfile.dockerignore')
    expect(ignore).toContain('**/.env\n')
    expect(ignore).toContain('**/.env.*\n')
  })

  it('uses a non-root account and exec-form commands', () => {
    expect(runtime.lines).toContain('USER cvg')
    const passwd = all
      .flatMap((stage) => stage.lines)
      .find((line) => line.includes('/tmp/passwd'))
    expect(passwd).toContain('cvg:x:10001:10001:')
    expect(passwd).toContain('/sbin/nologin')
    const cmd = runtime.lines.find((line) => /^CMD\b/.test(line))
    expect(cmd).toBe('CMD ["node", "shift-assistant.mjs"]')
    const health = runtime.lines.find((line) => /^HEALTHCHECK\b/.test(line))
    expect(health).toMatch(/CMD \["node", "-e", /)
    expect(health).toContain('/health/ready')
  })
})

describe('F25: compose confines the container and its egress', () => {
  const compose = read('compose.yaml')

  it('keeps the hardening flags', () => {
    for (const expected of [
      "user: '10001:10001'",
      'read_only: true',
      '- /tmp:rw,noexec,nosuid,nodev,size=64m',
      '- ALL',
      '- no-new-privileges:true',
      'mem_limit: 512m',
      'pids_limit: 64',
      'cpus: 1',
      'stop_grace_period: 15s'
    ]) {
      expect(compose).toContain(expected)
    }
    expect(compose).not.toMatch(/docker\.sock|network_mode:\s*host|privileged/)
  })

  it('attaches only to an internal backend network and publishes nothing', () => {
    expect(compose).not.toMatch(/^\s+ports:/m)
    expect(compose).toMatch(
      /networks:\n\s+shift-backend:\n(?:\s+#.*\n)?\s+ipv4_address: 10\.254\.177\.4\n/
    )
    const network = compose.slice(compose.indexOf('\nnetworks:\n'))
    expect(network).toContain('shift-backend:')
    expect(network).toContain('internal: true')
    expect(network).toContain('enable_ipv6: false')
    expect(network).toContain('com.docker.network.bridge.name: br-cvgshift')
  })

  it('ships a default-deny forward policy for the host firewall', () => {
    expect(existsSync(join(deploy, 'egress-policy.example.nft'))).toBe(true)
    const policy = read('egress-policy.example.nft')
    expect(policy).toMatch(/table inet cvg_shift_egress/)
    expect(policy).toMatch(/hook forward priority -10/)
    expect(policy).toMatch(/define shift_assistant = 10\.254\.177\.4/)
    expect(policy).toMatch(
      /iifname "br-cvgshift" ip saddr \$shift_assistant counter drop/
    )
    expect(policy).toMatch(/meta nfproto ipv6 .*drop/)
    expect(policy).not.toMatch(/0\.0\.0\.0\/0|::\/0/)
  })
})
