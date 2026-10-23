#!/usr/bin/env python3
"""SPEC0254 §8 mutants (M1-M29) and R2-O1 (M30): apply one mutant (one or
more anchored edits), run the test that must kill it, restore the bytes and
check the sha256 of every touched file. Output: mutants-result.json next to
the scratch directory given in MUTANT_SCRATCH."""
import hashlib
import json
import os
import re
import subprocess
import sys
import time

ROOT = '/mnt/dados/cvg-work/cvg-d9ef-up91025-20261022'
SCRATCH = os.environ.get('MUTANT_SCRATCH', os.path.dirname(os.path.abspath(__file__)))
NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin'
# Disposable local PostgreSQL (127.0.0.1:56270), passed in by the caller.
PG = os.environ.get('TEST_DATABASE_URL', '')

T = 'apps/api/src/__tests__/'
R = T + 'oidc-login-routes.test.ts'
G = T + 'oidc-login-guards.test.ts'
C = T + 'oidc-login-config.test.ts'
A = T + 'oidc-authority.test.ts'
P = T + 'case-principal-producer.test.ts'
PGT = T + 'oidc-login-postgres.test.ts'

ROUTES = 'apps/api/src/oidc-routes.ts'
TX = 'apps/api/src/oidc-login-transaction.ts'
CONFIG = 'apps/api/src/oidc-config.ts'
IDENT = 'apps/api/src/oidc-identity.ts'
AUTH = 'apps/api/src/oidc-authority.ts'
PROD = 'apps/api/src/case-principal-producer.ts'
SRV = 'apps/api/src/server.ts'


def m(mid, spec, edits, files, name_filter, pg=False):
    return {'id': mid, 'spec': spec, 'edits': edits, 'test': {'files': files, 'filter': name_filter, 'pg': pg}}


STEP7_TO_9 = """      // Step 7: the principal is current BEFORE the session exists (I2).
      try {
        await produceVerifiedPrincipal(deps.caseAuthority, {
          tenantId: mapped.identity.tenantId,
          operatorId: mapped.identity.operatorId,
          role: mapped.identity.role,
          entryActive: mapped.active,
          authorityVersion: login.authorityVersion,
          proofRef: mapped.proofRef
        })
      } catch (error) {
        if (error instanceof PrincipalProducerError && error.status === 401) {
          return refuse('principal', error.reasonCode)
        }
        return outage(
          'principal',
          error instanceof PrincipalProducerError
            ? error.reasonCode
            : 'principal_unavailable'
        )
      }
      if (!mapped.active) return refuse('principal', 'inactive_group')

      // Step 8: every login starts a new family; a live previous session of
      // this browser is retired in the same unit (D7).
      const next = { identity: mapped.identity, expiresAt: mapped.expiresAt }
      let record: OperatorSessionRecord
      try {
        const previous = pending.previousSessionId
        if (previous !== undefined && deps.sessionStore.switchIdentity) {
          record = await deps.sessionStore.switchIdentity(previous, next)
        } else if (previous !== undefined) {
          // Stores without an atomic switch (the in-memory test store).
          await deps.sessionStore.revoke(previous)
          record = await deps.sessionStore.create(next)
        } else {
          record = await deps.sessionStore.create(next)
        }
      } catch {
        return outage('session', 'session_unavailable')
      }
"""
STEP7_TO_9_SESSION_FIRST = """      const next = { identity: mapped.identity, expiresAt: mapped.expiresAt }
      let record: OperatorSessionRecord
      try {
        record = await deps.sessionStore.create(next)
      } catch {
        return outage('session', 'session_unavailable')
      }
      try {
        await produceVerifiedPrincipal(deps.caseAuthority, {
          tenantId: mapped.identity.tenantId,
          operatorId: mapped.identity.operatorId,
          role: mapped.identity.role,
          entryActive: mapped.active,
          authorityVersion: login.authorityVersion,
          proofRef: mapped.proofRef
        })
      } catch (error) {
        if (error instanceof PrincipalProducerError && error.status === 401) {
          return refuse('principal', error.reasonCode)
        }
        return outage('principal', 'principal_unavailable')
      }
"""
SWITCH_BLOCK = """        const previous = pending.previousSessionId
        if (previous !== undefined && deps.sessionStore.switchIdentity) {
          record = await deps.sessionStore.switchIdentity(previous, next)
        } else if (previous !== undefined) {
          // Stores without an atomic switch (the in-memory test store).
          await deps.sessionStore.revoke(previous)
          record = await deps.sessionStore.create(next)
        } else {
          record = await deps.sessionStore.create(next)
        }"""
CONSUME_BLOCK = """  let consumed: boolean
  try {
    consumed = await options.stateStore.consume(stateDigest(returnedState))
  } catch {
    throw new OidcLoginStateUnavailableError()
  }
  if (!consumed) throw new Error('OIDC login transaction is invalid')
  return pending"""
STEP5_END = """      } catch (error) {
        return error instanceof OidcIdpUnavailableError
          ? outage('token', 'idp_unavailable')
          : refuse('token', 'token_rejected')
      }
"""
STATE_CHECK = """      now - (payload.issuedAt ?? 0) >= LOGIN_AGE_MS ||
      !timingSafeEqual(
        Buffer.from(payload.state ?? '', 'ascii'),
        Buffer.from(returnedState, 'ascii')
      )
    ) {
      throw new Error('invalid payload')
    }"""
STATE_REFUSE = """        return refuse('state', 'state_invalid')
      }

      // Step 4."""

MUTANTS = [
    m('M1', 'sessão sem chamar o produtor', [(ROUTES, '        await produceVerifiedPrincipal(deps.caseAuthority, {', '        void ({')], [R], 'logs in with password'),
    m('M2', 'produtor depois da sessão', [(ROUTES, STEP7_TO_9, STEP7_TO_9_SESSION_FIRST)], [R], 'principal write fails'),
    m('M3', "identitySource 'synthetic_fixture' no produtor", [(PROD, "        identitySource: 'verified_adapter'", "        identitySource: 'synthetic_fixture'")], [R], 'logs in with password'),
    m('M4', 'versão de autoridade sem o N da matriz', [(CONFIG, 'return `oidc-v${input.groupMatrix.version}-${digest}`', 'return `oidc-v1-${digest}`')], [A], 'carries the matrix version'),
    m('M5', 'aceitar amr sem otp', [(IDENT, '    !policy.requiredAmr.every((method) => amr.includes(method))', '    false')], [R], 'amr without otp'),
    m('M6', 'primeiro grupo elegível ganha', [(IDENT, "  if (eligible.length > 1) throw new OidcLoginRefusal('ambiguous_group')\n", '')], [R], 'two eligible groups'),
    m('M7', 'ignorar entrada inativa', [(PROD, '    return input.entryActive\n', '    return true\n'), (PROD, '  if (!input.entryActive) {', '  if (false) {')], [P], 'row 2|row 4|row 5'),
    m('M8', 'reativar inativo com mesmo N', [(PROD, "    return { kind: 'refuse', reasonCode: 'principal_inactive' } // row 6", "    return { kind: 'write', role: input.role, active: true } // row 6")], [P], 'row 6'),
    m('M9', 'atualizar role por deriva com mesmo N', [(PROD, "  return { kind: 'refuse', reasonCode: 'principal_drift' } // row 9", "  return { kind: 'write', role: input.role, active: true } // row 9")], [P], 'row 9'),
    m('M10', 'casePrincipalAuthority aceito sem login OIDC fora de teste', [(SRV, '    if (options.casePrincipalAuthority && !controlledTest) {', '    if (false) {')], [G], 'I3'),
    m('M11', 'CSRF só quando o cookie é válido', [(ROUTES, '    if (!hasOperatorSessionCookieName(request.headers.cookie)) return\n', '    if (parseOperatorSessionCookie(request.headers.cookie) === null) return\n')], [G], 'M11, M28'),
    m('M12', 'Origin ausente aceito', [(ROUTES, '    if (isConsoleOrigin(request.headers.origin, options.consoleOrigin)) return\n', '    if (request.headers.origin === undefined) return\n    if (isConsoleOrigin(request.headers.origin, options.consoleOrigin)) return\n')], [G], 'with no Origin'),
    m('M13', 'state consumido depois da troca do code', [(TX, CONSUME_BLOCK, '  void stateDigest\n  void OidcLoginStateUnavailableError\n  return pending'), (ROUTES, STEP5_END, STEP5_END + """      {
        const { createHash } = await import('node:crypto')
        const consumed = await login.stateStore.consume(
          createHash('sha256').update(parameters.state, 'ascii').digest('hex')
        )
        if (!consumed) return refuse('state', 'state_invalid')
      }
""")], [R], 'invalid parameters'),
    m('M14', 'expectedNonce omitido', [(AUTH, '            expectedNonce: pending.nonce,\n', '')], [R], 'logs in with password'),
    m('M15', 'pendente mantido em falha depois do consumo', [(ROUTES, "        reply.code(401).header('set-cookie', clearPending)", '        reply.code(401)')], [R], 'IdP error after consuming'),
    m('M16', 'token HMAC aceito no modo OIDC', [(ROUTES, '    if (request.headers[TOKEN_HEADER] === undefined) return\n', '    return\n')], [G], 'x-cvg-operator-token'),
    m('M17', 'modo OIDC aceito em production ou development', [(CONFIG, "  if (env.NODE_ENV !== 'test') {\n    throw new Error('OIDC login is not qualified for this environment')", "  if (false) {\n    throw new Error('OIDC login is not qualified for this environment')")], [C], 'refuses production|refuses development'),
    m('M18', 'store em memória aceito no modo OIDC', [(CONFIG, "  if (env.API_PERSISTENCE_MODE !== 'postgres') {", '  if (false) {')], [C], 'memory persistence|persistence absent'),
    m('M19', 'comparação de issuer só pela biblioteca', [(AUTH, '  if (metadata.issuer !== issuer) throw discoveryInvalid()\n', '')], [A], 'upper-case host|:443|trailing slash'),
    m('M20', 'create em vez de switchIdentity com sessão anterior', [(ROUTES, SWITCH_BLOCK, '        void pending\n        record = await deps.sessionStore.create(next)')], [R], 'retires the previous browser session'),
    m('M21', 'corpo de 401 diferente por motivo', [(ROUTES, "        return fail('unauthorized', 'Operator login failed', correlationId)", "        return fail('unauthorized', `Operator login failed (${reasonCode})`, correlationId)")], [R], 'invalid parameters'),
    m('M22', 'authorityVersion dependente do segredo', [(CONFIG, '    authorityVersion: computeOidcAuthorityVersion({\n      issuer,', '    authorityVersion: computeOidcAuthorityVersion({\n      issuer: issuer + clientSecret,')], [A], 'client secret'),
    m('M23', 'sem enableNonRepudiationChecks', [(AUTH, '        execute: [oidc.enableNonRepudiationChecks],', '        execute: [],')], [R], 'another key with a known kid|an unknown kid'),
    m('M24', 'troca do code antes de validar o state', [(TX, STATE_CHECK, """      now - (payload.issuedAt ?? 0) >= LOGIN_AGE_MS
    ) {
      throw new Error('invalid payload')
    }
    if (
      !timingSafeEqual(
        Buffer.from(payload.state ?? '', 'ascii'),
        Buffer.from(returnedState, 'ascii')
      )
    ) {
      ;(globalThis as Record<string, unknown>).__m24 = {
        nonce: payload.nonce!,
        codeVerifier: payload.codeVerifier!
      }
      throw new Error('state mismatch')
    }"""), (ROUTES, STATE_REFUSE, """        const early = (globalThis as Record<string, unknown>).__m24 as
          | PendingOidcLogin
          | undefined
        delete (globalThis as Record<string, unknown>).__m24
        if (early && parameters.code) {
          await login.authority
            .complete({ code: parameters.code, state: parameters.state, pending: early })
            .catch(() => undefined)
        }
        return refuse('state', 'state_invalid')
      }

      // Step 4.""")], [R], 'invalid parameters'),
    m('M25', 'boot sem a checagem de versão', [(SRV, '      await assertPrincipalVersionsCurrent(\n        app.caseAuthority,\n        operatorLoginConfig\n      )', '      void assertPrincipalVersionsCurrent')], [PGT], 'edited matrix', pg=True),
    m('M26', 'produtor compara versão por diferença, não por ordem', [(PROD, '    storedN > current.n ||\n    (storedN === current.n && stored?.digest !== current.digest)', '    storedN === current.n && stored?.digest !== current.digest'), (PROD, "  if (storedN < current.n || principal.identitySource !== 'verified_adapter') {", "  if (storedN !== current.n || principal.identitySource !== 'verified_adapter') {")], [P], 'row 3'),
    m('M27', 'erro de transporte classificado como 401', [(AUTH, '        if (mark.unavailable) throw new OidcIdpUnavailableError()\n', '')], [R], 'answers 503 for'),
    m('M28', 'tokenizador do CSRF mais estrito que o parser', [(ROUTES, "          (segment) => segment.split('=')[0]?.trim() === OPERATOR_SESSION_COOKIE", "          (segment) => segment.split('=')[0] === OPERATOR_SESSION_COOKIE")], [G], 'M11, M28'),
    m('M29', 'claim da matriz aceita __proto__, constructor ou prototype', [(CONFIG, "  'azp',\n  '__proto__',\n  'constructor',\n  'prototype'\n])", "  'azp'\n])")], [C], 'matrix claim'),
    m('M30', 'claim de grupos lido sem Object.hasOwn (R2-O1)', [(IDENT, '  const groups = Object.hasOwn(value, policy.matrix.claim)\n    ? value[policy.matrix.claim]\n    : undefined', '  const groups = value[policy.matrix.claim]')], [R], 'M30'),
    # Mutants proposed by the code critic r1 (C1-C6), after its optionals O1-O6.
    m('C1', 'authorizationCodeGrant sem maxAge: 300 (equivalente: o mapeador repete auth_time)', [(AUTH, '            maxAge: MAX_AUTHENTICATION_AGE_SECONDS\n', '')], [R], 'auth_time older than 5 minutes'),
    m('C2', 'hooks de token/CSRF depois do hook de sessão', [(SRV, """  if (options.operatorLogin) {
    // SPEC0254 §4.7: after the HTTP hook, before the session hook.
    installOperatorLoginGuards(app, {
      consoleOrigin: options.operatorLogin.consoleOrigin
    })
  }
  if (identityMode === 'trusted' && options.operatorSessionStore) {
    installOperatorSessionHook({
      app,
      enforceHttps: httpSecurity.enforceHttps,
      operatorSessionStore: options.operatorSessionStore,
      sessionIdentityByHeaders,
      sessionRecordByHeaders,
      sessionStoreFailureByHeaders
    })
  }""", """  if (identityMode === 'trusted' && options.operatorSessionStore) {
    installOperatorSessionHook({
      app,
      enforceHttps: httpSecurity.enforceHttps,
      operatorSessionStore: options.operatorSessionStore,
      sessionIdentityByHeaders,
      sessionRecordByHeaders,
      sessionStoreFailureByHeaders
    })
  }
  if (options.operatorLogin) {
    installOperatorLoginGuards(app, {
      consoleOrigin: options.operatorLogin.consoleOrigin
    })
  }""")], [G], 'before the session hook'),
    m('C3', 'token recusado só com valor não vazio', [(ROUTES, '    if (request.headers[TOKEN_HEADER] === undefined) return\n', '    if (!request.headers[TOKEN_HEADER]) return\n')], [G], 'x-cvg-operator-token on'),
    m('C4', 'checagem de versão no boot só no primeiro tenant', [(SRV, '  for (const tenantId of tenants) {', '  for (const tenantId of tenants.slice(0, 1)) {')], [PGT], 'every tenant of the matrix', pg=True),
    m('C5', 'linha 7 sem a cláusula de origem', [(PROD, "  if (storedN < current.n || principal.identitySource !== 'verified_adapter') {", '  if (storedN < current.n) {')], [P], 'origin clause'),
    m('C6', 'Origin do start em preHandler (depois do parse do corpo)', [(ROUTES, '    { onRequest: requireConsoleOrigin },', '    { preHandler: requireConsoleOrigin },')], [R], 'with 403 before the body'),
    # Mutants of the code critic r2 optionals (R2-O1, R2-O2).
    m('R1', 'buildServerFromEnv sem comparar a consoleOrigin do operatorLogin com a configuração', [(SRV, """    (buildOptions.operatorLogin!.authorityVersion !==
      operatorLoginConfig.authorityVersion ||
      buildOptions.operatorLogin!.consoleOrigin !==
        operatorLoginConfig.consoleOrigin)""", """    buildOptions.operatorLogin!.authorityVersion !==
      operatorLoginConfig.authorityVersion""")], [C], 'does not match the configuration'),
    m('R2', '[::1] de volta aos hosts de loopback do redirect', [(CONFIG, "const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost'])", "const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])")], [C], 'redirect http: on'),
]


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def run(mutant):
    t = mutant['test']
    env = {'HOME': os.environ['HOME'], 'PATH': f'{NODE}:/usr/bin:/bin', 'TMPDIR': os.environ.get('TMPDIR', '/tmp')}
    if t['pg']:
        env['TEST_DATABASE_URL'] = PG
        env['OIDC0254_PG_REQUIRED'] = '1'
    out_json = os.path.join(SCRATCH, f"mutant-{mutant['id']}.json")
    cmd = ['npx', 'vitest', 'run', '--testTimeout=120000', *t['files'], '-t', t['filter'], '--reporter=json', f'--outputFile={out_json}']
    started = time.time()
    proc = subprocess.run(cmd, cwd=ROOT, env=env, capture_output=True, text=True)
    report = json.load(open(out_json)) if os.path.exists(out_json) else {}
    failed = []
    for file in report.get('testResults', []):
        if file.get('status') == 'failed' and not file.get('assertionResults'):
            failed.append(f"{file['name']}: {(file.get('message') or '')[:160]}")
        for a in file.get('assertionResults', []):
            if a['status'] == 'failed':
                failed.append(' > '.join(a.get('ancestorTitles', []) + [a['title']]))
    return {
        'exitCode': proc.returncode,
        'summary': f"failed {report.get('numFailedTests')} / passed {report.get('numPassedTests')} / total {report.get('numTotalTests')}",
        'killedBy': failed[:6],
        'seconds': round(time.time() - started, 1),
        'command': ' '.join(cmd[:-2] + ['--reporter=json']),
    }


def main(selected):
    results = []
    for mutant in MUTANTS:
        if selected and mutant['id'] not in selected:
            continue
        files = sorted({edit[0] for edit in mutant['edits']})
        originals = {f: open(os.path.join(ROOT, f), 'rb').read() for f in files}
        before = {f: sha(os.path.join(ROOT, f)) for f in files}
        texts = {f: originals[f].decode('utf8') for f in files}
        error = None
        for path, old, new in mutant['edits']:
            count = texts[path].count(old)
            if count != 1:
                error = f'anchor count {count} in {path}: {old[:60]!r}'
                break
            texts[path] = texts[path].replace(old, new)
        if error:
            results.append({'id': mutant['id'], 'error': error})
            print(mutant['id'], 'ERROR', error, flush=True)
            continue
        try:
            for f in files:
                open(os.path.join(ROOT, f), 'w').write(texts[f])
            outcome = run(mutant)
        finally:
            for f in files:
                open(os.path.join(ROOT, f), 'wb').write(originals[f])
        after = {f: sha(os.path.join(ROOT, f)) for f in files}
        restored = after == before
        killed = outcome['exitCode'] != 0 and len(outcome['killedBy']) > 0
        results.append({
            'id': mutant['id'],
            'mutant': mutant['spec'],
            'files': files,
            'test': mutant['test'],
            'result': 'KILLED' if killed else 'SURVIVED',
            'restoredSha256': after,
            'restored': restored,
            **outcome,
        })
        print(mutant['id'], 'KILLED' if killed else 'SURVIVED', outcome['summary'], 'restored' if restored else 'NOT RESTORED', flush=True)
        if not restored:
            sys.exit(2)
    json.dump(results, open(os.path.join(SCRATCH, 'mutants-result.json'), 'w'), indent=2, ensure_ascii=False)


if __name__ == '__main__':
    main(set(sys.argv[1:]))
