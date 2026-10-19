import { EventEmitter } from 'node:events'
import { performance } from 'node:perf_hooks'
import { CHECK_IDS, probeError } from './schema.mjs'
import { canonicalJson } from '../../support/governed-test-kit/index.js'

const CODES = new Set([
  'IO',
  'CLEANUP',
  'PROTOCOL',
  'PRIVACY',
  'CAP',
  'TIMEOUT',
  'SIGNAL',
  'DRIFT_RUNTIME',
  'TOOLCHAIN_UNAVAILABLE',
  'INPUT_INVALID',
  'IDENTITY_MISMATCH',
  'CONTAINMENT',
  'NO_ELIGIBLE_EXCHANGE'
])
const PHASES = new Set([
  'INPUT',
  'PREFLIGHT',
  'VERSION',
  'PORT',
  'CLEANUP',
  'PUBLICATION'
])
const emptyProbe = () => ({
  startedAt: null,
  endedAt: null,
  exitCode: null,
  timeout: false,
  signal: null
})

export class RunState {
  constructor({
    now = () => performance.now(),
    timestamp = () => new Date().toISOString(),
    simulated = false
  } = {}) {
    this.now = now
    this.timestamp = timestamp
    this.started = now()
    this.deadline = this.started + 30000
    this.phase = 'INPUT'
    this.events = new EventEmitter()
    this.records = []
    this.errors = []
    this.failures = []
    this.seenErrors = new WeakSet()
    this.artifacts = new Map()
    this.simulated = simulated
    this.nativeExecution = {
      versionObserved: null,
      versionProbe: emptyProbe(),
      portProbe: emptyProbe()
    }
    this.checks = CHECK_IDS.map((id) => ({
      id,
      status: 'NOT_RUN',
      message: 'Not reached',
      proofs: []
    }))
    this.limitations = [
      'Port observation with deliberate HTTP503 only; no SDK, model protocol, M1 or functional parity qualification.',
      'Local response finish does not prove that the native client consumed the response.',
      'Null native fields mean their actual values were not observed; wrapper exit codes never substitute for them.'
    ]
    if (simulated)
      this.limitations.push('SIMULATED_TEST_CONTROL_PATH_NOT_NATIVE_EVIDENCE')
  }
  record(source, type, data) {
    if (this.records.length >= 1024) throw probeError('CAP')
    const ordinal = this.records.length
    const snapshot = JSON.parse(canonicalJson(data))
    this.records.push({
      ordinal,
      offsetMs: Math.max(0, Math.round(this.now() - this.started)),
      source,
      type,
      data: snapshot
    })
    this.events.emit('change')
    return ordinal
  }
  check(id, status, message, proofs = []) {
    const check = this.checks.find((x) => x.id === id)
    if (!check) throw probeError('PROTOCOL')
    if (check.status === 'FAIL' && status === 'PASS') return
    Object.assign(check, { status, message, proofs: [...proofs] })
  }
  failure(error, source = 'HOST', phase = this.phase) {
    const actual = error instanceof Error ? error : probeError('IO')
    if (this.seenErrors.has(actual)) return
    this.seenErrors.add(actual)
    if (this.errors.length >= 64) return
    const code = CODES.has(actual.code)
      ? actual.code
      : actual.status === 'INVALID_INPUT'
        ? 'INPUT_INVALID'
        : 'IO'
    const order = this.errors.length
    this.errors.push(actual)
    const origin = ['HOST', 'DOCKER', 'CLIENT', 'OBSERVER'].includes(
      source.toUpperCase()
    )
      ? source.toUpperCase()
      : 'HOST'
    const recordOrdinal =
      this.records.length < 1024
        ? this.record('HOST', 'FAILURE', { code, source: origin, phase, order })
        : null
    this.failures.push({
      code,
      source: origin,
      phase: PHASES.has(phase) ? phase : 'PORT',
      order,
      recordOrdinal
    })
    this.events.emit('change')
  }
  async wait(
    predicate,
    { deadline = this.deadline, tolerateFailure = false } = {}
  ) {
    while (!predicate()) {
      if (!tolerateFailure && this.errors.length) throw this.errors[0]
      const remaining = deadline - this.now()
      if (remaining <= 0) throw probeError('TIMEOUT')
      await new Promise((resolve, reject) => {
        const cleanup = () => {
          clearTimeout(timer)
          this.events.off('change', change)
        }
        const change = () => {
          cleanup()
          resolve()
        }
        const timer = setTimeout(
          () => {
            cleanup()
            reject(probeError('TIMEOUT'))
          },
          Math.max(1, Math.ceil(remaining))
        )
        this.events.once('change', change)
      })
    }
    if (!tolerateFailure && this.errors.length) throw this.errors[0]
  }
  cause() {
    return this.errors.length
      ? new AggregateError([...this.errors], 'Native port probe failed', {
          cause: this.errors[0]
        })
      : null
  }
}
