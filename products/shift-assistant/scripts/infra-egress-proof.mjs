#!/usr/bin/env node
// Assistente de Plantão — infrastructure egress proof (SPEC 0179 section 9,
// AUD-0621 F25). Runs the real image with the compose hardening on an
// internal Docker network next to a synthetic "allowed" receiver, plus a
// "forbidden" receiver outside that network, then probes from inside the
// running container with Node itself (the image has no shell):
//   node products/shift-assistant/scripts/infra-egress-proof.mjs <image> <receiver-image>
// The receiver image only needs `node` (for example the pinned
// node:22.23.2-bookworm-slim already used by the build). Every resource is
// created with a run-specific name and removed at the end. Synthetic data
// only; no channel, model or external service is contacted on purpose: the
// external targets below must fail for lack of a route.
// Prints a JSON report. Exit 0 PASS, 1 FAIL, 2 tool or image unavailable.
// `--self-test-non-internal` is the proof's own negative control: the same
// run on an ordinary (non-internal) bridge, without the internet targets, must
// FAIL because the host-published forbidden receiver becomes reachable.
// This proves the Docker network layer locally; the production host firewall
// (deploy/egress-policy.example.nft) needs the host operator.
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

const args = process.argv.slice(2)
const selfTest = args.includes('--self-test-non-internal')
const [image, receiverImage] = args.filter((arg) => !arg.startsWith('--'))
if (!image || !receiverImage) {
  process.stderr.write(
    'usage: infra-egress-proof.mjs <image> <receiver-image>\n'
  )
  process.exit(2)
}

const run = `aud0621-${randomBytes(3).toString('hex')}`
const names = {
  backend: `cvg-shift-${run}-backend`,
  outside: `cvg-shift-${run}-outside`,
  allowed: `cvg-shift-${run}-allowed`,
  forbidden: `cvg-shift-${run}-forbidden`,
  product: `cvg-shift-${run}-product`,
  volume: `cvg-shift-${run}-data`
}
const SECRET = 'segredo-sintetico-da-prova-de-egress'
const ANA = '5511900000001'

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    timeout: options.timeout ?? 60_000
  })
  if (result.error && result.error.code === 'ENOENT') {
    process.stderr.write('docker unavailable\n')
    process.exit(2)
  }
  return result
}

function must(args) {
  const result = docker(args)
  if (result.status !== 0) {
    throw new Error(
      `docker ${args[0]} ${args[1] ?? ''} failed: ${result.stderr.trim().slice(0, 200)}`
    )
  }
  return result.stdout.trim()
}

// A tiny counting HTTP receiver; GET /__count reports how many other
// requests it saw.
const RECEIVER = `
const http = require('node:http')
let count = 0
http.createServer((req, res) => {
  if (req.url === '/__count') { res.end(JSON.stringify({ count })); return }
  count += 1
  req.resume()
  req.on('end', () => {
    res.writeHead(201, { 'content-type': 'application/json' })
    res.end('{}')
  })
}).listen(8080, '0.0.0.0')
`

/** Runs `code` with Node inside `container`; returns its JSON stdout. */
function nodeIn(container, code, timeout = 60_000) {
  const result = docker(['exec', container, 'node', '-e', code], { timeout })
  try {
    return { status: result.status, ...JSON.parse(result.stdout.trim()) }
  } catch {
    return { status: result.status, raw: result.stdout.trim().slice(0, 200) }
  }
}

const PROBE = (url) => `
const started = Date.now()
fetch(${JSON.stringify(url)}, { signal: AbortSignal.timeout(4000) })
  .then((r) => console.log(JSON.stringify({ ok: true, status: r.status, ms: Date.now() - started })))
  .catch((e) => console.log(JSON.stringify({ ok: false, error: (e.cause && e.cause.code) || e.name, ms: Date.now() - started })))
`

const checks = []
function check(name, pass, detail = undefined) {
  checks.push({ name, pass: Boolean(pass), ...(detail ? { detail } : {}) })
}

function count(container) {
  const result = nodeIn(
    container,
    `fetch('http://127.0.0.1:8080/__count').then((r) => r.text()).then((t) => console.log(t))`
  )
  return typeof result.count === 'number' ? result.count : -1
}

const report = {
  schemaVersion: 1,
  kind: 'shift-assistant-infra-egress-proof',
  mode: selfTest ? 'self-test-non-internal' : 'proof',
  run,
  image,
  receiverImage
}
try {
  for (const name of [image, receiverImage]) {
    if (docker(['image', 'inspect', name]).status !== 0) {
      process.stderr.write(`image not found: ${name}\n`)
      process.exit(2)
    }
  }
  report.imageId = must(['image', 'inspect', '-f', '{{.Id}}', image])
  must([
    'network',
    'create',
    ...(selfTest ? [] : ['--internal']),
    '--driver',
    'bridge',
    names.backend
  ])
  must(['network', 'create', '--driver', 'bridge', names.outside])
  const outsideGateway = must([
    'network',
    'inspect',
    '-f',
    '{{(index .IPAM.Config 0).Gateway}}',
    names.outside
  ])
  must(['volume', 'create', names.volume])
  must([
    'run',
    '-d',
    '--name',
    names.allowed,
    '--network',
    names.backend,
    '--network-alias',
    'waha',
    '--network-alias',
    'whisper',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--user',
    '65534:65534',
    receiverImage,
    'node',
    '-e',
    RECEIVER
  ])
  // Published only on the outside bridge address of this host: reachable
  // from an ordinary bridge, never from an internal one.
  must([
    'run',
    '-d',
    '--name',
    names.forbidden,
    '--network',
    names.outside,
    '-p',
    `${outsideGateway}::8080`,
    '--read-only',
    '--cap-drop',
    'ALL',
    '--user',
    '65534:65534',
    receiverImage,
    'node',
    '-e',
    RECEIVER
  ])
  const forbiddenIp = must([
    'inspect',
    '-f',
    `{{(index .NetworkSettings.Networks "${names.outside}").IPAddress}}`,
    names.forbidden
  ])
  const published = must(['port', names.forbidden, '8080/tcp']).split('\n')[0]
  const hostPort = published.slice(published.lastIndexOf(':') + 1)
  // Same flags as deploy/compose.yaml.
  must([
    'run',
    '-d',
    '--name',
    names.product,
    '--network',
    names.backend,
    '--network-alias',
    'shift',
    '--user',
    '10001:10001',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,nodev,size=64m',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--memory',
    '512m',
    '--pids-limit',
    '64',
    '--cpus',
    '1',
    '-v',
    `${names.volume}:/data`,
    '-e',
    'SHIFT_PROVIDER=waha',
    '-e',
    `SHIFT_MEMBERS=${ANA}=Plantonista Sintetica;5511900000009=Gestor Sintetico*`,
    '-e',
    `SHIFT_WEBHOOK_SECRET=${SECRET}`,
    '-e',
    'WAHA_URL=http://waha:8080',
    '-e',
    'WAHA_API_KEY=sandbox-waha-key',
    '-e',
    'WHISPER_URL=http://whisper:8080',
    // NO_MODEL: the gateway denies shift notes before this address is used.
    '-e',
    'LLM_BASE_URL=http://127.0.0.1:9/v1',
    '-e',
    'LLM_MODEL=sandbox',
    '-e',
    'LLM_LOCATION=local',
    image
  ])

  let ready = { ok: false }
  for (let attempt = 0; attempt < 40 && !ready.ok; attempt += 1) {
    ready = nodeIn(names.product, PROBE('http://127.0.0.1:3400/health/ready'))
    if (!ready.ok) spawnSync('sleep', ['0.5'])
  }
  check(
    'product ready on /health/ready',
    ready.ok && ready.status === 200,
    JSON.stringify(ready)
  )

  const identity = nodeIn(
    names.product,
    `console.log(JSON.stringify({ uid: process.getuid(), gid: process.getgid() }))`
  )
  check(
    'runs as 10001:10001',
    identity.uid === 10001 && identity.gid === 10001,
    JSON.stringify(identity)
  )
  const rootWrite = nodeIn(
    names.product,
    `try { require('node:fs').writeFileSync('/app/probe', 'x'); console.log('{"written":true}') } catch (e) { console.log(JSON.stringify({ written: false, code: e.code })) }`
  )
  check(
    'root filesystem refuses writes',
    rootWrite.written === false,
    rootWrite.code
  )
  const dataWrite = nodeIn(
    names.product,
    `try { require('node:fs').writeFileSync('/data/probe', 'x'); console.log('{"written":true}') } catch (e) { console.log(JSON.stringify({ written: false, code: e.code })) }`
  )
  check('/data accepts writes', dataWrite.written === true, dataWrite.code)
  for (const shell of ['/bin/sh', 'sh', 'bash', 'busybox']) {
    const result = docker(['exec', names.product, shell, '-c', 'true'])
    check(`exec ${shell} fails`, result.status !== 0, `exit ${result.status}`)
  }

  // Bypass the application allowlist on purpose: raw Node fetch/DNS from
  // inside the container, so only the infrastructure can stop it.
  const allowed = nodeIn(names.product, PROBE('http://waha:8080/allowed-probe'))
  check(
    'allowed backend receiver reachable',
    allowed.ok && allowed.status === 201,
    JSON.stringify(allowed)
  )
  const targets = {
    'forbidden receiver on another network': `http://${forbiddenIp}:8080/forbidden-probe`,
    'forbidden receiver published on the host': `http://${outsideGateway}:${hostPort}/forbidden-probe`,
    // No packet may leave: these addresses have no route from the backend.
    // The self-test skips them so it never contacts the internet.
    ...(selfTest
      ? {}
      : {
          'public internet address': 'http://1.1.1.1:80/',
          'cloud metadata address': 'http://169.254.169.254/latest/meta-data/',
          'public IPv6 address': 'http://[2606:4700:4700::1111]:80/'
        })
  }
  const denied = {}
  report.probes = denied
  for (const [name, url] of Object.entries(targets)) {
    const result = nodeIn(names.product, PROBE(url))
    denied[name] = result
    check(`blocked: ${name}`, result.ok === false, JSON.stringify(result))
  }
  if (!selfTest) {
    const dns = nodeIn(
      names.product,
      `require('node:dns').promises.lookup('example.com').then((a) => console.log(JSON.stringify({ resolved: true, family: a.family }))).catch((e) => console.log(JSON.stringify({ resolved: false, code: e.code })))`
    )
    check(
      'external DNS name does not resolve',
      dns.resolved === false,
      JSON.stringify(dns)
    )
  }

  // The functional path still works inside the backend network: a webhook
  // from the channel stand-in gets a reply through the allowed receiver.
  const before = count(names.allowed)
  const webhook = nodeIn(
    names.allowed,
    `fetch('http://shift:3400/webhooks/waha', { method: 'POST', headers: { 'content-type': 'application/json', 'x-cvg-webhook-secret': ${JSON.stringify(SECRET)} }, body: JSON.stringify({ event: 'message', payload: { id: 'egress-h1', from: '${ANA}@c.us', fromMe: false, body: 'ajuda' } }) }).then(async (r) => console.log(JSON.stringify({ status: r.status, body: await r.json() }))).catch((e) => console.log(JSON.stringify({ error: e.name })))`
  )
  check(
    'webhook accepted over the backend network',
    webhook.status === 200 && webhook.body?.accepted === true,
    JSON.stringify(webhook)
  )
  let after = before
  for (let attempt = 0; attempt < 20 && after <= before; attempt += 1) {
    spawnSync('sleep', ['0.25'])
    after = count(names.allowed)
  }
  check(
    'reply reached the allowed receiver',
    after > before,
    `${before}->${after}`
  )
  const forbiddenCount = count(names.forbidden)
  check(
    'forbidden receiver saw zero requests',
    forbiddenCount === 0,
    String(forbiddenCount)
  )
  report.forbiddenIp = forbiddenIp
  report.forbiddenPublished = `${outsideGateway}:${hostPort}`
} catch (error) {
  check('setup', false, error instanceof Error ? error.message : 'unknown')
} finally {
  for (const container of [names.product, names.allowed, names.forbidden]) {
    docker(['rm', '-f', container])
  }
  docker(['volume', 'rm', '-f', names.volume])
  for (const network of [names.backend, names.outside]) {
    docker(['network', 'rm', network])
  }
  const leftovers = docker([
    'ps',
    '-a',
    '--filter',
    `name=cvg-shift-${run}`,
    '-q'
  ]).stdout.trim()
  report.cleanup = leftovers ? 'INCOMPLETE' : 'DONE'
}
report.checks = checks
report.verdict =
  checks.length > 0 && checks.every((entry) => entry.pass) ? 'PASS' : 'FAIL'
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
process.exit(report.verdict === 'PASS' ? 0 : 1)
