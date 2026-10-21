#!/usr/bin/env node
// Assistente de Plantão — alert receipt proof with real processes (SPEC 0179
// section 10, PISO-008; stop of section 8.3). From the repository root:
//   node --import tsx products/shift-assistant/scripts/alert-receipt-proof.mjs run \
//     --work <new dir> [--bundle products/shift-assistant/dist/shift-assistant.mjs] \
//     [--assistant-port 3450] [--proxy-port 4450]
//   node --import tsx products/shift-assistant/scripts/alert-receipt-proof.mjs receiver \
//     --dir <dir> --token-file <file> [--port <port>]
// `run` starts three separate processes — the assistant (the built bundle,
// or src/main.ts), the external monitor (scripts/shift-monitor.mjs) and the
// exclusive local receiver (`receiver`) — plus in-process synthetic stand-ins
// for WAHA and Whisper and a health proxy on loopback. It then induces: a
// scheduler without progress (reminder sends that hang), a slow service (the
// proxy delays health 3 s > 2 s timeout), a real SIGTERM stop with the
// receiver down and the monitor killed (durable queue across a restart), a
// frozen process (SIGSTOP) that ignores SIGTERM until the supervisor's 15 s
// grace ends in SIGKILL, and a manager pause (state notice, not an
// incident). It compares every alert the monitor delivered with the receipt
// stored by the receiver (payload, SHA-256, time) and checks motive, latency
// (≤ 30 s from the first failed probe), one alertId per episode and the
// resolved receipt. Synthetic data only; nothing leaves loopback.
// Exit 0 PASS, 1 FAIL, 2 usage or tool unavailable.
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { createServer, request as httpRequest } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const arg = (name) => {
  const index = process.argv.indexOf(name)
  return index > 0 ? process.argv[index + 1] : undefined
}
const usage = () => {
  process.stderr.write(
    'usage: alert-receipt-proof.mjs run --work <dir> [--bundle <file>] [--assistant-port <p>] [--proxy-port <p>]\n' +
      '       alert-receipt-proof.mjs receiver --dir <dir> --token-file <file> [--port <p>]\n'
  )
  process.exit(2)
}
async function load(path) {
  try {
    return await import(path)
  } catch {
    process.stderr.write(
      'cannot load the product code: run from the repository root with node --import tsx\n'
    )
    process.exit(2)
  }
}

const command = process.argv[2]

if (command === 'receiver') {
  const dir = arg('--dir')
  const tokenFile = arg('--token-file')
  if (!dir || !tokenFile) usage()
  const { startAlertReceiver } = await load('../src/monitor.ts')
  const receiver = await startAlertReceiver({
    dir,
    token: readFileSync(tokenFile, 'utf8').trim(),
    port: Number(arg('--port') ?? 0)
  })
  process.stdout.write(
    `${JSON.stringify({ event: 'receiver.listening', port: receiver.port })}\n`
  )
  const stop = async () => {
    await receiver.close()
    process.exit(0)
  }
  process.once('SIGTERM', () => void stop())
  process.once('SIGINT', () => void stop())
  await new Promise(() => undefined)
}

if (command !== 'run') usage()
const work = arg('--work')
if (!work) usage()
if (existsSync(work) && readdirSync(work).length > 0) {
  process.stderr.write('--work must be new or empty\n')
  process.exit(2)
}
const bundle = arg('--bundle')
const ASSISTANT_PORT = Number(arg('--assistant-port') ?? 3450)
const PROXY_PORT = Number(arg('--proxy-port') ?? 4450)

const { setup, wahaPayload } = await load('../src/__tests__/support/harness.ts')
const { ShiftStore } = await load('../src/store.ts')
const { isAlertEvent } = await load('../src/monitor.ts')

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const ANA = '5511900000001'
const GESTOR = '5511900000009'
const SECRET = 'segredo-sintetico-da-prova-de-alerta'
const TASKS = 10

const dirs = {
  data: join(work, 'data'),
  receipts: join(work, 'receipts'),
  monitor: join(work, 'monitor'),
  logs: join(work, 'logs')
}
for (const dir of Object.values(dirs))
  mkdirSync(dir, { recursive: true, mode: 0o700 })
const tokenFile = join(dirs.monitor, 'receiver.token')
writeFileSync(tokenFile, `${randomBytes(24).toString('hex')}\n`, {
  mode: 0o600
})
const stateFile = join(dirs.monitor, 'state.json')

const started = Date.now()
const elapsed = () => Math.round((Date.now() - started) / 1000)
const checks = []
const phases = []
function check(name, pass, detail = undefined) {
  checks.push({
    name,
    pass: Boolean(pass),
    ...(detail !== undefined ? { detail } : {})
  })
  return Boolean(pass)
}
const note = (event, fields = {}) =>
  appendFileSync(
    join(dirs.logs, 'proof.log'),
    `${JSON.stringify({ t: elapsed(), event, ...fields })}\n`
  )

// --- Synthetic stand-ins: WAHA, Whisper and a health proxy (loopback). ---
const stand = { send: 'ok', whisper: 'ok', proxy: 'pass' }
const reminders = [] // { number, at }
let whisperRequests = 0
function listen(server, port = 0) {
  return new Promise((done) =>
    server.listen(port, '127.0.0.1', () => done(server.address().port))
  )
}
const waha = createServer((request, response) => {
  if (request.url?.startsWith('/api/files/')) {
    response.writeHead(200, { 'content-type': 'audio/ogg' })
    response.end(Buffer.from([1, 2, 3, 4]))
    return
  }
  if (request.method === 'POST' && request.url === '/api/sendText') {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      let text = ''
      try {
        text = JSON.parse(Buffer.concat(chunks).toString('utf8')).text ?? ''
      } catch {
        text = ''
      }
      const match = /^⏰ Lembrete #(\d+):/.exec(text)
      if (match) reminders.push({ number: Number(match[1]), at: Date.now() })
      if (stand.send === 'hang') return // never answers
      response.writeHead(201, { 'content-type': 'application/json' })
      response.end('{}')
    })
    return
  }
  response.writeHead(404).end()
})
const whisper = createServer((request, response) => {
  whisperRequests += 1
  request.resume()
  if (stand.whisper === 'hang') return
  request.on('end', () => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ text: 'transcrição sintética da prova' }))
  })
})
const proxy = createServer((request, response) => {
  const forward = () => {
    const upstream = httpRequest(
      {
        host: '127.0.0.1',
        port: ASSISTANT_PORT,
        path: request.url,
        method: 'GET',
        timeout: 5000
      },
      (answer) => {
        response.writeHead(answer.statusCode ?? 502, answer.headers)
        answer.pipe(response)
      }
    )
    upstream.on('timeout', () => upstream.destroy())
    upstream.on('error', () => response.destroy())
    upstream.end()
  }
  if (stand.proxy === 'slow') setTimeout(forward, 3000)
  else forward()
})
const wahaPort = await listen(waha)
const whisperPort = await listen(whisper)
await listen(proxy, PROXY_PORT)

// --- Seed: confirmed tasks due shortly after the healthy baseline. ---
const seedNow = new Date()
const dueAt = new Date(seedNow.getTime() + 75_000).toISOString()
const seed = setup({
  dataDir: dirs.data,
  start: seedNow,
  organize: async (text) => {
    const name = /Paciente \d+/.exec(text)?.[0] ?? 'Paciente 0'
    return {
      pacientes: [{ nome: name, leito: '1', exames_pedidos: [], condutas: [] }],
      pendencias: [
        { descricao: 'Reavaliar (sintético)', paciente: name, quando: dueAt }
      ],
      duvidas: []
    }
  }
})
for (let index = 1; index <= TASKS; index += 1) {
  await seed.deliver(
    wahaPayload(`seed-${index}`, ANA, `Paciente ${index} leito 1`)
  )
  await seed.deliver(wahaPayload(`seed-ok-${index}`, ANA, 'ok'))
}
seed.assistant.beginStop()
check(
  'seed: confirmed tasks',
  seed.store.openTasks(ANA).length === TASKS,
  String(seed.store.openTasks(ANA).length)
)

// --- Processes. ---
let runs = 0
function start(name, args, env) {
  runs += 1
  const log = join(dirs.logs, `${name}-${runs}.log`)
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    env: { PATH: process.env.PATH ?? '', ...env },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let output = ''
  const record = (chunk) => {
    output += String(chunk)
    appendFileSync(log, chunk)
  }
  child.stdout.on('data', record)
  child.stderr.on('data', record)
  const exited = new Promise((done) =>
    child.on('exit', (code, signal) => done({ code, signal, at: Date.now() }))
  )
  return { child, exited, output: () => output, log }
}
async function until(label, condition, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = await condition()
    if (value) return value
    if (Date.now() > deadline) {
      check(`wait: ${label}`, false, `timeout ${timeoutMs} ms`)
      throw new Error(`timeout: ${label}`)
    }
    await sleep(500)
  }
}
async function get(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) })
    return {
      status: response.status,
      body: await response.json().catch(() => undefined)
    }
  } catch {
    return undefined
  }
}
async function post(text, from = ANA, extra = {}) {
  const response = await fetch(
    `http://127.0.0.1:${ASSISTANT_PORT}/webhooks/waha`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-cvg-webhook-secret': SECRET
      },
      body: JSON.stringify(
        wahaPayload(
          `proof-${randomBytes(4).toString('hex')}`,
          from,
          text,
          extra
        )
      )
    }
  )
  return response.status
}

const program = bundle
  ? resolve(bundle)
  : join(ROOT, 'products/shift-assistant/src/main.ts')
const candidateDigest = `sha256:${sha256(readFileSync(program))}`
const assistantEnv = {
  NODE_ENV: 'production',
  SHIFT_PROVIDER: 'waha',
  SHIFT_MEMBERS: `${ANA}=Plantonista Sintetica;${GESTOR}=Gestor Sintetico*`,
  SHIFT_WEBHOOK_SECRET: SECRET,
  SHIFT_DATA_DIR: dirs.data,
  SHIFT_PORT: String(ASSISTANT_PORT),
  SHIFT_HOST: '127.0.0.1',
  SHIFT_TICK_SECONDS: '10',
  SHIFT_SEND_TIMEOUT_MS: '10000',
  WAHA_URL: `http://127.0.0.1:${wahaPort}`,
  WAHA_API_KEY: 'sandbox-waha-key',
  WHISPER_URL: `http://127.0.0.1:${whisperPort}`,
  LLM_BASE_URL: 'http://127.0.0.1:9/v1',
  LLM_MODEL: 'sandbox',
  LLM_LOCATION: 'local'
}
async function startAssistant() {
  const process_ = start(
    'assistant',
    bundle ? [program] : ['--import', 'tsx', program],
    assistantEnv
  )
  await until(
    'assistant live',
    async () =>
      (await get(`http://127.0.0.1:${ASSISTANT_PORT}/health/live`))?.status ===
      200,
    30_000
  )
  return process_
}
let receiverPort = 0
async function startReceiver() {
  const process_ = start(
    'receiver',
    [
      '--import',
      'tsx',
      'products/shift-assistant/scripts/alert-receipt-proof.mjs',
      'receiver',
      '--dir',
      dirs.receipts,
      '--token-file',
      tokenFile,
      '--port',
      String(receiverPort)
    ],
    {}
  )
  const line = await until(
    'receiver listening',
    () => /"port":(\d+)/.exec(process_.output()),
    20_000
  )
  receiverPort = Number(line[1])
  return process_
}
const monitorEnv = () => ({
  SHIFT_MONITOR_LIVE_URL: `http://127.0.0.1:${PROXY_PORT}/health/live`,
  SHIFT_MONITOR_READY_URL: `http://127.0.0.1:${PROXY_PORT}/health/ready`,
  SHIFT_MONITOR_RECEIVER_URL: `http://127.0.0.1:${receiverPort}`,
  SHIFT_MONITOR_RECEIVER_TOKEN_FILE: tokenFile,
  SHIFT_MONITOR_STATE_FILE: stateFile,
  SHIFT_MONITOR_CANDIDATE_DIGEST: candidateDigest,
  SHIFT_MONITOR_INSTANCE_ID: `instancia-prova-${randomBytes(3).toString('hex')}`
})
let instanceEnv
async function startMonitor() {
  instanceEnv ??= monitorEnv()
  const process_ = start(
    'monitor',
    ['--import', 'tsx', 'products/shift-assistant/scripts/shift-monitor.mjs'],
    instanceEnv
  )
  await until(
    'monitor started',
    () => /shift\.monitor\.started/.test(process_.output()),
    20_000
  )
  return process_
}
function receipts() {
  return readdirSync(dirs.receipts)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => {
      try {
        return [JSON.parse(readFileSync(join(dirs.receipts, name), 'utf8'))]
      } catch {
        return [] // still being written; read again on the next poll
      }
    })
    .sort((left, right) => left.receivedAt.localeCompare(right.receivedAt))
}
const receiptOf = (reasonCode, state, after = 0) =>
  receipts().find(
    (entry) =>
      entry.payload.reasonCode === reasonCode &&
      entry.payload.state === state &&
      Date.parse(entry.receivedAt) >= after
  )
function monitorState() {
  try {
    return JSON.parse(readFileSync(stateFile, 'utf8'))
  } catch {
    return { reasons: {}, queue: [] }
  }
}
const latency = (entry) =>
  (Date.parse(entry.receivedAt) - Date.parse(entry.payload.firstObservedAt)) /
  1000
async function stopProcess(handle, signal = 'SIGTERM', timeoutMs = 20_000) {
  const at = Date.now()
  handle.child.kill(signal)
  const result = await Promise.race([
    handle.exited,
    sleep(timeoutMs).then(() => undefined)
  ])
  return result ? { ...result, ms: result.at - at } : undefined
}
async function phase(name, body) {
  const begin = elapsed()
  note('phase.start', { name })
  try {
    await body()
    phases.push({ name, from: begin, to: elapsed(), result: 'done' })
  } catch (error) {
    phases.push({
      name,
      from: begin,
      to: elapsed(),
      result: 'aborted',
      error: error.message
    })
    throw error
  }
}

let receiver
let assistant
let monitor
const episodes = []
let verdictError
try {
  await phase('baseline', async () => {
    receiver = await startReceiver()
    assistant = await startAssistant()
    monitor = await startMonitor()
    await sleep(25_000)
    check(
      'baseline: no alert while healthy',
      receipts().length === 0,
      String(receipts().length)
    )
    const ready = await get(`http://127.0.0.1:${ASSISTANT_PORT}/health/ready`)
    check('baseline: ready', ready?.status === 200, JSON.stringify(ready?.body))
  })

  await phase('scheduler-without-progress', async () => {
    stand.send = 'hang'
    await until('first reminder send', () => reminders.length > 0, 150_000)
    const firing = await until(
      'scheduler_stale firing',
      () => receiptOf('scheduler_stale', 'firing'),
      150_000
    )
    stand.send = 'ok'
    check(
      'scheduler: motive and severity',
      firing.payload.severity === 'critical'
    )
    check(
      'scheduler: firing within 30 s of the first failed probe',
      latency(firing) <= 30,
      latency(firing)
    )
    const uncertain = await until(
      'reminder_uncertain firing',
      () => receiptOf('reminder_uncertain', 'firing'),
      60_000
    )
    check(
      'uncertain sends alerted as warning',
      uncertain.payload.severity === 'warning'
    )
    const resolved = await until(
      'scheduler_stale resolved',
      () => receiptOf('scheduler_stale', 'resolved'),
      150_000
    )
    check(
      'scheduler: resolved with the same alertId',
      resolved.payload.alertId === firing.payload.alertId
    )
    episodes.push({
      reasonCode: 'scheduler_stale',
      firing: firing.payload.alertId,
      resolved: true,
      latencyS: latency(firing)
    })
    episodes.push({
      reasonCode: 'reminder_uncertain',
      firing: uncertain.payload.alertId,
      resolved: false,
      latencyS: latency(uncertain)
    })
  })

  await phase('slow-service', async () => {
    const since = Date.now()
    stand.proxy = 'slow'
    const firing = await until(
      'live_timeout firing (slow)',
      () => receiptOf('live_timeout', 'firing', since),
      60_000
    )
    stand.proxy = 'pass'
    check(
      'slow: firing within 30 s of the first failed probe',
      latency(firing) <= 30,
      latency(firing)
    )
    const resolved = await until(
      'live_timeout resolved (slow)',
      () => receiptOf('live_timeout', 'resolved', since),
      60_000
    )
    check(
      'slow: resolved with the same alertId',
      resolved.payload.alertId === firing.payload.alertId
    )
    episodes.push({
      reasonCode: 'live_timeout',
      cause: 'slow',
      firing: firing.payload.alertId,
      resolved: true,
      latencyS: latency(firing)
    })
  })

  let slowAlertId = episodes.at(-1).firing
  await phase('real-stop-and-durable-queue', async () => {
    stand.whisper = 'hang'
    const before = whisperRequests
    check(
      'stop: audio accepted',
      (await post('', ANA, {
        hasMedia: true,
        media: {
          url: `http://127.0.0.1:${wahaPort}/api/files/p.ogg`,
          mimetype: 'audio/ogg'
        }
      })) === 200
    )
    await until(
      'whisper request in flight',
      () => whisperRequests > before,
      30_000
    )
    const receiverStop = await stopProcess(receiver)
    check(
      'receiver stopped for the queue test',
      receiverStop?.code === 0,
      JSON.stringify(receiverStop)
    )
    const stop = await stopProcess(assistant)
    check(
      'stop: SIGTERM ends the process within 10 s',
      stop !== undefined && stop.ms <= 10_000,
      stop?.ms
    )
    check(
      'stop: clean exit code 0',
      stop?.code === 0 && stop.signal === null,
      JSON.stringify(stop)
    )
    check(
      'stop: logged clean stop',
      /"shift\.stopped","clean":true/.test(assistant.output())
    )
    const pending = await until(
      'delivery attempted while the receiver is down',
      () =>
        monitorState().queue.find(
          (item) =>
            item.reasonCode === 'live_unreachable' &&
            item.status === 'pending' &&
            item.attempts >= 1
        ),
      60_000
    )
    const killed = await stopProcess(monitor, 'SIGKILL')
    check(
      'monitor killed (crash) with the alert queued',
      killed?.signal === 'SIGKILL'
    )
    const store = new ShiftStore(dirs.data, { readOnly: true })
    const pendingAudio = store
      .unprocessedMessages()
      .filter((message) => message.kind === 'audio').length
    check(
      'stop: pending audio kept for processing',
      pendingAudio === 1,
      pendingAudio
    )
    const uncertain = store.uncertainReminders().map((task) => task.number)
    check(
      'stop: interrupted reminders are uncertain',
      uncertain.length > 0,
      uncertain.length
    )
    receiver = await startReceiver()
    monitor = await startMonitor()
    const firing = await until(
      'live_unreachable firing after the monitor restart',
      () => receiptOf('live_unreachable', 'firing'),
      90_000
    )
    const delivered = monitorState().queue.find(
      (item) => item.deliveryId === pending.deliveryId
    )
    check(
      'durable queue: same delivery delivered after restart',
      delivered?.status === 'delivered' &&
        delivered.attempts >= 2 &&
        delivered.receiptId === firing.receiptId,
      JSON.stringify({
        status: delivered?.status,
        attempts: delivered?.attempts
      })
    )
    stand.whisper = 'ok'
    const restartAt = Date.now()
    assistant = await startAssistant()
    await until(
      'pending audio processed after restart',
      async () =>
        (await get(`http://127.0.0.1:${ASSISTANT_PORT}/health`))?.body
          ?.pendingMessages === 0,
      60_000
    )
    const resolved = await until(
      'live_unreachable resolved',
      () => receiptOf('live_unreachable', 'resolved'),
      60_000
    )
    check(
      'stop: resolved with the same alertId',
      resolved.payload.alertId === firing.payload.alertId
    )
    await sleep(25_000) // two scheduler rounds
    const resent = reminders.filter(
      (entry) => entry.at >= restartAt && uncertain.includes(entry.number)
    )
    check(
      'restart: uncertain reminders not resent',
      resent.length === 0,
      resent.length
    )
    episodes.push({
      reasonCode: 'live_unreachable',
      cause: 'SIGTERM',
      firing: firing.payload.alertId,
      resolved: true,
      latencyS: latency(firing),
      queuedByDesign: true
    })
  })

  await phase('frozen-process-and-supervisor', async () => {
    const since = Date.now()
    assistant.child.kill('SIGSTOP')
    const firing = await until(
      'live_timeout firing (frozen)',
      () => receiptOf('live_timeout', 'firing', since),
      60_000
    )
    check(
      'frozen: firing within 30 s of the first failed probe',
      latency(firing) <= 30,
      latency(firing)
    )
    check('frozen: a new episode id', firing.payload.alertId !== slowAlertId)
    const term = Date.now()
    assistant.child.kill('SIGTERM')
    const graceful = await Promise.race([
      assistant.exited,
      sleep(15_000).then(() => undefined)
    ])
    check(
      'frozen: SIGTERM cannot end a frozen process within the 15 s grace',
      graceful === undefined
    )
    assistant.child.kill('SIGKILL')
    const killed = await assistant.exited
    check(
      'frozen: supervisor SIGKILL ends it with a non-zero status',
      killed.signal === 'SIGKILL' && killed.code === null,
      JSON.stringify({ ...killed, ms: killed.at - term })
    )
    assistant = await startAssistant()
    const resolved = await until(
      'live_timeout resolved (frozen)',
      () => receiptOf('live_timeout', 'resolved', since),
      60_000
    )
    check(
      'frozen: resolved with the same alertId',
      resolved.payload.alertId === firing.payload.alertId
    )
    episodes.push({
      reasonCode: 'live_timeout',
      cause: 'SIGSTOP',
      firing: firing.payload.alertId,
      resolved: true,
      latencyS: latency(firing)
    })
  })

  await phase('pause-notice', async () => {
    const since = Date.now()
    check('pause accepted', (await post('pausar assistente', GESTOR)) === 200)
    const firing = await until(
      'paused notice',
      () => receiptOf('paused', 'firing', since),
      60_000
    )
    check(
      'pause: state notice, not an incident',
      firing.payload.severity === 'info'
    )
    const critical = receipts().filter(
      (entry) =>
        Date.parse(entry.receivedAt) >= since &&
        entry.payload.severity === 'critical' &&
        entry.payload.state === 'firing'
    )
    check(
      'pause: no critical alert while paused',
      critical.length === 0,
      critical.length
    )
    check('resume accepted', (await post('retomar assistente', GESTOR)) === 200)
    const resolved = await until(
      'paused resolved',
      () => receiptOf('paused', 'resolved', since),
      60_000
    )
    check(
      'pause: resolved with the same alertId',
      resolved.payload.alertId === firing.payload.alertId
    )
    episodes.push({
      reasonCode: 'paused',
      firing: firing.payload.alertId,
      resolved: true,
      latencyS: latency(firing)
    })
  })
} catch (error) {
  verdictError = error.message
} finally {
  const ends = {}
  if (monitor) ends.monitor = await stopProcess(monitor)
  if (assistant) ends.assistant = await stopProcess(assistant)
  if (receiver) ends.receiver = await stopProcess(receiver)
  for (const [name, end] of Object.entries(ends)) {
    if (!end) {
      const handle = { monitor, assistant, receiver }[name]
      handle?.child.kill('SIGKILL')
    }
  }
  check(
    'final: assistant stop clean and bounded',
    ends.assistant?.code === 0 && ends.assistant.ms <= 10_000,
    JSON.stringify(ends.assistant)
  )
  check(
    'final: monitor and receiver exit 0',
    ends.monitor?.code === 0 && ends.receiver?.code === 0
  )
  for (const server of [waha, whisper, proxy]) {
    server.closeAllConnections()
    server.close()
  }
}

// --- Compare what the monitor delivered with what the receiver stored. ---
const all = receipts()
const state = monitorState()
const delivered = state.queue.filter((item) => item.status === 'delivered')
const failed = state.queue.filter((item) => item.status === 'failed')
const byReceipt = new Map(all.map((entry) => [entry.receiptId, entry]))
const mismatches = delivered.filter((item) => {
  const stored = byReceipt.get(item.receiptId)
  return (
    !stored ||
    stored.payloadSha256 !== item.payloadSha256 ||
    sha256(item.body) !== item.payloadSha256 ||
    sha256(JSON.stringify(stored.payload)) !== item.payloadSha256
  )
})
check(
  'every delivered alert has the stored receipt with the same payload hash',
  delivered.length > 0 && mismatches.length === 0,
  `${delivered.length} delivered, ${mismatches.length} mismatched`
)
check(
  'every stored receipt was delivered by the monitor',
  all.length === delivered.length,
  `${all.length} stored`
)
check('no delivery failed', failed.length === 0, failed.length)
check(
  'events have exactly the listed fields',
  all.every((entry) => isAlertEvent(entry.payload))
)
const text = JSON.stringify(all.map((entry) => entry.payload))
check(
  'events are content-free',
  !text.includes(ANA) &&
    !text.includes('http') &&
    !text.includes('127.0.0.1') &&
    !/Paciente|Plantonista|Gestor/.test(text)
)
const ids = new Map()
for (const entry of all) {
  const key = entry.payload.alertId
  ids.set(key, new Set([...(ids.get(key) ?? []), entry.payload.reasonCode]))
}
check(
  'one reason per alertId',
  [...ids.values()].every((codes) => codes.size === 1)
)

const report = {
  schemaVersion: 1,
  kind: 'shift-assistant-alert-receipt-proof',
  candidateDigest,
  program: bundle ? 'bundle' : 'src/main.ts',
  assistantPort: ASSISTANT_PORT,
  proxyPort: PROXY_PORT,
  monitor: {
    intervalS: 10,
    timeoutS: 2,
    failuresToFire: 2,
    successesToResolve: 2
  },
  durationS: elapsed(),
  phases,
  episodes,
  receipts: all.map((entry) => ({
    receiptId: entry.receiptId,
    receivedAt: entry.receivedAt,
    payloadSha256: entry.payloadSha256,
    reasonCode: entry.payload.reasonCode,
    state: entry.payload.state,
    severity: entry.payload.severity,
    alertId: entry.payload.alertId,
    firstObservedAt: entry.payload.firstObservedAt,
    observedAt: entry.payload.observedAt
  })),
  checks,
  ...(verdictError ? { error: verdictError } : {}),
  verdict:
    !verdictError && checks.length > 0 && checks.every((entry) => entry.pass)
      ? 'PASS'
      : 'FAIL'
}
writeFileSync(join(work, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
process.exit(report.verdict === 'PASS' ? 0 : 1)
