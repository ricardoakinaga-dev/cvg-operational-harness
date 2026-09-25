const HEX64 = /^[0-9a-f]{64}$/
const IMAGE_ID = /^sha256:[0-9a-f]{64}$/
const BASE_IMAGE = /@sha256:[0-9a-f]{64}$/

export const RUNTIME_IMAGE_CONTRACT = 'rem21-016-v1'
export const RUNTIME_IMAGE_ENTRYPOINT = ['node', 'apps/api/dist/main.js']

function equalArray(left, right) {
  return (
    Array.isArray(left) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

export function validateRuntimeImageManifest(manifest, expected = {}) {
  const failures = []
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    failures.push('manifest_not_object')
  } else {
    if (manifest.schemaVersion !== 1) failures.push('schema_version')
    if (manifest.kind !== 'cvg-runtime-image') failures.push('kind')
    if (manifest.contract !== RUNTIME_IMAGE_CONTRACT) failures.push('contract')
    if (typeof manifest.runId !== 'string' || manifest.runId.length === 0) {
      failures.push('run_id')
    }
    if (
      typeof manifest.candidateId !== 'string' ||
      !HEX64.test(manifest.candidateId)
    ) {
      failures.push('candidate_id')
    }
    if (
      typeof manifest.imageId !== 'string' ||
      !IMAGE_ID.test(manifest.imageId)
    ) {
      failures.push('image_id')
    }
    if (
      typeof manifest.baseImageRef !== 'string' ||
      !BASE_IMAGE.test(manifest.baseImageRef)
    ) {
      failures.push('base_image_ref')
    }
    if (manifest.configUser !== 'cvg') failures.push('config_user')
    if (!equalArray(manifest.cmd, RUNTIME_IMAGE_ENTRYPOINT)) {
      failures.push('entrypoint')
    }
    if (
      manifest.smoke?.status !== 'PASS' ||
      manifest.smoke?.live !== 200 ||
      manifest.smoke?.ready !== 200
    ) {
      failures.push('smoke')
    }
    if (expected.runId !== undefined && manifest.runId !== expected.runId) {
      failures.push('run_binding')
    }
    if (
      expected.candidateId !== undefined &&
      manifest.candidateId !== expected.candidateId
    ) {
      failures.push('candidate_binding')
    }
  }

  if (failures.length > 0) {
    throw new Error(`runtime_image_contract_invalid:${failures.join(',')}`)
  }
  return { pass: true }
}
