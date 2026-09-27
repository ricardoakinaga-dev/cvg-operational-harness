const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CANDIDATE_ID = /^[0-9a-f]{64}$/i
const XML_NAME = /^[A-Za-z_][A-Za-z0-9_.:-]*/

function requireValue(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`E2E report binding: missing ${label}`)
  }
  return value
}

function reportText(value) {
  return Buffer.isBuffer(value) ? value.toString('utf8') : value
}

function requireCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`E2E report binding: invalid ${label}`)
  }
  return value
}

function decodeEntities(value) {
  if (
    value
      .replace(/&(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-f]+);/gi, '')
      .includes('&')
  ) {
    throw new Error('E2E report binding: malformed XML entity')
  }
  const decoded = value.replace(/&([^;]*);/g, (_, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
    if (Object.hasOwn(named, entity)) return named[entity]
    let codePoint
    if (/^#x[0-9a-f]+$/i.test(entity))
      codePoint = Number.parseInt(entity.slice(2), 16)
    else if (/^#[0-9]+$/.test(entity))
      codePoint = Number.parseInt(entity.slice(1), 10)
    if (
      codePoint === undefined ||
      !Number.isSafeInteger(codePoint) ||
      !isXmlCharacter(codePoint)
    ) {
      throw new Error('E2E report binding: malformed XML entity')
    }
    return String.fromCodePoint(codePoint)
  })
  return decoded
}

function isXmlCharacter(codePoint) {
  return (
    codePoint === 9 ||
    codePoint === 10 ||
    codePoint === 13 ||
    (codePoint >= 32 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
    (codePoint >= 0x10000 && codePoint <= 0x10ffff)
  )
}

function checkXmlCharacters(value) {
  for (const character of value) {
    if (!isXmlCharacter(character.codePointAt(0))) {
      throw new Error('E2E report binding: invalid XML character')
    }
  }
}

function parseTag(source) {
  let offset = 0
  const name = XML_NAME.exec(source)
  if (!name) throw new Error('E2E report binding: malformed XML tag')
  offset = name[0].length
  const attributes = Object.create(null)
  while (offset < source.length) {
    const spacing = /^\s+/.exec(source.slice(offset))
    if (!spacing)
      throw new Error('E2E report binding: malformed XML attributes')
    offset += spacing[0].length
    if (offset === source.length) break
    const attribute = XML_NAME.exec(source.slice(offset))
    if (!attribute)
      throw new Error('E2E report binding: malformed XML attribute')
    offset += attribute[0].length
    const assignment = /^\s*=\s*(["'])/.exec(source.slice(offset))
    if (!assignment)
      throw new Error('E2E report binding: malformed XML attribute')
    offset += assignment[0].length
    const close = source.indexOf(assignment[1], offset)
    if (close < 0 || Object.hasOwn(attributes, attribute[0])) {
      throw new Error(
        'E2E report binding: malformed or duplicate XML attribute'
      )
    }
    const rawValue = source.slice(offset, close)
    if (rawValue.includes('<'))
      throw new Error('E2E report binding: malformed XML attribute')
    checkXmlCharacters(rawValue)
    attributes[attribute[0]] = decodeEntities(rawValue)
    offset = close + 1
  }
  return { name: name[0], attributes, children: [] }
}

function parseXml(content) {
  const xml = requireValue(reportText(content), 'XML report').replace(
    /^\uFEFF/,
    ''
  )
  const stack = []
  let root
  let offset = 0
  while (offset < xml.length) {
    if (xml[offset] !== '<') {
      const end = xml.indexOf('<', offset)
      const text = xml.slice(offset, end < 0 ? xml.length : end)
      checkXmlCharacters(text)
      if (text.includes(']]>')) {
        throw new Error('E2E report binding: malformed XML text')
      }
      decodeEntities(text)
      if (stack.length === 0 && text.trim()) {
        throw new Error('E2E report binding: XML text outside root')
      }
      offset = end < 0 ? xml.length : end
      continue
    }
    if (xml.startsWith('<!--', offset)) {
      const end = xml.indexOf('-->', offset + 4)
      if (end < 0 || xml.slice(offset + 4, end).includes('--')) {
        throw new Error('E2E report binding: malformed XML comment')
      }
      offset = end + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', offset)) {
      const end = xml.indexOf(']]>', offset + 9)
      if (end < 0 || stack.length === 0) {
        throw new Error('E2E report binding: malformed XML CDATA')
      }
      checkXmlCharacters(xml.slice(offset + 9, end))
      offset = end + 3
      continue
    }
    if (xml.startsWith('<?', offset)) {
      const end = xml.indexOf('?>', offset + 2)
      const instruction = xml.slice(offset + 2, end)
      if (
        end < 0 ||
        (root && stack.length === 0) ||
        !/^[A-Za-z_][A-Za-z0-9_.:-]*(?:\s[\s\S]*)?$/.test(instruction)
      ) {
        throw new Error(
          'E2E report binding: malformed XML processing instruction'
        )
      }
      offset = end + 2
      continue
    }
    if (xml.startsWith('<!', offset)) {
      throw new Error('E2E report binding: XML declarations are unsupported')
    }
    let end = offset + 1
    let quote
    for (; end < xml.length; end++) {
      if (xml[end] === quote) quote = undefined
      else if (!quote && (xml[end] === '"' || xml[end] === "'"))
        quote = xml[end]
      else if (!quote && xml[end] === '>') break
    }
    if (end === xml.length)
      throw new Error('E2E report binding: unclosed XML tag')
    const raw = xml.slice(offset + 1, end)
    if (raw.startsWith('/')) {
      const closeName = raw.slice(1)
      if (
        !XML_NAME.test(closeName) ||
        !/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(closeName)
      ) {
        throw new Error('E2E report binding: malformed XML closing tag')
      }
      const open = stack.pop()
      if (!open || open.name !== closeName) {
        throw new Error('E2E report binding: mismatched XML closing tag')
      }
    } else {
      const selfClosing = raw.endsWith('/')
      const node = parseTag(selfClosing ? raw.slice(0, -1) : raw)
      if (stack.length) stack.at(-1).children.push(node)
      else if (root) throw new Error('E2E report binding: multiple XML roots')
      else root = node
      if (!selfClosing) stack.push(node)
    }
    offset = end + 1
  }
  if (!root || stack.length)
    throw new Error('E2E report binding: incomplete XML document')
  return root
}

function collectJsonCases(suites) {
  if (!Array.isArray(suites))
    throw new Error('E2E report binding: missing JSON suites')
  const cases = []
  function visit(suite, parentTitles, isFileSuite = false) {
    if (!suite || typeof suite !== 'object') {
      throw new Error('E2E report binding: malformed JSON suite')
    }
    if (!Array.isArray(suite.specs) || !Array.isArray(suite.suites ?? [])) {
      throw new Error('E2E report binding: malformed JSON suite inventory')
    }
    const titles = isFileSuite
      ? parentTitles
      : [...parentTitles, requireValue(suite.title, 'JSON suite title')]
    for (const spec of suite.specs) {
      const file = requireValue(spec?.file ?? suite.file, 'JSON case file')
      const title = [
        ...titles,
        requireValue(spec?.title, 'JSON case title')
      ].join(' › ')
      if (
        spec.ok !== true ||
        !Array.isArray(spec.tests) ||
        spec.tests.length === 0
      ) {
        throw new Error(
          `E2E report binding: invalid JSON case ${file}: ${title}`
        )
      }
      for (const test of spec.tests) {
        if (
          test?.expectedStatus !== 'passed' ||
          test.status !== 'expected' ||
          !Array.isArray(test.results) ||
          test.results.length !== 1 ||
          test.results[0]?.status !== 'passed' ||
          test.results[0].retry !== 0 ||
          (test.results[0].errors !== undefined &&
            !Array.isArray(test.results[0].errors)) ||
          (test.results[0].errors?.length ?? 0) !== 0
        ) {
          throw new Error(
            `E2E report binding: failed, skipped or retried JSON case ${file}: ${title}`
          )
        }
        cases.push({ file, title })
      }
    }
    for (const child of suite.suites ?? []) visit(child, titles)
  }
  for (const suite of suites) visit(suite, [], true)
  if (cases.length === 0)
    throw new Error('E2E report binding: empty JSON case inventory')
  return cases
}

function xmlCount(node, attribute) {
  const value = node.attributes[attribute]
  if (!/^(0|[1-9][0-9]*)$/.test(value ?? '')) {
    throw new Error(`E2E report binding: invalid XML ${node.name}.${attribute}`)
  }
  return requireCount(Number(value), `XML ${node.name}.${attribute}`)
}

function collectXmlCases(root) {
  if (root.name !== 'testsuites')
    throw new Error('E2E report binding: invalid JUnit root')
  const suites = root.children
  if (!suites.length || suites.some((suite) => suite.name !== 'testsuite')) {
    throw new Error('E2E report binding: invalid JUnit suites')
  }
  const cases = []
  function rejectBadChildren(node, allowed) {
    for (const child of node.children) {
      if (!allowed.includes(child.name)) {
        throw new Error(`E2E report binding: unexpected JUnit ${child.name}`)
      }
      if (child.name === 'properties') {
        rejectBadChildren(child, ['property'])
      } else if (child.children.length > 0) {
        throw new Error(
          `E2E report binding: unexpected nested JUnit ${child.name}`
        )
      }
    }
  }
  for (const suite of suites) {
    for (const key of ['failures', 'skipped', 'errors']) {
      if (xmlCount(suite, key) !== 0)
        throw new Error(`E2E report binding: JUnit suite ${key}`)
    }
    const testcases = suite.children.filter(
      (child) => child.name === 'testcase'
    )
    rejectBadChildren(
      { children: suite.children.filter((child) => child.name !== 'testcase') },
      ['properties', 'system-out', 'system-err']
    )
    if (xmlCount(suite, 'tests') !== testcases.length) {
      throw new Error('E2E report binding: JUnit suite test count mismatch')
    }
    for (const testcase of testcases) {
      if (
        testcase.children.some((child) =>
          ['failure', 'error', 'skipped'].includes(child.name)
        )
      ) {
        throw new Error('E2E report binding: JUnit case failed or skipped')
      }
      rejectBadChildren(testcase, ['system-out', 'system-err', 'properties'])
      cases.push({
        file: requireValue(
          testcase.attributes.classname,
          'JUnit case classname'
        ),
        title: requireValue(testcase.attributes.name, 'JUnit case name')
      })
    }
  }
  for (const key of ['failures', 'skipped', 'errors']) {
    if (xmlCount(root, key) !== 0)
      throw new Error(`E2E report binding: JUnit root ${key}`)
  }
  if (xmlCount(root, 'tests') !== cases.length) {
    throw new Error('E2E report binding: JUnit root test count mismatch')
  }
  return cases
}

function inventory(cases) {
  return cases.map(({ file, title }) => JSON.stringify([file, title])).sort()
}

export function validateE2eReportPair({
  jsonContent,
  xmlContent,
  expectedRunId,
  expectedCandidateId,
  expectedTestCount
}) {
  requireValue(expectedRunId, 'expected runId')
  if (!CANDIDATE_ID.test(expectedCandidateId ?? '')) {
    throw new Error('E2E report binding: invalid expected candidateId')
  }
  if (expectedTestCount !== undefined)
    requireCount(expectedTestCount, 'expected test count')
  let report
  try {
    report = JSON.parse(requireValue(reportText(jsonContent), 'JSON report'))
  } catch (error) {
    throw new Error(
      `E2E report binding: malformed JSON report: ${error.message}`
    )
  }
  const binding = report?.config?.metadata?.cvgE2e
  if (
    binding?.runId !== expectedRunId ||
    binding?.candidateId !== expectedCandidateId ||
    !UUID.test(binding?.executionId ?? '')
  ) {
    throw new Error('E2E report binding: missing or mismatched JSON IDs')
  }
  const jsonCases = collectJsonCases(report.suites)
  const stats = report.stats
  if (
    !stats ||
    typeof stats.startTime !== 'string' ||
    !Number.isFinite(Date.parse(stats.startTime)) ||
    !Number.isFinite(stats.duration) ||
    stats.duration < 0 ||
    requireCount(stats.expected, 'JSON expected count') !== jsonCases.length ||
    requireCount(stats.skipped, 'JSON skipped count') !== 0 ||
    requireCount(stats.unexpected, 'JSON unexpected count') !== 0 ||
    requireCount(stats.flaky, 'JSON flaky count') !== 0 ||
    !Array.isArray(report.errors) ||
    report.errors.length !== 0
  ) {
    throw new Error('E2E report binding: invalid JSON stats or run errors')
  }
  const root = parseXml(xmlContent)
  if (
    root.attributes.id !== expectedRunId ||
    root.attributes.name !==
      `candidateId=${expectedCandidateId};executionId=${binding.executionId}`
  ) {
    throw new Error('E2E report binding: missing or mismatched JUnit IDs')
  }
  const xmlCases = collectXmlCases(root)
  if (
    JSON.stringify(inventory(jsonCases)) !== JSON.stringify(inventory(xmlCases))
  ) {
    throw new Error('E2E report binding: JSON/JUnit case inventory mismatch')
  }
  if (
    expectedTestCount !== undefined &&
    jsonCases.length !== expectedTestCount
  ) {
    throw new Error('E2E report binding: expected test count mismatch')
  }
  return {
    executionId: binding.executionId,
    testCount: jsonCases.length,
    cases: jsonCases
  }
}
