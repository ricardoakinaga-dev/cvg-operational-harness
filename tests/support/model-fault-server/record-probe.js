// Static, explicitly scrubbed child entrypoint. No argv carries code or traffic.
import assert from 'node:assert/strict'
import { request } from 'node:http'
import {
  mkdir,
  readFile,
  writeFile,
  symlink,
  mkdtemp,
  stat
} from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  createModelFaultServer,
  persistSyntheticRecording,
  SCENARIOS
} from './index.js'
import { expectedRequestBytes } from './contract.js'
import { canonicalJson, jsonDigest } from '../governed-test-kit/index.js'

const planFor = (scenario, chunkDelayMs = 1) => ({
  version: 1,
  suiteId: 'mf-child',
  caseId: 'mf-case',
  scenario,
  maxRequests: 1,
  chunkDelayMs
})
async function exchange(server, plan, override = {}) {
  return new Promise((resolve) => {
    const parts = []
    let status = 0
    const client = request(
      `${server.url}/chat/completions`,
      {
        method: 'POST',
        agent: false,
        headers: { 'content-type': 'application/json', ...override.headers }
      },
      (response) => {
        status = response.statusCode
        response.on('data', (chunk) => parts.push(chunk))
        response.on('error', () => {})
        response.on('close', () =>
          resolve({ status, bytes: Buffer.concat(parts) })
        )
      }
    )
    client.on('error', () => resolve({ status, bytes: Buffer.concat(parts) }))
    const deadline = setTimeout(() => client.destroy(), 100)
    client.once('close', () => clearTimeout(deadline))
    client.end(override.body ?? expectedRequestBytes(plan))
  })
}
async function settled(server) {
  // Real I/O completion, no global clock substitutions.
  const deadline = Date.now() + 500
  while (server.state().active && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 1))
  assert.equal(server.state().active, 0)
}
function redigest(record) {
  const body = { ...record }
  delete body.digest
  return { ...body, digest: jsonDigest(body) }
}
const mode = process.argv[2]
const root = await mkdtemp(join(tmpdir(), 'record-probe-'))
await mkdir(join(root, 'nested'), { mode: 0o700 })
const positive = async () => {
  let chunked
  let firstPlan
  for (const scenario of SCENARIOS) {
    const plan = planFor(scenario)
    const server = await createModelFaultServer(plan, { mode: 'record' })
    assert.throws(() => server.recording())
    let record
    let wire
    try {
      wire = await exchange(server, plan)
      await settled(server)
      record = server.recording()
      assert.deepEqual(
        Buffer.concat(
          record.chunks.map((c) => Buffer.from(c.base64, 'base64'))
        ),
        wire.bytes
      )
      assert.equal(
        record.termination,
        scenario === 'disconnect'
          ? 'disconnect'
          : scenario === 'timeout'
            ? 'timeout'
            : 'complete'
      )
      assert.equal(server.requestHistory().length, 1)
      assert.equal(record.status, scenario === 'rate-limit' ? 429 : 200)
      if (scenario === 'chunked-json') {
        assert.equal(record.chunks.length, 2)
        assert.equal(
          Buffer.from(record.chunks[0].base64, 'base64').at(-1),
          0xc3
        )
        assert.equal(Buffer.from(record.chunks[1].base64, 'base64')[0], 0xa1)
        chunked = record
        firstPlan = plan
      }
    } finally {
      await server.close()
    }
    const replay = await createModelFaultServer(plan, { recording: record })
    try {
      assert.deepEqual(await exchange(replay, plan), wire)
      await settled(replay)
      assert.deepEqual(replay.recording(), record)
    } finally {
      await replay.close()
    }
  }
  const output = await persistSyntheticRecording(chunked, {
    evidenceRoot: root,
    path: 'nested/original.json',
    mode: 'record',
    previousDigest: null
  })
  const original = await readFile(join(root, output.path))
  assert.equal(original.toString(), `${canonicalJson(chunked)}\n`)
  assert.equal((await stat(join(root, output.path))).mode & 0o777, 0o600)
  await assert.rejects(
    persistSyntheticRecording(chunked, {
      evidenceRoot: root,
      path: output.path,
      mode: 'record',
      previousDigest: null
    })
  )
  const freshPlan = planFor('ok-json', 2)
  const fresh = await createModelFaultServer(freshPlan, { mode: 'refresh' })
  let next
  try {
    await exchange(fresh, freshPlan)
    await settled(fresh)
    next = fresh.recording()
  } finally {
    await fresh.close()
  }
  const updated = await persistSyntheticRecording(next, {
    evidenceRoot: root,
    path: output.path,
    mode: 'refresh',
    previousDigest: chunked.digest
  })
  assert.equal(updated.path, `${output.path}.refresh-${next.digest}.json`)
  assert.deepEqual(await readFile(join(root, output.path)), original)
  assert.equal(
    await readFile(join(root, updated.path), 'utf8'),
    `${canonicalJson(next)}\n`
  )
  await assert.rejects(
    persistSyntheticRecording(next, {
      evidenceRoot: root,
      path: output.path,
      mode: 'refresh',
      previousDigest: chunked.digest
    })
  )
  for (const path of [
    '../escape.json',
    '/tmp/escape.json',
    'nested/../escape.json',
    'a'.repeat(129)
  ])
    await assert.rejects(
      persistSyntheticRecording(chunked, {
        evidenceRoot: root,
        path,
        mode: 'record',
        previousDigest: null
      })
    )
  await symlink(join(root, 'nested'), join(root, 'link'))
  await assert.rejects(
    persistSyntheticRecording(chunked, {
      evidenceRoot: root,
      path: 'link/no.json',
      mode: 'record',
      previousDigest: null
    })
  )
  await symlink(join(root, output.path), join(root, 'linked.json'))
  await assert.rejects(
    persistSyntheticRecording(next, {
      evidenceRoot: root,
      path: 'linked.json',
      mode: 'refresh',
      previousDigest: chunked.digest
    })
  )
  for (const [index, raw] of [
    ` ${canonicalJson(chunked)}\n`,
    canonicalJson(chunked),
    `${canonicalJson(chunked).replace('"synthetic":true', '"synthetic":false,"synthetic":true')}\n`,
    `${canonicalJson(chunked).replace('"suiteId":"mf-child"', '"suiteId":"HOSTILE_FAKE","suiteId":"mf-child"')}\n`
  ].entries()) {
    const path = `bad-${index}.json`
    await writeFile(join(root, path), raw)
    await assert.rejects(
      persistSyntheticRecording(next, {
        evidenceRoot: root,
        path,
        mode: 'refresh',
        previousDigest: chunked.digest
      })
    )
    assert.equal(await readFile(join(root, path), 'utf8'), raw)
  }
  await assert.rejects(
    persistSyntheticRecording(next, {
      evidenceRoot: root,
      path: output.path,
      mode: 'refresh',
      previousDigest: '0'.repeat(64)
    })
  )
  // Byte/ordinal/delay/termination/status/headers/digest tampering, even rehashed.
  for (const alter of [
    (r) => {
      r.chunks[0].base64 = Buffer.from('HOSTILE_FAKE').toString('base64')
    },
    (r) => {
      r.chunks[0].ordinal = 1
    },
    (r) => {
      r.chunks.reverse()
    },
    (r) => {
      r.chunks.pop()
    },
    (r) => {
      r.chunks[0].base64 += '='
    },
    (r) => {
      r.chunks[0].delayMs = 101
    },
    (r) => {
      r.chunks[0].base64 = 'YQ=='.repeat(1025)
    },
    (r) => {
      r.chunks = Array.from({ length: 33 }, (_, ordinal) => ({
        ordinal,
        delayMs: 0,
        base64: 'YQ=='
      }))
    },
    (r) => {
      r.termination = 'disconnect'
    },
    (r) => {
      r.status = 429
    },
    (r) => {
      r.headers['x-extra'] = 'HOSTILE_FAKE'
    },
    (r) => {
      r.synthetic = false
    },
    (r) => {
      r.extra = 'HOSTILE_FAKE'
    },
    (r) => {
      r.requestSha256 = '0'.repeat(64)
    },
    (r) => {
      r.planSha256 = '0'.repeat(64)
    }
  ]) {
    const bad = JSON.parse(canonicalJson(chunked))
    alter(bad)
    await assert.rejects(
      createModelFaultServer(firstPlan, { recording: redigest(bad) })
    )
    await assert.rejects(
      persistSyntheticRecording(redigest(bad), {
        evidenceRoot: root,
        path: 'never.json',
        mode: 'record',
        previousDigest: null
      })
    )
  }
  await assert.rejects(
    createModelFaultServer(firstPlan, {
      recording: { ...chunked, digest: '0'.repeat(64) }
    })
  )
  // Refuse every hostile request before history/record; no rejected payload storage.
  const goodBody = expectedRequestBytes(firstPlan).toString()
  for (const override of [
    {
      body: goodBody.replace(
        '"messages":',
        '"messages":[{"role":"user","content":"HOSTILE_FAKE"}],"messages":'
      )
    },
    { body: goodBody.replace('CVG_SYNTHETIC_REQUEST:mf-case', 'HOSTILE_FAKE') },
    { headers: { authorization: 'Bearer HOSTILE_FAKE' } },
    { headers: { 'x-api-key': 'HOSTILE_FAKE' } },
    { headers: { cookie: 'HOSTILE_FAKE' } },
    { headers: { 'proxy-authorization': 'HOSTILE_FAKE' } }
  ]) {
    const server = await createModelFaultServer(firstPlan, { mode: 'record' })
    try {
      assert.equal((await exchange(server, firstPlan, override)).status, 400)
      await settled(server)
      assert.deepEqual(server.requestHistory(), [])
      assert.throws(
        () => server.recording(),
        (error) => !String(error).includes('HOSTILE_FAKE')
      )
      assert.ok(!canonicalJson(server.state()).includes('HOSTILE_FAKE'))
    } finally {
      await server.close()
    }
  }
  console.log(
    JSON.stringify({
      probe: 'record-refresh',
      scenarios: 7,
      status: 'observed',
      digest: next.digest
    })
  )
}
const negative = async () => {
  const plan = planFor('ok-json')
  await assert.rejects(
    createModelFaultServer(plan, { mode: 'record' }),
    (error) =>
      String(error).includes('credential environment blocked') &&
      !String(error).includes('HOSTILE_FAKE')
  )
  await assert.rejects(createModelFaultServer(plan, { mode: 'refresh' }))
  // Obtain a valid recording through default replay (which does not consult env).
  const replay = await createModelFaultServer(plan)
  let recording
  try {
    await exchange(replay, plan)
    await settled(replay)
    recording = replay.recording()
  } finally {
    await replay.close()
  }
  await assert.rejects(
    persistSyntheticRecording(recording, {
      evidenceRoot: root,
      path: 'blocked.json',
      mode: 'record',
      previousDigest: null
    }),
    (error) =>
      String(error).includes('credential environment blocked') &&
      !String(error).includes('HOSTILE_FAKE')
  )
  console.log(JSON.stringify({ probe: 'credential-block', status: 'observed' }))
}
if (mode === 'positive') await positive()
else if (mode === 'negative') await negative()
else throw new Error('unknown static probe')
