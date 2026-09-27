import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function readDoc(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function docExists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath))
}

function readJson(relativePath) {
  return JSON.parse(readDoc(relativePath))
}

function isTestFile(reference) {
  return /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(reference)
}

function pendingHighPriorityCorrections() {
  const backlog = readJson(
    'docs/09_debug_corrections/0903_correction_backlog.json'
  )
  return backlog.items.filter(
    (item) =>
      (item.priority === 'P0' || item.priority === 'P1') &&
      item.status !== 'completed'
  )
}

describe('enterprise build documentation readiness', () => {
  it('keeps all required CVG stage directories and control files present', () => {
    const requiredPaths = [
      'docs/00_discovery/0090_discovery_validation.md',
      'docs/01_prd/0090_prd_validation.md',
      'docs/02_spec/0190_spec_validation.md',
      'docs/03_build/0303_build_execution_contract.md',
      'docs/03_build/0304_traceability_matrix.md',
      'docs/03_build/0304_traceability_matrix.json',
      'docs/03_build/0305_repository_target_structure.md',
      'docs/03_build/0305_repository_target_structure.json',
      'docs/03_build/0306_phase_sprint_plan.md',
      'docs/03_build/0306_phase_sprint_plan.json',
      'docs/03_build/0307_technical_tracking_schema.md',
      'docs/03_build/0308_task_catalog.json',
      'docs/03_build/0310_construction_readiness_95.md',
      'docs/03_build/0310_construction_readiness_95.json',
      'docs/03_build/phase_0/sprint_0_foundation_plan.md',
      'docs/03_build/phase_0/acceptance_tests.md',
      'docs/03_build/phase_0/implementation_order.md',
      'docs/03_build/phase_0/task_00_build_docs_baseline.md',
      'docs/03_build/phase_0/task_01_repository_skeleton.md',
      'docs/03_build/phase_0/task_02_npm_workspaces.md',
      'docs/03_build/phase_0/task_03_typescript_baseline.md',
      'docs/03_build/phase_0/task_04_quality_gates.md',
      'docs/03_build/phase_0/task_05_security_env_baseline.md',
      'docs/03_build/phase_0/task_06_ci_local_and_tracking.md',
      'docs/03_build/phase_0/task_07_dependency_audit.md',
      'docs/03_build/phase_0/sprint_0_tracking.json',
      'docs/03_build/tracking/build_tracking.json',
      'docs/03_build/tracking/enterprise_decisions.json',
      'docs/04_audit/0430_enterprise_readiness_audit.md',
      'docs/04_audit/0490_audit_report.md',
      'docs/04_audit/0492_release_candidate_audit.md',
      'docs/04_audit/pilot_report_template.md',
      'docs/04_audit/remediation_loop_template.md',
      'docs/05_agent_loop_session_persistence/0502_gates_e_bloqueios.md',
      'docs/06_skill/0600_skill_catalog.md',
      'docs/07_agents/AGENTS.md',
      'docs/08_runtime/0800_runtime_operacional.md',
      'docs/08_runtime/release_candidate_boundary.json',
      'docs/08_runtime/operator_runbook.md',
      'docs/08_runtime/rollback_playbook.md',
      'docs/08_runtime/incident_playbook.md',
      'docs/08_runtime/staging_checklist.md',
      'docs/08_runtime/data_governance_signoff.md',
      'docs/20_master_execution_log.md',
      'docs/30_backlog_master.md',
      'docs/99_runtime_state.md'
    ]

    for (const relativePath of requiredPaths) {
      expect(docExists(relativePath), `${relativePath} must exist`).toBe(true)
    }
  })

  it('records closed conservative decisions with an official runtime status', () => {
    const runtimeState = readDoc('docs/99_runtime_state.md')
    const historicalState = readDoc(
      'docs/08_runtime/archive/prod20260926_runtime_state_history.md'
    )
    const decisions = readJson(
      'docs/03_build/tracking/enterprise_decisions.json'
    )

    expect(runtimeState).toMatch(/status: programa `IN_PROGRESS`/)
    expect(runtimeState).toMatch(/produção `NO_GO`/)
    expect(historicalState).toMatch(/human_decision_required: no/)
    expect(decisions.status).toBe('APPROVED_CONSERVATIVE_DEFAULTS')
    expect(decisions.decisions).toHaveLength(5)
    expect(
      decisions.decisions.every(
        (decision) => typeof decision.decision === 'string'
      )
    ).toBe(true)
  })

  it('maps every PRD RF into the machine-readable traceability matrix', () => {
    const prd = readDoc('docs/01_prd/0013_requisitos_funcionais.md')
    const matrix = readJson('docs/03_build/0304_traceability_matrix.json')
    const requiredRfIds = [...prd.matchAll(/RF-\d{3}/g)].map(
      (match) => match[0]
    )
    const mappedIds = new Set(
      matrix.mappings.flatMap((mapping) => mapping.source_ids ?? [])
    )

    for (const rfId of requiredRfIds) {
      expect(mappedIds.has(rfId), `${rfId} must be mapped`).toBe(true)
    }
  })

  it('requires tests and validation commands for every task catalog item', () => {
    const catalog = readJson('docs/03_build/0308_task_catalog.json')

    expect(catalog.tasks.length).toBeGreaterThan(0)
    for (const task of catalog.tasks) {
      expect(
        task.tests_expected?.length,
        `${task.id} must define tests`
      ).toBeGreaterThan(0)
      expect(
        task.validation_commands?.length,
        `${task.id} must define validation commands`
      ).toBeGreaterThan(0)
    }
  })

  it('keeps deterministic build json files parseable and internally linked', () => {
    const jsonFiles = [
      'docs/03_build/0304_traceability_matrix.json',
      'docs/03_build/0305_repository_target_structure.json',
      'docs/03_build/0306_phase_sprint_plan.json',
      'docs/03_build/0308_task_catalog.json',
      'docs/03_build/tracking/build_tracking.json',
      'docs/03_build/phase_0/sprint_0_tracking.json'
    ]

    for (const relativePath of jsonFiles) {
      expect(
        () => readJson(relativePath),
        `${relativePath} must be valid JSON`
      ).not.toThrow()
    }

    const phasePlan = readJson('docs/03_build/0306_phase_sprint_plan.json')
    const taskCatalog = readJson('docs/03_build/0308_task_catalog.json')
    const catalogIds = new Set(taskCatalog.tasks.map((task) => task.id))
    const plannedTaskIds = phasePlan.phases.flatMap((phase) =>
      phase.sprints.flatMap((sprint) => sprint.tasks)
    )

    for (const taskId of plannedTaskIds) {
      expect(
        catalogIds.has(taskId),
        `${taskId} must exist in task catalog`
      ).toBe(true)
    }
  })

  it('keeps traceability required test references executable', () => {
    const matrix = readJson('docs/03_build/0304_traceability_matrix.json')

    for (const mapping of matrix.mappings) {
      for (const testReference of mapping.required_tests ?? []) {
        if (!isTestFile(testReference)) continue
        expect(
          docExists(testReference),
          `${mapping.task} references missing test file ${testReference}`
        ).toBe(true)
      }
    }
  })

  it('does not declare 100 percent readiness while P0 or P1 debug corrections are open', () => {
    const readiness = readJson(
      'docs/03_build/0310_construction_readiness_95.json'
    )
    const pending = pendingHighPriorityCorrections()

    if (pending.length > 0) {
      expect(readiness.current_confidence_percent).toBeLessThan(100)
    }
  })
})
