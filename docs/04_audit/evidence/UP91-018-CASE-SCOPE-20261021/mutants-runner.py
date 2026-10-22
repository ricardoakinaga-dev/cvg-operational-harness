#!/usr/bin/env python3
"""SPEC0251 minimal mutants: apply one, run the killing test, restore."""
import json
import os
import shutil
import subprocess
import sys
import time

ROOT = '/mnt/dados/cvg-work/cvg-d9ef-casescope-20261021'
SCRATCH = os.path.dirname(os.path.abspath(__file__))
NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin'
# Disposable local PostgreSQL (127.0.0.1:56270), passed in by the caller.
PG = os.environ.get('TEST_DATABASE_URL', '')

MEM = 'apps/api/src/__tests__/case-scope-tasks-approvals.test.ts'
PGT = 'apps/api/src/__tests__/case-scope-tasks-approvals-postgres.test.ts'
WEB = 'apps/web/src/__tests__/case-scope-unavailable-item.test.tsx'

CA = 'packages/persistence/src/case-authority.ts'
CAP = 'packages/persistence/src/case-authority-postgres.ts'
CR = 'apps/api/src/case-authorization/case-routes.ts'
SRV = 'apps/api/src/server.ts'
JR = 'legacy/packages/secretary-journeys/src/api-routes.ts'
APP = 'apps/web/src/App.tsx'


def test(files, name_filter=None, pg=False):
    return {'files': files, 'filter': name_filter, 'pg': pg}


MUTANTS = [
    {
        'id': 'M01a-exists-memory',
        'spec': 'remover o EXISTS (S1)',
        'file': CA,
        'old': """    if (scope.kind === 'tenant') return true
    const root = this.coreRoot(tenantId, session.conversationId)
    return (
      root !== undefined &&
      this.activeGrant(tenantId, root.caseId, scope.operatorId)
    )""",
        'new': """    return true""",
        'test': test([MEM], 'S1'),
    },
    {
        'id': 'M01b-exists-postgres',
        'spec': 'remover o EXISTS (S2)',
        'file': CAP,
        'old': """  if (scope.kind === 'assigned') {
    values.push(scope.operatorId)
    conditions.push(assignedSessionVisibility(`$${values.length + 2}`))
  }""",
        'new': """  if (scope.kind === 'assigned') {
    void assignedSessionVisibility
  }""",
        'test': test([PGT], 'S2', pg=True),
    },
    {
        'id': 'M02-null-case-allowed',
        'spec': 'tratar caseId null como permitido (S3, sessão sem root)',
        'file': CR,
        'old': """    if (!located || !(await canReadCase(snapshot, scope, located.caseId))) {""",
        'new': """    if (
      !located ||
      (located.caseId !== null &&
        !(await canReadCase(snapshot, scope, located.caseId)))
    ) {""",
        'test': test([MEM], 'S3'),
    },
    {
        'id': 'M03-authorize-after-write',
        'spec': 'autorizar depois da escrita (S3, efeito persistido) — PATCH',
        'file': SRV,
        'old': """      await authorizeCaseMutation(caseRouteDeps, identity, tenantId, {
        kind: 'task',
        taskId: params.taskId
      })
      // SPEC0250 §3.1 (AUD0621 F15/F16): one atomic port call validates the
      // transition against the committed status, writes it with a CAS and
      // records the audit event in the same unit; a failure changes nothing.
      const updated = await tasks.transitionStatusWithAudit(
        {
          taskId: params.taskId,
          status: status.data,
          actorType: identity.role,
          actorId: identity.operatorId,
          correlationId
        },
        tenantId
      )""",
        'new': """      const updated = await tasks.transitionStatusWithAudit(
        {
          taskId: params.taskId,
          status: status.data,
          actorType: identity.role,
          actorId: identity.operatorId,
          correlationId
        },
        tenantId
      )
      await authorizeCaseMutation(caseRouteDeps, identity, tenantId, {
        kind: 'task',
        taskId: params.taskId
      })""",
        'test': test([MEM], 'PATCH'),
    },
    {
        'id': 'M04a-skip-patch',
        'spec': 'pular o helper no PATCH /v1/tasks/:taskId/status',
        'file': SRV,
        'old': """      await authorizeCaseMutation(caseRouteDeps, identity, tenantId, {
        kind: 'task',
        taskId: params.taskId
      })""",
        'new': '',
        'test': test([MEM], 'PATCH'),
    },
    {
        'id': 'M04b-skip-post-tasks',
        'spec': 'pular o helper no POST /v1/tasks',
        'file': SRV,
        'old': """      if (identity) {
        await authorizeCaseMutation(caseRouteDeps, identity, tenantId, {
          kind: 'core_session',
          sessionId: input.sessionId
        })
      }""",
        'new': '',
        'test': test([MEM], 'POST /v1/tasks:'),
    },
    {
        'id': 'M04c-skip-journey-task',
        'spec': 'pular o helper no POST /v1/journeys/tasks',
        'file': JR,
        'old': """      if (identity) await authorizeTaskSession(identity, tenantId, sessionId)""",
        'new': """      void authorizeTaskSession""",
        'test': test([MEM], 'POST /v1/journeys/tasks'),
    },
    {
        'id': 'M04d-skip-post-approvals',
        'spec': 'pular o helper no POST /v1/approvals',
        'file': SRV,
        'old': """      if (identity) {
        await authorizeCaseMutation(caseRouteDeps, identity, tenantId, {
          kind: 'core_session',
          sessionId: requestedApproval.sessionId
        })
      }""",
        'new': '',
        'test': test([MEM], 'POST /v1/approvals:'),
    },
    {
        'id': 'M04e-skip-decision',
        'spec': 'pular o helper no POST /v1/approvals/:id/decision',
        'file': SRV,
        'old': """        await authorizeCaseMutation(caseRouteDeps, identity, tenantId, {
          kind: 'approval_request',
          approvalRequestId: parsedBody.approvalRequestId
        })""",
        'new': '',
        'test': test([MEM], 'decision: approved'),
    },
    {
        'id': 'M04f-skip-runtime-decision',
        'spec': 'pular o helper na decisão de runtime approval',
        'file': SRV,
        'old': """        await authorizeCaseMutation(caseRouteDeps, identity, tenantId, {
          kind: 'execution',
          executionId: params.executionId
        })""",
        'new': '',
        'test': test([MEM], 'S4'),
    },
    {
        'id': 'M05-helper-always-denies',
        'spec': 'helper que nega sempre (positivos do S3/S4)',
        'file': CR,
        'old': """  target: CaseMutationTarget
): Promise<void> {
  if (target.kind === 'execution') {""",
        'new': """  target: CaseMutationTarget
): Promise<void> {
  if (target) {
    throw new CaseAuthorityError('case_not_found', CASE_NOT_FOUND_MESSAGE)
  }
  if (target.kind === 'execution') {""",
        'test': test([MEM], 'S3|S4'),
    },
    {
        'id': 'M06-absent-is-400',
        'spec': 'responder 400 para ausente (S3, igualdade de corpo)',
        'file': CR,
        'old': """    if (!located || !(await canReadCase(snapshot, scope, located.caseId))) {""",
        'new': """    if (!located) {
      throw new DomainError('invalid_action', 'Resource not found')
    }
    if (!(await canReadCase(snapshot, scope, located.caseId))) {""",
        'test': test([MEM], 'S3'),
    },
    {
        'id': 'M07-execution-case-in-tenant-scope',
        'spec': 'consultar executionCase no escopo tenant (S4/S6, Supervisor)',
        'file': CR,
        'old': """    if (scope.kind === 'assigned') {
      const link = await snapshot.executionCase(executionId)
      if (!(await canReadCase(snapshot, scope, link?.caseId))) throw notFound()
    }
    const record = await executionReader(deps, snapshot).get(""",
        'new': """    const link = await snapshot.executionCase(executionId)
    if (!(await canReadCase(snapshot, scope, link?.caseId))) throw notFound()
    const record = await executionReader(deps, snapshot).get(""",
        'test': test([PGT], 'S6', pg=True),
    },
    {
        'id': 'M08a-mapper-to-safe-error',
        'spec': 'trocar o mapeador de I7 por toSafeError (S7)',
        'file': SRV,
        'old': """  const toSafeRouteError = (error: unknown): SafeCaseError =>
    mapCaseMutationError(error, (other) => {
      const safe = toSafeError(other)
      return { status: statusCodeForError(safe.code), ...safe }
    })""",
        'new': """  const toSafeRouteError = (error: unknown): SafeCaseError => {
    void mapCaseMutationError
    const safe = toSafeError(error)
    return { status: statusCodeForError(safe.code), ...safe }
  }""",
        'test': test([MEM], 'outage'),
    },
    {
        'id': 'M08b-journey-mapper-to-safe-error',
        'spec': 'trocar o mapeador de I7 por toSafeError na jornada (S7)',
        'file': JR,
        'old': """      const safeError = toSafeTaskError(error)
      reply.code(safeError.status).header('cache-control', 'no-store')""",
        'new': """      void toSafeTaskError
      const safeError = toSafeError(error)
      reply
        .code(statusCodeForError(safeError.code))
        .header('cache-control', 'no-store')""",
        'test': test([MEM], 'outage'),
    },
    {
        'id': 'M09-runtime-chain-generic',
        'spec': 'substituir a cadeia de erro da runtime approval pelo mapeador genérico (S7, 403)',
        'file': SRV,
        'old': """        const safeError = mapCaseMutationError(error, (other) => {
          const mapped =
            other instanceof ApprovalError
              ? operationalApprovalError(other)
              : other instanceof OperationalExecutionError
                ? other
                : toSafeError(other)
          return {
            status: statusCodeForError(mapped.code),
            code: mapped.code,
            message: mapped.message
          }
        })""",
        'new': """        const safeError = toSafeRouteError(error)""",
        'test': test([MEM], 'previous mapping'),
    },
    {
        'id': 'M10a-taskcase-no-tenant-memory',
        'spec': 'taskCase sem filtro de tenant (S3, teste direto do snapshot) — memória',
        'file': CA,
        'old': """        const task = this.db.state.tasks.find((item) => item.id === taskId)
        return task ? this.sessionCase(tenantId, task.sessionId) : null""",
        'new': """        const task = this.db.state.tasks.find((item) => item.id === taskId)
        if (!task) return null
        const session = this.db.state.sessions.find(
          (item) => item.id === task.sessionId
        )
        return session ? { caseId: null, sessionId: session.id } : null""",
        'test': test([MEM], 'snapshot tenant'),
    },
    {
        'id': 'M10b-approvalcase-no-tenant-memory',
        'spec': 'approvalRequestCase sem filtro de tenant (S3 snapshot e Supervisor no tenant B) — memória',
        'file': CA,
        'old': """        return approval ? this.sessionCase(tenantId, approval.sessionId) : null""",
        'new': """        if (!approval) return null
        const session = this.db.state.sessions.find(
          (item) => item.id === approval.sessionId
        )
        return session ? { caseId: null, sessionId: session.id } : null""",
        'test': test([MEM], 'S3'),
    },
    {
        'id': 'M10c-resource-case-no-tenant-postgres',
        'spec': 'taskCase/approvalRequestCase sem filtro de tenant no SQL (S5, snapshot sem RLS)',
        'file': CAP,
        'old': """            LEFT JOIN case_roots r
              ON r.tenant_id = c.tenant_id AND r.core_conversation_id = c.id
           WHERE c.tenant_id = $1 AND t.id = $2`,
  approval_requests:""",
        'new': """            LEFT JOIN case_roots r
              ON r.tenant_id = c.tenant_id AND r.core_conversation_id = c.id
           WHERE ($1::text IS NOT NULL) AND t.id = $2`,
  approval_requests:""",
        'test': test([PGT], 'S3/S5', pg=True),
    },
    {
        'id': 'M11-web-404-is-failure',
        'spec': 'tratar 404 como falha na web (S8)',
        'file': APP,
        'old': """  return error instanceof ApiRequestError && error.status === 404""",
        'new': """  return error instanceof ApiRequestError && error.status === 404 && false""",
        'test': test([WEB]),
    },
    {
        'id': 'M12-no-store-hook-removed',
        'spec': 'I7 (code-review r1 O1): sem o hook, respostas do framework antes do handler perdem no-store (S7)',
        'file': SRV,
        'old': """      reply.header('cache-control', 'no-store')
    }
    return payload
  })""",
        'new': """      void reply
    }
    return payload
  })""",
        'test': test([MEM], 'previous mapping'),
    },
    {
        'id': 'M13-revoked-grant-visible-postgres',
        'spec': 'lista PostgreSQL sem o predicado ACTIVE (code-review r1 M1; S2 revogação)',
        'file': CAP,
        'old': """       AND a.operator_id = ${operatorPlaceholder} AND a.status = 'ACTIVE')`""",
        'new': """       AND a.operator_id = ${operatorPlaceholder})`""",
        'test': test([PGT], 'S2', pg=True),
    },
    {
        'id': 'M14-no-store-route-set-typo',
        'spec': 'I7 (code-review r2 R2-O1): uma rota fora do conjunto do hook (POST /v1/journeys/tasks)',
        'file': SRV,
        'old': """    'POST /v1/journeys/tasks',
    'GET /v1/approvals',""",
        'new': """    'GET /v1/approvals',""",
        'test': test([MEM], 'previous mapping'),
    },
    {
        'id': 'M15-list-snapshot-before-validation',
        'spec': 'lista abre a unidade de caso antes de validar a consulta (code-review r2 R2-O5)',
        'file': SRV,
        'old': """      const query = parseStatusPageQuery(
        request.query,
        TaskStatusSchema.options
      )""",
        'new': """      await caseAuthority.readSnapshot(tenantId, async () => undefined)
      const query = parseStatusPageQuery(
        request.query,
        TaskStatusSchema.options
      )""",
        'test': test([MEM], 'outage'),
    },
]


def run(mutant):
    t = mutant['test']
    env = {
        'HOME': os.environ['HOME'],
        'PATH': f'{NODE}:/usr/bin:/bin',
        'NODE_ENV': 'test',
    }
    if t['pg']:
        env['TEST_DATABASE_URL'] = PG
        env['CASE0251_PG_REQUIRED'] = '1'
    cmd = ['npx', 'vitest', 'run', '--testTimeout=60000', *t['files']]
    if t['filter']:
        cmd += ['-t', t['filter']]
    started = time.time()
    proc = subprocess.run(cmd, cwd=ROOT, env=env, capture_output=True, text=True)
    out = proc.stdout + proc.stderr
    import re
    clean = re.sub(r'\x1b\[[0-9;]*m', '', out)
    summary = [l.strip() for l in clean.splitlines() if l.strip().startswith('Tests ')]
    failed = [l.strip() for l in clean.splitlines() if l.strip().startswith('FAIL ')]
    return {
        'exitCode': proc.returncode,
        'summary': summary[-1] if summary else None,
        'failing': failed[:6],
        'seconds': round(time.time() - started, 1),
        'command': ' '.join(cmd),
    }


def main(selected):
    results = []
    for mutant in MUTANTS:
        if selected and mutant['id'] not in selected:
            continue
        path = os.path.join(ROOT, mutant['file'])
        backup = os.path.join(SCRATCH, 'mutant-backup')
        shutil.copyfile(path, backup)
        original = open(path).read()
        count = original.count(mutant['old'])
        if count != 1:
            results.append({'id': mutant['id'], 'error': f'anchor count {count}'})
            continue
        try:
            open(path, 'w').write(original.replace(mutant['old'], mutant['new']))
            outcome = run(mutant)
        finally:
            shutil.copyfile(backup, path)
        assert open(path).read() == original
        killed = outcome['exitCode'] != 0
        results.append({
            'id': mutant['id'],
            'spec': mutant['spec'],
            'file': mutant['file'],
            'test': mutant['test'],
            'result': 'KILLED' if killed else 'SURVIVED',
            **outcome,
        })
        print(mutant['id'], 'KILLED' if killed else 'SURVIVED', outcome['summary'], flush=True)
    json.dump(results, open(os.path.join(SCRATCH, 'mutants-result.json'), 'w'), indent=2, ensure_ascii=False)


if __name__ == '__main__':
    main(set(sys.argv[1:]))
