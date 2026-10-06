import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const apiRoot = 'apps/api/src'
const newCoverageTest =
  '__tests__/execution-input-trajectory-api.test.ts'

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(directory, entry.name)
      return entry.isDirectory() ? walk(entryPath) : [entryPath]
    })
  )
  return nested.flat().filter((file) => /\.(test|spec)\.tsx?$/.test(file))
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function routePattern(routePath) {
  const escaped = routePath
    .split('/')
    .map((segment) =>
      segment.startsWith(':')
        ? '[^/]+'
        : segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    )
    .join('/')
  return new RegExp(`^${escaped}$`)
}

const healthSource = await readFile(path.join(apiRoot, 'routes/health.ts'), 'utf8')
const routeConstants = Object.fromEntries(
  [...healthSource.matchAll(/export const (\w+)\s*=\s*['"]([^'"]+)['"]/g)].map(
    (match) => [match[1], match[2]]
  )
)

const serverSource = await readFile(path.join(apiRoot, 'server.ts'), 'utf8')
const routeDeclarations = []
const declarationPattern =
  /app\.(get|post|put|patch|delete)\s*\(\s*(?:(['"`])([^'"`]+)\2|([A-Za-z_$][\w$]*))/g
for (const match of serverSource.matchAll(declarationPattern)) {
  const routePath = match[3] ?? routeConstants[match[4]]
  if (!routePath) continue
  routeDeclarations.push({
    method: match[1].toUpperCase(),
    path: routePath,
    line: serverSource.slice(0, match.index).split('\n').length,
    source: match[3] ? 'literal' : `constant:${match[4]}`
  })
}

const testRequests = []
for (const testFile of await walk(apiRoot)) {
  const source = await readFile(testFile, 'utf8')
  const injectPattern = /\.inject\s*\(/g
  for (const match of source.matchAll(injectPattern)) {
    let index = match.index + match[0].length
    let depth = 1
    let quote = ''
    let escaped = false
    for (; index < source.length && depth > 0; index += 1) {
      const character = source[index]
      if (quote) {
        if (escaped) escaped = false
        else if (character === '\\') escaped = true
        else if (character === quote) quote = ''
        continue
      }
      if (character === "'" || character === '"' || character === '`') {
        quote = character
      } else if (character === '(') {
        depth += 1
      } else if (character === ')') {
        depth -= 1
      }
    }

    const call = source.slice(match.index, index)
    const method = call.match(
      /\bmethod\s*:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/i
    )?.[1]
    const url = call.match(/\burl\s*:\s*(['"`])([\s\S]*?)\1/)?.[2]
    if (!method || !url) continue
    testRequests.push({
      method: method.toUpperCase(),
      path: url.replace(/\$\{[^}]*\}/g, ':param').split(/[?#]/)[0],
      file: path.relative(apiRoot, testFile).split(path.sep).join('/')
    })
  }
}

const inventory = routeDeclarations.map((route) => {
  const pattern = routePattern(route.path)
  const hits = testRequests.filter(
    (request) => request.method === route.method && pattern.test(request.path)
  )
  const baselineHits = hits.filter((hit) => hit.file !== newCoverageTest)
  return {
    ...route,
    testSourceReferenceFound: hits.length > 0,
    testFiles: [...new Set(hits.map((hit) => hit.file))],
    sourceReferenceBeforeThisClaim: baselineHits.length > 0
  }
})

const serverHash = sha256(serverSource)
const newTestSource = await readFile(
  path.join(apiRoot, newCoverageTest),
  'utf8'
)
const report = {
  scope:
    'Static source-reference inventory for explicit app.get/post/put/patch/delete declarations in apps/api/src/server.ts. It does not prove test execution or app-instance binding; implicit HEAD/OPTIONS are excluded.',
  serverSha256: serverHash,
  newCoverageTestSha256: sha256(newTestSource),
  literalDeclarations: routeDeclarations.filter(
    (route) => route.source === 'literal'
  ).length,
  constantDeclarations: routeDeclarations.filter((route) =>
    route.source.startsWith('constant:')
  ).length,
  totalDeclarations: routeDeclarations.length,
  parseableTestInjectMethodUrlPairs: testRequests.length,
  sourceReferencesAfterThisClaim: inventory.filter((route) =>
    route.testSourceReferenceFound
  ).length,
  routesWithoutTestSourceReferenceAfterThisClaim: inventory.filter(
    (route) => !route.testSourceReferenceFound
  ),
  sourceReferencesBeforeThisClaim: inventory.filter((route) =>
    route.sourceReferenceBeforeThisClaim
  ).length,
  routesWithoutTestSourceReferenceBeforeThisClaim: inventory
    .filter((route) => !route.sourceReferenceBeforeThisClaim)
    .map(({ method, path: routePath, line }) => ({
      method,
      path: routePath,
      line
    })),
  routes: inventory
}

await writeFile(
  'docs/04_audit/evidence/AUD0588-EXECUTION-ROUTES-20260928/route-inventory.json',
  `${JSON.stringify(report, null, 2)}\n`
)
console.log(
  JSON.stringify(
    {
      literalDeclarations: report.literalDeclarations,
      constantDeclarations: report.constantDeclarations,
      totalDeclarations: report.totalDeclarations,
      parseableTestInjectMethodUrlPairs:
        report.parseableTestInjectMethodUrlPairs,
      sourceReferencesBeforeThisClaim: report.sourceReferencesBeforeThisClaim,
      routesWithoutTestSourceReferenceBeforeThisClaim:
        report.routesWithoutTestSourceReferenceBeforeThisClaim,
      sourceReferencesAfterThisClaim: report.sourceReferencesAfterThisClaim,
      routesWithoutTestSourceReferenceAfterThisClaim:
        report.routesWithoutTestSourceReferenceAfterThisClaim
    },
    null,
    2
  )
)
