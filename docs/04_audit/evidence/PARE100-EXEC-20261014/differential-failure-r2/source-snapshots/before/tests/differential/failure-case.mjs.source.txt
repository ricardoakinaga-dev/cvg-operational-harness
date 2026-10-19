const plain = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (Object.getPrototypeOf(value) !== Object.prototype) return false
  if (Object.getOwnPropertySymbols(value).length) return false
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) => Object.hasOwn(descriptor, 'value')
  )
}
const text = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= 4096

export function validateFailureCase(value) {
  if (
    !plain(value) ||
    Object.keys(value).sort().join(',') !== 'failure,id,message,version'
  )
    throw new Error('invalid failure fixture')
  const failure = value.failure
  if (
    value.version !== 1 ||
    typeof value.id !== 'string' ||
    !/^[a-z0-9_-]{1,64}$/.test(value.id) ||
    !text(value.message) ||
    !plain(failure) ||
    !text(failure.message) ||
    Object.keys(failure).some((key) => !['message', 'cause'].includes(key)) ||
    (Object.hasOwn(failure, 'cause') && !text(failure.cause))
  )
    throw new Error('invalid failure fixture')
  if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 65536)
    throw new Error('invalid failure fixture')
  return value
}

export function makeFailure(fixture) {
  validateFailureCase(fixture)
  return new Error(
    fixture.failure.message,
    fixture.failure.cause === undefined
      ? undefined
      : { cause: new Error(fixture.failure.cause) }
  )
}

// Explicit JSON encoding of the synthetic Error's data; JSON.stringify(Error)
// alone would lose its message and cause. Stack paths are not compared.
export function snapshotFailure(error, depth = 0) {
  if (!(error instanceof Error) || depth > 1)
    throw new Error('unexpected failure object')
  return {
    name: error.name,
    message: error.message,
    cause:
      error.cause === undefined ? null : snapshotFailure(error.cause, depth + 1)
  }
}
