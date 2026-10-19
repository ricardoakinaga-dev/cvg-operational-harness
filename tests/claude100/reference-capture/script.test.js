// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  API_KEY,
  MODEL,
  STDIN_MARKERS,
  argvDigest,
  canonical,
  envSet,
  envSetDigest,
  processInvocation,
  sha256
} from './constants.mjs'
import {
  FINAL_TEXT,
  MESSAGE_IDS,
  REJECT_SCRIPT,
  TOOL_USES,
  inspectNativeResult,
  inspectRequestBody,
  plannedScripts,
  sseEvent,
  turnScript
} from './script.mjs'

const parse = (buffer) =>
  buffer
    .toString('utf8')
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const [event, data] = block.split('\n')
      return { event: event.slice(7), data: JSON.parse(data.slice(6)) }
    })

describe('fixed SSE scripts (RC04)', () => {
  it('serializes the exact message_stop example and C(x) without LF', () => {
    expect(sseEvent({ type: 'message_stop' }).toString('ascii')).toBe(
      'event: message_stop\ndata: {"type":"message_stop"}\n\n'
    )
  })
  it('emits exactly seven events per turn with the five literal IDs in order', () => {
    const scripts = plannedScripts().filter((s) => s.status === 200)
    expect(scripts.map((s) => s.name)).toEqual([
      'TEXT-1',
      'READ-1',
      'READ-2',
      'WRITE_DENIED-1',
      'WRITE_DENIED-2'
    ])
    const ids = []
    for (const script of scripts) {
      expect(script.segments).toHaveLength(7)
      expect(Buffer.concat(script.segments)).toEqual(script.body)
      const events = parse(script.body)
      expect(events.map((e) => e.event)).toEqual([
        'message_start',
        'content_block_start',
        'content_block_delta',
        'content_block_delta',
        'content_block_stop',
        'message_delta',
        'message_stop'
      ])
      for (const e of events) expect(e.data.type).toBe(e.event)
      for (const e of events.slice(1, 5)) expect(e.data.index).toBe(0)
      const message = events[0].data.message
      expect(Object.keys(message).sort()).toEqual(
        [
          'id',
          'type',
          'role',
          'model',
          'content',
          'stop_reason',
          'stop_sequence',
          'usage'
        ].sort()
      )
      expect(message).toMatchObject({
        type: 'message',
        role: 'assistant',
        model: MODEL,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {
          input_tokens: 1,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0
        }
      })
      expect(events[5].data.usage).toEqual({ output_tokens: 1 })
      expect(events[5].data.delta.stop_sequence).toBeNull()
      ids.push(message.id)
      expect(script.headers).toEqual({
        'content-type': 'text/event-stream',
        'content-length': String(script.body.length),
        connection: 'close'
      })
      expect(`${message.id}${script.name}`).not.toMatch(/[\\*]/)
    }
    expect(ids).toEqual([
      'msg_cvg_TEXT_1',
      'msg_cvg_READ_1',
      'msg_cvg_READ_2',
      'msg_cvg_WRITE_DENIED_1',
      'msg_cvg_WRITE_DENIED_2'
    ])
    expect(ids).toEqual(Object.values(MESSAGE_IDS).flat())
  })
  it('uses the table TEXT deltas, floor(bytes/2) final text and C(input) tool deltas', () => {
    const text = parse(turnScript('TEXT', 1).body)
    expect(text.slice(2, 4).map((e) => e.data.delta.text)).toEqual([
      'CVG_CAPTURE_',
      'TEXT_OK_V1'
    ])
    expect(text[1].data.content_block).toEqual({ type: 'text', text: '' })
    expect(text[5].data.delta.stop_reason).toBe('end_turn')
    for (const caseId of ['READ', 'WRITE_DENIED']) {
      const tool = parse(turnScript(caseId, 1).body)
      expect(tool[1].data.content_block).toEqual({
        type: 'tool_use',
        id: TOOL_USES[caseId].id,
        name: TOOL_USES[caseId].name,
        input: {}
      })
      const json = canonical(TOOL_USES[caseId].input)
      const half = Math.floor(Buffer.byteLength(json) / 2)
      expect(tool.slice(2, 4).map((e) => e.data.delta.partial_json)).toEqual([
        json.slice(0, half),
        json.slice(half)
      ])
      expect(tool[5].data.delta.stop_reason).toBe('tool_use')
      const final = parse(turnScript(caseId, 2).body)
      const target = FINAL_TEXT[caseId]
      const cut = Math.floor(target.length / 2)
      expect(final.slice(2, 4).map((e) => e.data.delta.text)).toEqual([
        target.slice(0, cut),
        target.slice(cut)
      ])
    }
    expect(canonical(TOOL_USES.WRITE_DENIED.input)).toBe(
      '{"file_path":"/workspace/denied.txt","new_string":"CVG_CAPTURE_MUST_NOT_WRITE_V1","old_string":"","replace_all":false}'
    )
  })
  it('keeps every response within 16KiB and the five eligible bodies within 80KiB', () => {
    const scripts = plannedScripts()
    for (const s of scripts) expect(s.body.length).toBeLessThanOrEqual(16384)
    expect(REJECT_SCRIPT.status).toBe(400)
    expect(REJECT_SCRIPT.segments).toHaveLength(1)
    expect(() => turnScript('TEXT', 2)).toThrow()
    expect(() => turnScript('OTHER', 1)).toThrow()
  })
})

function body(caseId, turn, edit = (b) => b) {
  const tools =
    caseId === 'TEXT'
      ? []
      : [
          { name: 'Read', input_schema: {} },
          { name: 'Edit', input_schema: {} }
        ]
  const messages = [
    {
      role: 'user',
      content: [{ type: 'text', text: STDIN_MARKERS[caseId] }]
    }
  ]
  if (turn === 2) {
    const t = TOOL_USES[caseId]
    messages.push(
      {
        role: 'assistant',
        content: [{ type: 'tool_use', id: t.id, name: t.name, input: t.input }]
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: t.id,
            content: 'raw',
            ...(caseId === 'WRITE_DENIED' ? { is_error: true } : {})
          }
        ]
      }
    )
  }
  return Buffer.from(
    JSON.stringify(
      edit({ model: MODEL, stream: true, tools, messages, unknown: 1 })
    )
  )
}
const json = { contentType: 'JSON', contentEncoding: 'ABSENT' }

describe('structural request guards (RC03/RC05/RC06)', () => {
  it('accepts exact turns and keeps unknown data fields', () => {
    for (const [caseId, turn] of [
      ['TEXT', 1],
      ['READ', 1],
      ['READ', 2],
      ['WRITE_DENIED', 1],
      ['WRITE_DENIED', 2]
    ])
      expect(
        inspectRequestBody(body(caseId, turn), { caseId, turn, ...json })
      ).toEqual({ markerVerified: true, scriptAccepted: true })
  })
  it.each([
    ['stream false', (b) => ({ ...b, stream: false })],
    ['other model', (b) => ({ ...b, model: 'x' })],
    ['extra tool', (b) => ({ ...b, tools: [...b.tools, { name: 'Bash' }] })],
    ['duplicate tool', (b) => ({ ...b, tools: [b.tools[0], b.tools[0]] })],
    [
      'tools absent',
      (b) => {
        const copy = { ...b }
        delete copy.tools
        return copy
      }
    ]
  ])('rejects %s without correcting the request', (_name, edit) => {
    const verdict = inspectRequestBody(body('READ', 1, edit), {
      caseId: 'READ',
      turn: 1,
      ...json
    })
    expect(verdict.scriptAccepted).toBe(false)
  })
  it('rejects wrong marker, encoding, content-type, malformed JSON and a TEXT second turn', () => {
    expect(
      inspectRequestBody(body('READ', 1), { caseId: 'TEXT', turn: 1, ...json })
    ).toEqual({ markerVerified: false, scriptAccepted: false })
    expect(
      inspectRequestBody(body('TEXT', 1), {
        caseId: 'TEXT',
        turn: 1,
        contentType: 'JSON',
        contentEncoding: 'IDENTITY'
      }).scriptAccepted
    ).toBe(false)
    expect(
      inspectRequestBody(body('TEXT', 1), {
        caseId: 'TEXT',
        turn: 1,
        contentType: 'OTHER',
        contentEncoding: 'ABSENT'
      }).scriptAccepted
    ).toBe(false)
    expect(
      inspectRequestBody(Buffer.from('{"a":1,"a":2}'), {
        caseId: 'TEXT',
        turn: 1,
        ...json
      }).scriptAccepted
    ).toBe(false)
    expect(
      inspectRequestBody(body('TEXT', 1), { caseId: 'TEXT', turn: 2, ...json })
        .scriptAccepted
    ).toBe(false)
  })
  it('binds the second turn to the scripted tool_use and one matching tool_result', () => {
    const mutate = (fn) =>
      inspectRequestBody(body('WRITE_DENIED', 2, fn), {
        caseId: 'WRITE_DENIED',
        turn: 2,
        ...json
      }).scriptAccepted
    expect(
      mutate((b) => {
        b.messages[2].content[0].is_error = false
        return b
      })
    ).toBe(false)
    expect(
      mutate((b) => {
        b.messages[2].content[0].tool_use_id = 'toolu_other'
        return b
      })
    ).toBe(false)
    expect(
      mutate((b) => {
        b.messages[1].content[0].input = { file_path: '/workspace/denied.txt' }
        return b
      })
    ).toBe(false)
    expect(
      mutate((b) => {
        b.messages[2].content.push({ ...b.messages[2].content[0] })
        return b
      })
    ).toBe(false)
    expect(
      mutate((b) => {
        b.messages.push({
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'x', name: 'Read', input: {} }]
        })
        return b
      })
    ).toBe(false)
    // READ content is preserved raw and never judged: a wrong value still passes guards.
    expect(
      inspectRequestBody(
        body('READ', 2, (b) => {
          b.messages[2].content[0].content = 'WRONG_VALUE'
          return b
        }),
        { caseId: 'READ', turn: 2, ...json }
      ).scriptAccepted
    ).toBe(true)
    expect(
      inspectRequestBody(
        body('READ', 2, (b) => {
          b.messages[2].content[0].is_error = true
          return b
        }),
        { caseId: 'READ', turn: 2, ...json }
      ).scriptAccepted
    ).toBe(false)
  })
})

describe('native result contract (RC06)', () => {
  const result = (extra) =>
    Buffer.from(
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: FINAL_TEXT.WRITE_DENIED,
        permission_denials: [
          {
            tool_name: 'Edit',
            tool_use_id: 'toolu_cvg_write_1',
            tool_input: TOOL_USES.WRITE_DENIED.input,
            extra_kept: true
          }
        ],
        unknown_field: 1,
        ...extra
      })
    )
  it('requires the denial relation from the client itself, not only is_error or absence', () => {
    expect(inspectNativeResult(result(), 'WRITE_DENIED').accepted).toBe(true)
    expect(
      inspectNativeResult(result({ permission_denials: [] }), 'WRITE_DENIED')
        .reason
    ).toBe('PERMISSION_DENIAL')
    expect(
      inspectNativeResult(
        result({
          permission_denials: [
            {
              tool_name: 'Edit',
              tool_use_id: 'toolu_cvg_write_1',
              tool_input: { file_path: '/workspace/denied.txt' }
            }
          ]
        }),
        'WRITE_DENIED'
      ).accepted
    ).toBe(false)
    expect(
      inspectNativeResult(result({ is_error: true }), 'WRITE_DENIED').accepted
    ).toBe(false)
    expect(
      inspectNativeResult(result({ result: 'other' }), 'WRITE_DENIED').accepted
    ).toBe(false)
    expect(inspectNativeResult(Buffer.from('{"a":'), 'TEXT').reason).toBe(
      'JSON'
    )
    expect(inspectNativeResult(Buffer.from('[1]\n'), 'TEXT').accepted).toBe(
      false
    )
  })
})

describe('SPEC0238 rev.2 Edit denial and {Read, Edit} inventory', () => {
  const denial = (entry) =>
    Buffer.from(
      JSON.stringify({
        type: 'result',
        subtype: 'success',
        is_error: false,
        result: FINAL_TEXT.WRITE_DENIED,
        permission_denials: [entry]
      })
    )
  const literal = TOOL_USES.WRITE_DENIED.input
  it('scripts an Edit that creates denied.txt with replace_all literal', () => {
    expect(TOOL_USES.WRITE_DENIED).toEqual({
      id: 'toolu_cvg_write_1',
      name: 'Edit',
      input: {
        file_path: '/workspace/denied.txt',
        old_string: '',
        new_string: 'CVG_CAPTURE_MUST_NOT_WRITE_V1',
        replace_all: false
      }
    })
  })
  it('compares tool_input under canonical(), independent of key order (W1/W5)', () => {
    const reordered = {
      replace_all: false,
      new_string: literal.new_string,
      old_string: '',
      file_path: literal.file_path
    }
    const base = { tool_name: 'Edit', tool_use_id: 'toolu_cvg_write_1' }
    expect(
      inspectNativeResult(
        denial({ ...base, tool_input: reordered }),
        'WRITE_DENIED'
      ).accepted
    ).toBe(true)
    for (const tool_input of [
      {
        file_path: literal.file_path,
        old_string: '',
        new_string: literal.new_string
      },
      { ...literal, replace_all: true },
      { ...literal, file_path: '/workspace/./denied.txt' }
    ])
      expect(
        inspectNativeResult(denial({ ...base, tool_input }), 'WRITE_DENIED')
          .reason
      ).toBe('PERMISSION_DENIAL')
  })
  it('refuses a denial of another tool or another tool_use id (W6)', () => {
    for (const entry of [
      {
        tool_name: 'Write',
        tool_use_id: 'toolu_cvg_write_1',
        tool_input: literal
      },
      { tool_name: 'Edit', tool_use_id: 'toolu_other', tool_input: literal }
    ])
      expect(inspectNativeResult(denial(entry), 'WRITE_DENIED').reason).toBe(
        'PERMISSION_DENIAL'
      )
  })
  it('requires an absent or empty permission_denials in READ (R3)', () => {
    const read = (extra) =>
      Buffer.from(
        JSON.stringify({
          type: 'result',
          subtype: 'success',
          is_error: false,
          result: FINAL_TEXT.READ,
          ...extra
        })
      )
    expect(inspectNativeResult(read({}), 'READ').accepted).toBe(true)
    expect(
      inspectNativeResult(read({ permission_denials: [] }), 'READ').accepted
    ).toBe(true)
    for (const permission_denials of [
      [
        {
          tool_name: 'Read',
          tool_use_id: 'toolu_cvg_read_1',
          tool_input: TOOL_USES.READ.input
        }
      ],
      'x',
      null,
      {}
    ])
      expect(
        inspectNativeResult(read({ permission_denials }), 'READ').reason
      ).toBe('PERMISSION_DENIAL')
  })
  it('accepts only the exact {Read, Edit} inventory for READ and WRITE_DENIED (R2/W4)', () => {
    const verdict = (caseId, names) =>
      inspectRequestBody(
        Buffer.from(
          JSON.stringify({
            model: MODEL,
            stream: true,
            tools: names.map((name) => ({ name, input_schema: {} })),
            messages: [
              {
                role: 'user',
                content: [{ type: 'text', text: STDIN_MARKERS[caseId] }]
              }
            ]
          })
        ),
        { caseId, turn: 1, contentType: 'JSON', contentEncoding: 'ABSENT' }
      ).scriptAccepted
    for (const caseId of ['READ', 'WRITE_DENIED']) {
      expect(verdict(caseId, ['Edit', 'Read'])).toBe(true)
      expect(verdict(caseId, ['Read', 'Edit'])).toBe(true)
      for (const names of [
        ['Read'],
        ['Read', 'Write'],
        ['Read', 'Edit', 'Bash'],
        ['Read', 'Read'],
        ['Edit', 'Edit']
      ])
        expect(verdict(caseId, names)).toBe(false)
    }
  })
})

describe('fixed invocation (RC03)', () => {
  it('derives argv/env/stdin only from the closed table and the port', () => {
    const version = processInvocation(0, 4321)
    expect(version.args).toEqual(['--version'])
    expect(version.stdin.length).toBe(0)
    const text = processInvocation(1, 4321)
    expect(text.args.slice(-2)).toEqual(['--tools', ''])
    const read = processInvocation(2, 4321)
    expect(read.args.slice(-4)).toEqual([
      '--tools',
      'Read,Edit',
      '--allowedTools',
      'Read'
    ])
    expect(read.args.slice(0, 18)).toEqual(text.args.slice(0, 18))
    expect(text.args).toContain('dontAsk')
    expect(Object.keys(text.env).sort()).toEqual(
      [
        'HOME',
        'CLAUDE_CONFIG_DIR',
        'PATH',
        'LANG',
        'TZ',
        'ANTHROPIC_BASE_URL',
        'ANTHROPIC_API_KEY'
      ].sort()
    )
    expect(text.env).toMatchObject({
      HOME: '/scratch/TEXT/home',
      CLAUDE_CONFIG_DIR: '/scratch/TEXT/config',
      ANTHROPIC_BASE_URL: 'http://127.0.0.1:4321',
      ANTHROPIC_API_KEY: API_KEY
    })
    expect(version.env.HOME).toBe('/scratch/version/home')
    expect(text.stdin.toString()).toBe('CVG_CAPTURE_TEXT_V1')
    expect(Object.keys(envSet(4321))).toEqual([
      'version',
      'TEXT',
      'READ',
      'WRITE_DENIED'
    ])
    expect(envSetDigest(4321)).toBe(sha256(canonical(envSet(4321))))
    expect(envSetDigest(4321)).not.toBe(envSetDigest(4322))
    expect(argvDigest(text)).not.toBe(argvDigest(read))
    for (const bad of [-1, 4, 1.5])
      expect(() => processInvocation(bad, 4321)).toThrow()
    expect(() => processInvocation(1, 0)).toThrow()
  })
})
