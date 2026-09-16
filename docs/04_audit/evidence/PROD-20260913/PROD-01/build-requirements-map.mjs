#!/usr/bin/env node
/**
 * PROD-01 — builds the enriched requirement/criterion map from the planning
 * traceability file plus the canonical task statuses. Mapping is responsibility
 * and verification design, not proof of implementation.
 *
 * Writes: <evidence>/requirements-map.json
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = '/home/ricardo/cvg-agent-secretary-v2'
const evidenceDir = path.join(
  root,
  'docs/04_audit/evidence/PROD-20260913/PROD-01'
)

const d13ToTasks = {
  'D13-01': ['PROD-02', 'AAA-18'],
  'D13-02': ['PROD-03', 'AAA-28'],
  'D13-03': ['AAA-02', 'AAA-06', 'AAA-21', 'PROD-01', 'PROD-14'],
  'D13-04': ['AAA-22', 'AAA-23'],
  'D13-05': ['PROD-04', 'AAA-07', 'AAA-21'],
  'D13-06': ['PROD-05', 'PROD-06', 'AAA-19', 'AAA-24'],
  'D13-07': ['PROD-07', 'PROD-08', 'PROD-09', 'AAA-28'],
  'D13-08': [
    'PROD-01',
    'PROD-12',
    'AAA-13',
    'AAA-14',
    'AAA-15',
    'AAA-35',
    'AAA-36'
  ],
  'D13-09': [
    'AAA-19',
    'AAA-21',
    'AAA-23',
    'AAA-25',
    'AAA-26',
    'AAA-27',
    'AAA-31',
    'AAA-32',
    'PROD-11',
    'PROD-13'
  ]
}

async function readJson(relative) {
  return JSON.parse(await readFile(path.join(root, relative), 'utf8'))
}

function deriveEvidenceState(taskIds, statusById) {
  const statuses = taskIds.map((id) => statusById.get(id) ?? 'UNKNOWN')
  if (statuses.some((status) => status === 'BLOCKED'))
    return 'BLOCKED_BY_DEPENDENCY'
  if (statuses.every((status) => status === 'VERIFIED' || status === 'DONE'))
    return 'HISTORICAL_VERIFIED_NOT_CURRENT_CANDIDATE'
  if (statuses.some((status) => status === 'VERIFIED' || status === 'DONE'))
    return 'PARTIAL_HISTORICAL'
  return 'PLANNED_NOT_VERIFIED_ON_CANDIDATE'
}

async function main() {
  const traceability = await readJson(
    'docs/03_build/tracking/production_quality_traceability.json'
  )
  const aaa = await readJson('docs/03_build/tracking/aaa_program_backlog.json')
  const delta = await readJson(
    'docs/03_build/tracking/production_delta_backlog.json'
  )
  const tasks = [
    ...aaa.tasks.map((task) => ({
      id: task.id,
      status: task.status,
      role: task.role ?? 'unknown',
      gate: task.gate,
      dependencies: task.dependencies ?? [],
      validation: task.validation ?? [],
      acceptance: task.acceptance ?? [],
      expectedEvidence: task.expectedEvidence,
      areas: task.areas ?? [],
      findings: task.findings ?? []
    })),
    ...delta.tasks.map((task) => ({
      id: task.id,
      status: task.status,
      role: task.ownerRole ?? 'unknown',
      gate: task.gate,
      dependencies: task.dependencies ?? [],
      validation: task.validation ?? [],
      acceptance: task.acceptance ?? [],
      expectedEvidence: task.expectedEvidence,
      areas: [],
      findings: task.origin ?? []
    }))
  ]
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const statusById = new Map(tasks.map((task) => [task.id, task.status]))
  const problems = []

  const findingsForTask = (taskId) =>
    Object.entries(d13ToTasks)
      .filter(([, ids]) => ids.includes(taskId))
      .map(([finding]) => finding)

  const mapItem = (entry, idKey) => {
    const taskIds = [...new Set(entry.tasks)]
    const missing = taskIds.filter((id) => !taskById.has(id))
    if (missing.length > 0) problems.push({ item: entry[idKey], missing })
    const owners = [...new Set(taskIds.map((id) => taskById.get(id)?.role))]
    const testMethods = [
      ...new Set(taskIds.flatMap((id) => taskById.get(id)?.validation ?? []))
    ]
    const acceptance = [
      ...new Set(taskIds.flatMap((id) => taskById.get(id)?.acceptance ?? []))
    ]
    const evidence = [
      ...new Set(
        taskIds.map((id) => taskById.get(id)?.expectedEvidence).filter(Boolean)
      )
    ]
    const blockedBy = taskIds.filter((id) => statusById.get(id) === 'BLOCKED')
    const findings = [
      ...new Set(taskIds.flatMap((taskId) => findingsForTask(taskId)))
    ]
    if (testMethods.length === 0)
      problems.push({ item: entry[idKey], missing: ['testMethod'] })
    return {
      ...entry,
      tasks: taskIds,
      owners,
      testMethods,
      acceptance,
      evidence,
      evidenceState: deriveEvidenceState(taskIds, statusById),
      blockedBy,
      openFindings: findings,
      taskStatuses: Object.fromEntries(
        taskIds.map((id) => [id, statusById.get(id) ?? 'UNKNOWN'])
      )
    }
  }

  const criteria = traceability.criteria.map((entry) =>
    mapItem(entry, 'criterion')
  )
  const requirements = traceability.requirements.map((entry) =>
    mapItem(entry, 'requirement')
  )

  const coverage = {
    criteria: {
      total: criteria.length,
      withoutTasks: criteria.filter((item) => item.tasks.length === 0).length,
      withoutTestMethods: criteria.filter(
        (item) => item.testMethods.length === 0
      ).length,
      blocked: criteria.filter((item) => item.blockedBy.length > 0).length
    },
    requirements: {
      total: requirements.length,
      withoutTasks: requirements.filter((item) => item.tasks.length === 0)
        .length,
      withoutTestMethods: requirements.filter(
        (item) => item.testMethods.length === 0
      ).length,
      blocked: requirements.filter((item) => item.blockedBy.length > 0).length
    },
    tasks: {
      total: tasks.length,
      planned: tasks.filter((task) => task.status === 'PLANNED').length,
      pending: tasks.filter((task) => task.status === 'PENDING').length,
      verified: tasks.filter(
        (task) => task.status === 'VERIFIED' || task.status === 'DONE'
      ).length,
      blocked: tasks.filter((task) => task.status === 'BLOCKED').length
    }
  }

  const result = {
    task: 'PROD-01',
    observedAt: new Date().toISOString(),
    meaning:
      'responsibility and verification design; mapping is not proof of implementation or PASS on the current candidate',
    coverage,
    problems,
    criteria,
    requirements
  }
  await writeFile(
    path.join(evidenceDir, 'requirements-map.json'),
    JSON.stringify(result, null, 2) + '\n'
  )
  console.log(JSON.stringify({ coverage, problems: problems.length }, null, 2))
  if (problems.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
