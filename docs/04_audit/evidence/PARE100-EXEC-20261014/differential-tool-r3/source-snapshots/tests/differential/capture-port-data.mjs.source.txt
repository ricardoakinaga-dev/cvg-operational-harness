import { types } from 'node:util'

const signalPrototype = AbortSignal.prototype
const signalAborted = Object.getOwnPropertyDescriptor(
  signalPrototype,
  'aborted'
).get
const signalReason = Object.getOwnPropertyDescriptor(
  signalPrototype,
  'reason'
).get
// In jsdom tests Node's AbortController and the DOM global may have distinct
// DOMException prototypes. Capture both genuine built-in implementations.
const defaultController = new AbortController()
defaultController.abort()
const exceptionTypes = [
  ...new Set([
    DOMException.prototype,
    Object.getPrototypeOf(signalReason.call(defaultController.signal))
  ])
].map((prototype) => ({
  prototype,
  name: Object.getOwnPropertyDescriptor(prototype, 'name').get,
  message: Object.getOwnPropertyDescriptor(prototype, 'message').get
}))

const invalid = () => {
  throw new Error('invalid native port data')
}

function errorField(reason, key) {
  for (
    let current = reason;
    current;
    current = Object.getPrototypeOf(current)
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key)
    if (!descriptor) continue
    if (
      !Object.hasOwn(descriptor, 'value') ||
      typeof descriptor.value !== 'string'
    )
      invalid()
    return descriptor.value
  }
  invalid()
}

function captureReason(reason) {
  if (reason === undefined) return null
  const exception = exceptionTypes.find(
    ({ prototype }) => Object.getPrototypeOf(reason ?? {}) === prototype
  )
  if (exception) {
    if (Object.hasOwn(reason, 'name') || Object.hasOwn(reason, 'message'))
      invalid()
    return {
      kind: 'Error',
      name: exception.name.call(reason),
      message: exception.message.call(reason)
    }
  }
  if (types.isNativeError(reason))
    return {
      kind: 'Error',
      name: errorField(reason, 'name'),
      message: errorField(reason, 'message')
    }
  return capturePortData(reason)
}

/** Capture own JSON data once, reject getters/coercion, detach and freeze. */
export function capturePortData(input) {
  const ancestors = new Set()
  let nodes = 0
  let bytes = 0
  const count = (value) => {
    bytes += Buffer.byteLength(value)
    if (bytes > 512 * 1024) invalid()
  }
  const walk = (value, depth) => {
    if (++nodes > 20000 || depth > 64) invalid()
    if (value === null || typeof value === 'boolean') return value
    if (typeof value === 'string') {
      count(value)
      return value
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Object.is(value, -0)) invalid()
      return value
    }
    if (!value || typeof value !== 'object' || ancestors.has(value)) invalid()
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const keys = Reflect.ownKeys(value)
    if (keys.some((key) => typeof key !== 'string')) invalid()
    const array = Array.isArray(value)
    if (
      Object.getPrototypeOf(value) !==
      (array ? Array.prototype : Object.prototype)
    )
      invalid()
    if (array && keys.length !== value.length + 1) invalid()
    ancestors.add(value)
    const entries = []
    for (const key of keys) {
      if (array && key === 'length') continue
      const descriptor = descriptors[key]
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value'))
        invalid()
      count(key)
      entries.push([key, walk(descriptor.value, depth + 1)])
    }
    let result
    if (array) {
      if (entries.some(([key], index) => key !== String(index))) invalid()
      result = entries.map((entry) => entry[1])
    } else result = Object.fromEntries(entries)
    ancestors.delete(value)
    return Object.freeze(result)
  }
  const captured = walk(input, 0)
  if (Buffer.byteLength(JSON.stringify(captured)) > 512 * 1024) invalid()
  return captured
}

/** Every own data field is retained. AbortSignal is an explicit non-JSON
 * identity/state receipt; it is not silently serialized as an empty object. */
function captureRequest(input, state) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.getPrototypeOf(input) !== Object.prototype
  )
    invalid()
  const descriptors = Object.getOwnPropertyDescriptors(input)
  if (Reflect.ownKeys(input).some((key) => typeof key !== 'string')) invalid()
  const entries = []
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) invalid()
    if (key !== 'signal') entries.push([key, descriptor.value])
  }
  const signal = descriptors.signal?.value
  let receipt = { kind: 'absent', own: Object.hasOwn(descriptors, 'signal') }
  if (signal !== undefined) {
    if (
      !signal ||
      Object.getPrototypeOf(signal) !== signalPrototype ||
      Object.hasOwn(signal, 'aborted') ||
      Object.hasOwn(signal, 'reason')
    )
      invalid()
    // Intrinsic getters validate the native brand and ignore overridable lookup.
    const aborted = signalAborted.call(signal)
    const reason = signalReason.call(signal)
    if (!state.signalIds.has(signal))
      state.signalIds.set(signal, state.nextSignal++)
    receipt = {
      kind: 'AbortSignal',
      own: true,
      identity: `signal-${state.signalIds.get(signal)}`,
      aborted,
      reason: captureReason(reason)
    }
  }
  return Object.freeze({
    request: capturePortData(Object.fromEntries(entries)),
    signal: capturePortData(receipt)
  })
}

export function createPortRequestCapture() {
  const state = { signalIds: new WeakMap(), nextSignal: 0 }
  return (input) => captureRequest(input, state)
}

export const capturePortRequest = createPortRequestCapture()
