#!/usr/bin/env node
// Assistente de Plantão — durable replay receipt with a real process (SPEC 0317
// section 7, SEC-SHIFT-WEBHOOK-20261105). From the repository root, after
// `npm run build:shift-assistant`:
//   node products/shift-assistant/scripts/webhook-replay-proof.mjs \
//     --work <new dir> --bundle products/shift-assistant/dist/shift-assistant.mjs \
//     [--out <receipt.json>]
// Starts the built bundle with NODE_ENV=production against a loopback WAHA
// stand-in, sends signed deliveries, refuses a query secret and a static
// header, kills the process with SIGKILL, restarts it on the same volume and
// replays. The signer below is written independently of src/webhook-auth.ts,
// so it also checks the documented envelope. Synthetic data only; nothing
// leaves loopback. Exit 0 PASS, 1 FAIL, 2 usage.
import { spawn } from 'node:child_process'
import { createHash, createHmac, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join, resolve } from 'node:path'

const arg = (name) => {
  const index = process.argv.indexOf(name)
  return index > 0 ? process.argv[index + 1] : undefined
}
const work = arg('--work')
const bundle = arg('--bundle')
const out = arg('--out')
if (!work || !bundle || existsSync(work) || !existsSync(bundle)) {
  process.stderr.write(
    'usage: webhook-replay-proof.mjs --work <new dir> --bundle <file> [--out <file>]\n'
  )
  process.exit(2)
}

const ANA = '5511900000001'
const TENANT = 'synthetic-proof'
const KEY_ID = 'proof-key-1'
const KEY = randomBytes(32)
const STATIC_SECRET = `segredo-estatico-sintetico-${randomBytes(8).toString('hex')}`
const dataDir = join(work, 'data')
mkdirSync(dataDir, { recursive: true })

const checks = []
const check = (name, passed) => {
  checks.push({ name, passed })
  process.stdout.write(`${passed ? 'PASS' : 'FAIL'} ${name}\n`)
}

const sent = []
const waha = createServer((request, response) => {
  let body = ''
  request.on('data', (chunk) => (body += chunk))
  request.on('end', () => {
    if (request.url === '/api/sendText') sent.push(body)
    response.writeHead(201, { 'content-type': 'application/json' })
    response.end('{}')
  })
})
await new Promise((done) => waha.listen(0, '127.0.0.1', done))
const wahaUrl = `http://127.0.0.1:${waha.address().port}`

let output = ''
function startAssistant() {
  const child = spawn(process.execPath, [resolve(bundle)], {
    env: {
      PATH: process.env.PATH ?? '',
      NODE_ENV: 'production',
      SHIFT_PROVIDER: 'waha',
      SHIFT_MEMBERS: `${ANA}=Plantonista Sintetica;5511900000009=Gestor Sintetico*`,
      SHIFT_CHANNEL_MODE: 'synthetic',
      SHIFT_WEBHOOK_TENANT: TENANT,
      SHIFT_WEBHOOK_KEYS: JSON.stringify([
        {
          provider: 'waha',
          tenant: TENANT,
          keyId: KEY_ID,
          secret: KEY.toString('base64url'),
          notBefore: '2020-01-01T00:00:00Z',
          notAfter: '2100-01-01T00:00:00Z'
        }
      ]),
      SHIFT_DATA_DIR: dataDir,
      SHIFT_PORT: '0',
      SHIFT_HOST: '127.0.0.1',
      SHIFT_TICK_SECONDS: '3600',
      WAHA_URL: wahaUrl,
      WAHA_API_KEY: 'sandbox-waha-key',
      WHISPER_URL: 'http://127.0.0.1:9',
      LLM_BASE_URL: 'http://127.0.0.1:9/v1',
      LLM_MODEL: 'sandbox',
      LLM_LOCATION: 'local'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let own = ''
  const collect = (chunk) => {
    own += String(chunk)
    output += String(chunk)
  }
  child.stdout.on('data', collect)
  child.stderr.on('data', collect)
  const exited = new Promise((done) =>
    child.on('exit', (code, signal) => done({ code, signal }))
  )
  return new Promise((done, fail) => {
    const deadline = Date.now() + 20_000
    const poll = setInterval(() => {
      const port = /"shift\.started".*?"port":(\d+)/.exec(own)?.[1]
      if (port) {
        clearInterval(poll)
        done({ child, exited, port: Number(port) })
      } else if (Date.now() > deadline || child.exitCode !== null) {
        clearInterval(poll)
        fail(new Error('assistant did not start'))
      }
    }, 50)
  })
}

const body = (id, text) =>
  JSON.stringify({
    event: 'message',
    payload: { id, from: `${ANA}@c.us`, fromMe: false, body: text }
  })

function envelope(raw, deliveryId) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = createHmac('sha256', KEY)
    .update(
      `cvg-shift-webhook-v1\nwaha\n${TENANT}\n${KEY_ID}\n${timestamp}\n${deliveryId}\n`
    )
    .update(raw)
    .digest('hex')
  return {
    'content-type': 'application/json',
    'x-cvg-webhook-tenant': TENANT,
    'x-cvg-webhook-key-id': KEY_ID,
    'x-cvg-webhook-timestamp': timestamp,
    'x-cvg-webhook-delivery-id': deliveryId,
    'x-cvg-webhook-signature': `v1=${signature}`
  }
}

const post = async (port, raw, headers, path = '/webhooks/waha') => {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers,
    body: raw
  })
  return { status: response.status, body: await response.json() }
}

function journalEvents() {
  const segments = ['events.jsonl', 'events-0001.jsonl']
    .map((file) => join(dataDir, file))
    .filter(existsSync)
  return segments.flatMap((file) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  )
}
const count = (type) =>
  journalEvents().filter((event) => event.type === type).length

const DELIVERY = 'proof-delivery-0001'
const original = body('proof-m1', 'ajuda')
const receipt = { schema: 'shift-webhook-replay-receipt-v1' }

const first = await startAssistant()
const unsigned = await post(first.port, original, {
  'x-cvg-webhook-secret': STATIC_SECRET
})
const query = await post(
  first.port,
  original,
  { 'content-type': 'application/json' },
  `/webhooks/waha?secret=${STATIC_SECRET}`
)
check('static header alone is refused', unsigned.status === 401)
check('query secret is refused', query.status === 401)
check('nothing was journaled by refusals', journalEvents().length === 0)

const concurrent = await Promise.all(
  Array.from({ length: 4 }, () =>
    post(first.port, original, envelope(original, DELIVERY))
  )
)
receipt.concurrent = concurrent.map((answer) => answer.body)
check(
  'concurrent deliveries admit once',
  concurrent.filter((answer) => answer.body.accepted === true).length === 1 &&
    concurrent.filter((answer) => answer.body.duplicate === true).length === 3
)
check(
  'one reservation and one message on disk',
  count('webhook_delivery_reserved') === 1 && count('message_received') === 1
)

// The reply is committed before it is sent, so a kill during the send can
// lose it. Waiting keeps this proof about replay and not about that window.
const replyDeadline = Date.now() + 10_000
while (sent.length === 0 && Date.now() < replyDeadline) {
  await new Promise((done) => setTimeout(done, 50))
}
const killed = first.child.kill('SIGKILL')
const death = await first.exited
check('process died by SIGKILL', killed && death.signal === 'SIGKILL')
receipt.journalBeforeRestartSha256 = createHash('sha256')
  .update(JSON.stringify(journalEvents()))
  .digest('hex')
const repliesBeforeRestart = sent.length

const second = await startAssistant()
const replay = await post(second.port, original, envelope(original, DELIVERY))
const conflict = await post(
  second.port,
  body('proof-m2', 'outro corpo'),
  envelope(body('proof-m2', 'outro corpo'), DELIVERY)
)
receipt.afterRestart = { replay, conflict }
check(
  'identical replay converges after the restart',
  replay.status === 200 && replay.body.duplicate === true
)
check('same ID with another body is refused', conflict.status === 409)
check(
  'the journal did not grow by a reservation or a message',
  count('webhook_delivery_reserved') === 1 && count('message_received') === 1
)

// Time for a wrongly repeated reply to arrive.
await new Promise((done) => setTimeout(done, 1000))
receipt.repliesBeforeRestart = repliesBeforeRestart
receipt.repliesTotal = sent.length
check('the one admitted message produced exactly one reply', sent.length === 1)

second.child.kill('SIGTERM')
await second.exited
waha.close()

const journalText = journalEvents()
  .map((event) => JSON.stringify(event))
  .join('\n')
const logged = `${output}\n${journalText}`
check(
  'logs and journal hold no credential',
  !logged.includes(STATIC_SECRET) &&
    !logged.includes('secret=') &&
    !logged.includes(KEY.toString('base64url')) &&
    !logged.includes(KEY.toString('hex'))
)
receipt.refusalsLogged = (output.match(/shift\.webhook\.refused/g) ?? []).length
receipt.reservation = journalEvents().find(
  (event) => event.type === 'webhook_delivery_reserved'
)
receipt.bundleSha256 = createHash('sha256')
  .update(readFileSync(bundle))
  .digest('hex')
receipt.node = process.version
receipt.checks = checks
receipt.result = checks.every((entry) => entry.passed) ? 'PASS' : 'FAIL'
if (out) writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`)
process.stdout.write(`${receipt.result}\n`)
process.exit(receipt.result === 'PASS' ? 0 : 1)
