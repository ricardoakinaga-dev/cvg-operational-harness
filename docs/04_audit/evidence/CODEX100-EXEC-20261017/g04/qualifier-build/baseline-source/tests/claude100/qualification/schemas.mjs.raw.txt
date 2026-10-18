import { QualificationError } from './errors.mjs'

export const ROLES = Object.freeze([
  'RAW_INPUT',
  'RAW_STDOUT',
  'RAW_STDERR',
  'RAW_EVENTS',
  'RAW_STATE',
  'RAW_EFFECTS'
])
export const CLASSES = Object.freeze(['FUNCTIONAL_PARITY', 'CVG_CONTROL'])
export const MiB = 1024 * 1024

export function invalid(message) {
  throw new QualificationError('INVALID_INPUT', message)
}
export function object(value, fields, required = fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid('Expected a data object')
  const keys = Object.keys(value)
  if (
    keys.some((key) => !fields.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    invalid('Unknown or missing object field')
  return value
}
export function text(value, max = 1024, min = 1) {
  if (
    typeof value !== 'string' ||
    Buffer.byteLength(value, 'utf8') < min ||
    Buffer.byteLength(value, 'utf8') > max
  )
    invalid('String outside its byte limits')
  return value
}
export function id(value) {
  text(value, 128)
  if (!/^[a-zA-Z0-9_.-]+$/.test(value)) invalid('Invalid identifier')
  return value
}
export function digest(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    invalid('Invalid SHA-256 digest')
  return value
}
export function integer(value, low, high) {
  if (!Number.isSafeInteger(value) || value < low || value > high)
    invalid('Integer outside its limits')
  return value
}
export function oneOf(value, allowed) {
  if (!allowed.includes(value)) invalid('Unknown enumerated value')
  return value
}
export function list(value, { min = 0, max = 1024 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    invalid('Array outside its limits')
  return value
}
export function unique(values) {
  if (new Set(values).size !== values.length)
    invalid('Duplicate identifier or path')
}
export function utc(value) {
  text(value, 24)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value))
    invalid('Invalid UTC timestamp')
  let normalized
  try {
    normalized = new Date(value).toISOString()
  } catch {
    invalid('Invalid UTC timestamp')
  }
  if (normalized !== value) invalid('Invalid UTC calendar date')
  return value
}
export function version(value) {
  if (!Number.isInteger(value)) invalid('Version must be an integer')
  if (value !== 1)
    throw new QualificationError('UNSUPPORTED_RULE', 'Unsupported wire version')
}

function requirements(value) {
  list(value, { min: 1 })
  value.forEach(id)
  unique(value)
}
function boolean(value) {
  if (typeof value !== 'boolean') invalid('Expected boolean')
}

export function identity(value, side) {
  if (value === null || typeof value !== 'object') invalid('Missing identity')
  if (side === 'reference')
    oneOf(value.kind, ['LOCAL_BINARY', 'REMOTE_SERVICE'])
  else oneOf(value.kind, ['CVG_SOURCE'])
  if (value.kind === 'LOCAL_BINARY') {
    object(value, [
      'kind',
      'version',
      'artifactSha256',
      'configSha256',
      'driverSha256'
    ])
    text(value.version, 128)
    digest(value.artifactSha256)
  } else if (value.kind === 'CVG_SOURCE') {
    object(value, [
      'kind',
      'commit',
      'sourceSha256',
      'configSha256',
      'schemaSha256',
      'driverSha256',
      'imageSha256'
    ])
    if (
      typeof value.commit !== 'string' ||
      !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value.commit)
    )
      invalid('Invalid commit identity')
    digest(value.sourceSha256)
    digest(value.schemaSha256)
    if (value.imageSha256 !== null) digest(value.imageSha256)
  } else {
    object(value, [
      'kind',
      'serviceId',
      'region',
      'testProfileId',
      'clientSha256',
      'configSha256',
      'driverSha256',
      'build',
      'observedAt'
    ])
    id(value.serviceId)
    id(value.region)
    id(value.testProfileId)
    digest(value.clientSha256)
    if (value.build !== null) text(value.build, 128)
    utc(value.observedAt)
  }
  digest(value.configSha256)
  digest(value.driverSha256)
  return value
}

export function execution(value) {
  object(value, ['startedAt', 'endedAt', 'exitCode', 'timeout', 'outcomeKind'])
  utc(value.startedAt)
  utc(value.endedAt)
  if (value.startedAt > value.endedAt)
    invalid('Execution ends before it starts')
  boolean(value.timeout)
  oneOf(value.outcomeKind, ['SUCCESS', 'PRODUCT_FAILURE', 'INFRA_FAILURE'])
  if (value.exitCode !== null) integer(value.exitCode, 0, 255)
  if (value.timeout && value.outcomeKind !== 'INFRA_FAILURE')
    invalid('Timeout is infrastructure failure')
  if (
    value.outcomeKind === 'SUCCESS' &&
    (value.exitCode !== 0 || value.timeout)
  )
    invalid('Invalid successful execution')
  if (
    value.outcomeKind === 'PRODUCT_FAILURE' &&
    (value.exitCode === null || value.exitCode === 0 || value.timeout)
  )
    invalid('Invalid product failure')
  return value
}
function expectedExecution(value, control) {
  object(value, ['reference', 'cvg'])
  for (const side of ['reference', 'cvg']) {
    const item = value[side]
    if (side === 'reference' && control) {
      if (item !== null)
        invalid('CVG control has no expected reference execution')
      continue
    }
    object(item, ['outcomeKind', 'exitCode'])
    oneOf(item.outcomeKind, ['SUCCESS', 'PRODUCT_FAILURE'])
    integer(item.exitCode, 0, 255)
    if ((item.outcomeKind === 'SUCCESS') !== (item.exitCode === 0))
      invalid('Invalid expected execution')
  }
}

export function artifact(value, expected = false) {
  object(
    value,
    expected ? ['path', 'sha256', 'bytes'] : ['path', 'sha256', 'bytes', 'role']
  )
  text(value.path, 65536)
  if (
    value.path.includes('\0') ||
    value.path.includes('\\') ||
    value.path.startsWith('/') ||
    value.path
      .split('/')
      .some((part) => part === '..' || part === '.' || part === '')
  )
    invalid('Artifact path is not a confined relative path')
  digest(value.sha256)
  integer(value.bytes, 0, 4 * MiB)
  if (!expected) oneOf(value.role, ROLES)
  return value
}
export function artifacts(value) {
  list(value, { min: 1, max: 32 }).forEach((item) => artifact(item))
  unique(value.map((item) => item.path))
  unique(value.map((item) => item.role))
  const names = value.map((item) => item.path)
  if (names.some((name, i) => name !== [...names].sort()[i]))
    invalid('Artifact paths must be sorted')
  if (!value.some((item) => item.role === 'RAW_INPUT'))
    invalid('RAW_INPUT artifact is required')
}
function side(value, name) {
  object(value, ['identity', 'artifacts', 'execution'])
  identity(value.identity, name)
  artifacts(value.artifacts)
  execution(value.execution)
}

export function validateManifest(value) {
  object(value, [
    'version',
    'runId',
    'scenarioId',
    'requirementIds',
    'catalogSha256',
    'ruleSha256',
    'fixtureSha256',
    'createdAt',
    'reference',
    'cvg',
    'captureAttestations'
  ])
  version(value.version)
  id(value.runId)
  id(value.scenarioId)
  requirements(value.requirementIds)
  digest(value.catalogSha256)
  digest(value.ruleSha256)
  digest(value.fixtureSha256)
  utc(value.createdAt)
  if (value.reference !== null) side(value.reference, 'reference')
  side(value.cvg, 'cvg')
  list(value.captureAttestations, {
    min: value.reference === null ? 1 : 2,
    max: value.reference === null ? 1 : 2
  }).forEach(id)
  unique(value.captureAttestations)
  return value
}

export function validateRule(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid('Invalid rule')
  version(value.version)
  if (
    value.projection === null ||
    typeof value.projection !== 'object' ||
    Array.isArray(value.projection)
  )
    invalid('Invalid projection')
  text(value.projection.kind, 128)
  if (!['EXACT_JSON', 'EXACT_BYTES'].includes(value.projection.kind))
    throw new QualificationError(
      'UNSUPPORTED_RULE',
      'Unsupported projection kind'
    )
  const fields = [
    'version',
    'scenarioId',
    'requirementIds',
    'verificationClass',
    'equivalenceDecisionRef',
    'requiredRoles',
    'projection',
    'assertions',
    'normalizationPolicy',
    'expectedExecution'
  ]
  object(value, [...fields, 'expectedArtifact'], fields)
  id(value.scenarioId)
  requirements(value.requirementIds)
  oneOf(value.verificationClass, CLASSES)
  id(value.equivalenceDecisionRef)
  const control = value.verificationClass === 'CVG_CONTROL'
  list(value.requiredRoles, { min: 1, max: ROLES.length }).forEach((role) =>
    oneOf(role, ROLES)
  )
  unique(value.requiredRoles)
  if (!value.requiredRoles.includes('RAW_INPUT'))
    invalid('Rule must require actual input')
  object(value.projection, ['kind', 'referenceRole', 'cvgRole'])
  oneOf(value.projection.cvgRole, ROLES)
  if (!value.requiredRoles.includes(value.projection.cvgRole))
    invalid('Projected artifact must be required')
  if (control) {
    if (value.projection.referenceRole !== null)
      invalid('CVG control has no reference projection')
    artifact(value.expectedArtifact, true)
  } else {
    if (Object.hasOwn(value, 'expectedArtifact'))
      invalid('Functional comparison must not fabricate an expected reference')
    oneOf(value.projection.referenceRole, ROLES)
    if (!value.requiredRoles.includes(value.projection.referenceRole))
      invalid('Projected reference artifact must be required')
  }
  list(value.assertions, { min: 1, max: 1 })
  object(value.assertions[0], ['kind'])
  oneOf(value.assertions[0].kind, ['EQUAL_COMPLETE'])
  list(value.normalizationPolicy, { max: 4 })
  if (
    value.projection.kind === 'EXACT_BYTES' &&
    value.normalizationPolicy.length
  )
    invalid('Byte comparison cannot normalize')
  // Full metadata-policy validation belongs to the single qualified Q03 kit.
  expectedExecution(value.expectedExecution, control)
  return value
}

export function validateCaptureIndex(value) {
  object(value, ['version', 'catalogSha256', 'entries'])
  version(value.version)
  digest(value.catalogSha256)
  list(value.entries, { max: 32 })
  for (const entry of value.entries) {
    object(entry, [
      'captureId',
      'collectorId',
      'runId',
      'scenarioId',
      'side',
      'identitySha256',
      'artifactSetSha256',
      'receiptPath',
      'receiptSha256'
    ])
    id(entry.captureId)
    id(entry.collectorId)
    id(entry.runId)
    id(entry.scenarioId)
    oneOf(entry.side, ['reference', 'cvg'])
    digest(entry.identitySha256)
    digest(entry.artifactSetSha256)
    artifact(
      { path: entry.receiptPath, sha256: entry.receiptSha256, bytes: 0 },
      true
    )
  }
  unique(value.entries.map((entry) => entry.captureId))
  unique(
    value.entries.map(
      (entry) => `${entry.runId}/${entry.scenarioId}/${entry.side}`
    )
  )
  return value
}
export function validateReceipt(value) {
  object(value, [
    'version',
    'captureId',
    'collectorId',
    'runId',
    'scenarioId',
    'side',
    'fixtureSha256',
    'ruleSha256',
    'identity',
    'execution',
    'artifacts'
  ])
  version(value.version)
  id(value.captureId)
  id(value.collectorId)
  id(value.runId)
  id(value.scenarioId)
  oneOf(value.side, ['reference', 'cvg'])
  digest(value.fixtureSha256)
  digest(value.ruleSha256)
  identity(value.identity, value.side)
  execution(value.execution)
  artifacts(value.artifacts)
  return value
}
export function validateAuthorityIndex(value) {
  object(value, ['version', 'catalogSha256', 'entries'])
  version(value.version)
  digest(value.catalogSha256)
  list(value.entries, { max: 32 })
  for (const entry of value.entries) {
    object(entry, [
      'decisionId',
      'scopeId',
      'ruleSha256',
      'specPath',
      'specSha256',
      'decisionReceiptPath',
      'decisionReceiptSha256',
      'decision',
      'expiresAt'
    ])
    id(entry.decisionId)
    id(entry.scopeId)
    digest(entry.ruleSha256)
    artifact({ path: entry.specPath, sha256: entry.specSha256, bytes: 0 }, true)
    artifact(
      {
        path: entry.decisionReceiptPath,
        sha256: entry.decisionReceiptSha256,
        bytes: 0
      },
      true
    )
    oneOf(entry.decision, ['APPROVED', 'DENIED', 'PENDING'])
    if (entry.expiresAt !== null) utc(entry.expiresAt)
  }
  unique(value.entries.map((entry) => entry.decisionId))
  return value
}

export function validateCatalog(value) {
  const keys = [
    'schema_version',
    'catalog_id',
    'catalog_revision',
    'status',
    'program',
    'request_scope',
    'reference',
    'full_claude_product_parity_claim',
    'mandatory_requirement_count',
    'denominator',
    'mandatory_cvg_control_count',
    'family_count',
    'numerator_pass_current',
    'baseline_meaning',
    'omission_policy',
    'metric',
    'safety_gate',
    'revision_log',
    'families',
    'requirements',
    'source_revision',
    'source_review'
  ]
  object(value, keys, [
    'schema_version',
    'catalog_id',
    'mandatory_requirement_count',
    'denominator',
    'mandatory_cvg_control_count',
    'family_count',
    'families',
    'requirements'
  ])
  version(value.schema_version)
  if (value.catalog_id !== 'CLAUDE-CAP-v1')
    invalid('Unknown capability catalog')
  list(value.requirements, { min: 134, max: 1024 })
  list(value.families, { min: 16, max: 1024 })
  const ids = [],
    familyIds = [],
    assigned = []
  for (const req of value.requirements) {
    object(
      req,
      [
        'id',
        'family_id',
        'title',
        'source',
        'verification_class',
        'required',
        'implementation_owner',
        'owner_status_ref',
        'equivalence',
        'positive_procedure',
        'negative_procedure',
        'evidence_required',
        'evidence_status',
        'evidence_refs',
        'source_review_ref'
      ],
      ['id', 'family_id', 'verification_class', 'required']
    )
    id(req.id)
    id(req.family_id)
    oneOf(req.verification_class, CLASSES)
    if (req.required !== true)
      invalid('A mandatory requirement cannot disappear from the denominator')
    ids.push(req.id)
  }
  for (const family of value.families) {
    object(
      family,
      [
        'id',
        'name',
        'requirements',
        'baseline_reading',
        'verified_current',
        'completion_rule'
      ],
      ['id', 'requirements']
    )
    id(family.id)
    requirements(family.requirements)
    for (const reqId of family.requirements) {
      const req = value.requirements.find((item) => item.id === reqId)
      if (!req || req.family_id !== family.id)
        invalid('Catalog family relationship mismatch')
      assigned.push(reqId)
    }
    familyIds.push(family.id)
  }
  unique(ids)
  unique(familyIds)
  unique(assigned)
  if (
    assigned.length !== ids.length ||
    value.mandatory_requirement_count !== ids.length ||
    value.family_count !== familyIds.length
  )
    invalid('Catalog denominator is incomplete')
  const functional = value.requirements.filter(
    (req) => req.verification_class === 'FUNCTIONAL_PARITY'
  ).length
  const controls = ids.length - functional
  if (
    functional < 117 ||
    controls < 17 ||
    value.denominator !== functional ||
    value.mandatory_cvg_control_count !== controls
  )
    invalid('Catalog counts/classes do not reconcile')
  return value
}

export function validateRequirementBindings(manifest, rule, catalog) {
  if (
    manifest.scenarioId !== rule.scenarioId ||
    manifest.requirementIds.length !== rule.requirementIds.length ||
    manifest.requirementIds.some((req, i) => req !== rule.requirementIds[i])
  )
    invalid('Scenario or requirement binding mismatch')
  for (const req of rule.requirementIds) {
    const known = catalog.requirements.find((item) => item.id === req)
    if (!known || known.verification_class !== rule.verificationClass)
      invalid('Unknown requirement or mixed verification classes')
  }
  if (rule.verificationClass === 'CVG_CONTROL' && manifest.reference !== null)
    invalid('CVG control cannot impersonate reference observations')
}
