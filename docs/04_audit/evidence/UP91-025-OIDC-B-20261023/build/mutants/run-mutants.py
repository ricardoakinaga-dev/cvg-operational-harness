#!/usr/bin/env python3
"""SPEC0259 §10 — mutants N1–N28, one at a time.

For each mutant: check the SHA-256 of every touched file, apply the textual
edit (the old text must occur exactly as declared), run the cited proof
(vitest files and, when the SPEC cites a browser item, the matching item of
the three-host proof), restore the original bytes and check the SHA-256
again. A mutant is killed when the cited proof fails on a cited test.

Usage (repository root, Node 22 on PATH, PG and Docker available):
  python3 run-mutants.py <out.json> [N1 N2 ...]
Environment: TEST_DATABASE_URL and the CVG_OIDC_HOSTS_* ports for the
browser items. Synthetic data only.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time

ROOT = os.getcwd()

TRANSACTION = 'apps/api/src/oidc-login-transaction.ts'
SESSION = 'apps/api/src/operator-session.ts'
HTTP = 'apps/api/src/http-security.ts'
ROUTES = 'apps/api/src/oidc-routes.ts'
SERVER = 'apps/api/src/server.ts'
CONFIG = 'apps/api/src/oidc-config.ts'
APP = 'apps/web/src/App.tsx'
ORIGIN = 'apps/web/src/api/origin.ts'
CLIENT = 'apps/web/src/api/client.ts'
TEMPLATE = 'deploy/console/nginx.console.conf.template'

API_TEST = 'apps/api/src/__tests__/oidc-console-hosts-api.test.ts'
GUARD_TEST = 'apps/api/src/__tests__/oidc-login-guards.test.ts'
WEB_TEST = 'apps/web/src/__tests__/oidc-console.test.tsx'
PANEL_TEST = 'apps/web/src/__tests__/panel-forbidden.test.tsx'
BUNDLE_TEST = 'apps/web/src/__tests__/oidc-bundle.test.ts'
SUPPORT_TEST = 'tests/oidc-hosts-support.test.ts'

V1_BLOCK_HEADERS = (
    "        add_header Content-Security-Policy \"default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src __CVG_API_ORIGIN__; form-action 'self'\" always;\n"
    "        add_header X-Content-Type-Options \"nosniff\" always;\n"
    "        add_header Referrer-Policy \"no-referrer\" always;\n"
)

MUTANTS = [
    {
        'id': 'N1', 'what': 'ACAC para toda origem permitida',
        'edits': [(HTTP, "  if (credentialed) reply.header('access-control-allow-credentials', 'true')\n",
                   "  reply.header('access-control-allow-credentials', 'true')\n", 1)],
        'tests': [API_TEST], 'cited': r'another allowed origin without ACAC', 'e2e': []
    },
    {
        'id': 'N2', 'what': 'ACAC só em 2xx',
        'edits': [
            (HTTP, "  if (credentialed) reply.header('access-control-allow-credentials', 'true')\n", '', 1),
            (HTTP, "    reply.header('x-permitted-cross-domain-policies', 'none')\n",
             "    reply.header('x-permitted-cross-domain-policies', 'none')\n"
             "    if (options.credentialedOrigin !== null && request.headers.origin === options.credentialedOrigin && reply.statusCode < 300) {\n"
             "      reply.header('access-control-allow-credentials', 'true')\n"
             "    }\n", 1)],
        'tests': [API_TEST], 'cited': r'ACAO, ACAC and Vary in 200, 401', 'e2e': ['Q9a —']
    },
    {
        'id': 'N3', 'what': 'ACAO refletindo origem não permitida',
        'edits': [(HTTP, "        if (!options.allowedOrigins.includes(originResult.origin)) {\n          return sendForbidden(reply, 'Origin is not allowed')",
                   "        if (!options.allowedOrigins.includes(originResult.origin)) {\n          reply.header('access-control-allow-origin', originResult.origin)\n          return sendForbidden(reply, 'Origin is not allowed')", 1)],
        'tests': [API_TEST], 'cited': r'refuses a sibling without ACAO', 'e2e': []
    },
    {
        'id': 'N4', 'what': 'sem Vary: Origin',
        'edits': [(HTTP, "  reply.header('vary', 'Origin')\n", '', 1)],
        'tests': [API_TEST], 'cited': r'ACAO, ACAC and Vary|credentialed preflight', 'e2e': []
    },
    {
        'id': 'N5', 'what': 'preflight credenciado aceita cabeçalho de identidade ou de token',
        'edits': [(HTTP, "  const allowedHeaders: readonly string[] = credentialed\n    ? CREDENTIALED_CORS_HEADERS\n    : HTTP_SECURITY_ALLOWED_HEADERS\n",
                   "  const allowedHeaders: readonly string[] = HTTP_SECURITY_ALLOWED_HEADERS\n", 1)],
        'tests': [API_TEST], 'cited': r'credentialed preflight only for GET, POST, PATCH', 'e2e': []
    },
    {
        'id': 'N6', 'what': 'operacional sem __Host- no perfil HTTPS',
        'edits': [(SESSION, "  return profile === 'host-prefixed'\n    ? HOST_OPERATOR_SESSION_COOKIE\n    : OPERATOR_SESSION_COOKIE\n",
                   "  return OPERATOR_SESSION_COOKIE\n", 1)],
        'tests': [API_TEST], 'cited': r'writes and clears __Host- cookies', 'e2e': ['Q9i —']
    },
    {
        'id': 'N7', 'what': '__Host- sem Secure',
        'edits': [(SESSION, "  return policy.profile === 'host-prefixed' || policy.secure\n",
                   "  return policy.profile === 'legacy' && policy.secure\n", 1)],
        'tests': [API_TEST], 'cited': r'writes and clears __Host- cookies', 'e2e': ['Q9b/c/d —']
    },
    {
        'id': 'N8', 'what': 'limpeza com o nome legado',
        'edits': [(SESSION, "  return [\n    `${operatorSessionCookieName(policy.profile)}=`,\n",
                   "  return [\n    `${OPERATOR_SESSION_COOKIE}=`,\n", 1)],
        'tests': [API_TEST], 'cited': r'writes and clears __Host- cookies', 'e2e': ['Q9f —']
    },
    {
        'id': 'N9', 'what': 'parser aceita o nome legado no perfil HTTPS',
        'edits': [(SESSION, "  const candidates = readExactCookieValues(\n    value,\n    operatorSessionCookieName(policy.profile)\n  )\n",
                   "  const candidates = [\n    ...readExactCookieValues(value, operatorSessionCookieName(policy.profile)),\n    ...(policy.profile === 'host-prefixed' ? readExactCookieValues(value, OPERATOR_SESSION_COOKIE) : [])\n  ]\n", 1)],
        'tests': [API_TEST], 'cited': r'never authenticates, revokes or reads a pending with the legacy names', 'e2e': ['Q9i —']
    },
    {
        'id': 'N10', 'what': 'pendente legado lido no perfil HTTPS',
        'edits': [(TRANSACTION, "  const candidates = readExactCookieValues(value, name)\n",
                   "  const candidates = [\n    ...readExactCookieValues(value, name),\n    ...(name === HOST_OIDC_PENDING_COOKIE ? readExactCookieValues(value, COOKIE_NAME) : [])\n  ]\n", 1)],
        'tests': [API_TEST], 'cited': r'never authenticates, revokes or reads a pending with the legacy names', 'e2e': ['Q9i —']
    },
    {
        'id': 'N11', 'what': 'guarda de CSRF só pelo nome __Host-',
        'edits': [(ROUTES, "const OPERATOR_SESSION_COOKIE_NAMES = new Set([\n  OPERATOR_SESSION_COOKIE,\n  HOST_OPERATOR_SESSION_COOKIE\n])",
                   "const OPERATOR_SESSION_COOKIE_NAMES = new Set([HOST_OPERATOR_SESSION_COOKIE])\nvoid OPERATOR_SESSION_COOKIE", 1)],
        'tests': [API_TEST], 'cited': r'never authenticates, revokes or reads a pending with the legacy names', 'e2e': []
    },
    {
        'id': 'N12', 'what': 'private ausente numa rota /v1/**',
        'edits': [(SERVER, "      if (request.url.startsWith('/v1/')) {\n        reply.header('cache-control', 'private, no-store')",
                   "      if (request.url.startsWith('/v1/') && !request.url.startsWith('/v1/tasks')) {\n        reply.header('cache-control', 'private, no-store')", 1)],
        'tests': [API_TEST], 'cited': r'covers the registered /v1/\*\* inventory', 'e2e': []
    },
    {
        'id': 'N13', 'what': 'falha do callback em JSON',
        'edits': [(ROUTES, "          log(step, 'error', reasonCode)\n          return land('negado', clearPending)\n",
                   "          log(step, 'error', reasonCode)\n          reply.code(401).header('set-cookie', clearPending)\n          return fail('unauthorized', 'Operator login failed', correlationId)\n", 1)],
        'tests': [API_TEST], 'cited': r'lands refusals on #cvg-login=negado', 'e2e': ['Q9m —']
    },
    {
        'id': 'N14', 'what': 'destino do 303 lido da requisição',
        'edits': [(ROUTES, "          .header('location', `${login.consoleOrigin}/`)\n",
                   "          .header('location', String((request.query as Record<string, unknown>).return_to ?? `${login.consoleOrigin}/`))\n", 1)],
        'tests': [API_TEST], 'cited': r'never lets the request choose the destination', 'e2e': ['Q9j —']
    },
    {
        'id': 'N15', 'what': 'fragmento com reasonCode',
        'edits': [(ROUTES, "          log(step, 'error', reasonCode)\n          return land('negado', clearPending)\n",
                   "          log(step, 'error', reasonCode)\n          return land(('negado&motivo=' + reasonCode) as OperatorLoginLanding, clearPending)\n", 1)],
        'tests': [API_TEST], 'cited': r'lands refusals on #cvg-login=negado', 'e2e': []
    },
    {
        'id': 'N16', 'what': 'apiUrl aceita fuga de /v1/ depois da normalização',
        'edits': [(ORIGIN, "  if (url.origin !== profile.apiOrigin || !url.pathname.startsWith('/v1/')) {",
                   "  if (url.origin !== profile.apiOrigin) {", 1)],
        'tests': [WEB_TEST], 'cited': r'builds only API URLs under /v1/', 'e2e': []
    },
    {
        'id': 'N17', 'what': 'sem checagem de location.origin',
        'edits': [(APP, "      loginProfile.kind === 'oidc' &&\n      window.location.origin !== loginProfile.consoleOrigin\n",
                   "      false\n", 1)],
        'tests': [WEB_TEST], 'cited': r'makes no call at all from a divergent origin', 'e2e': ['Q9k —']
    },
    {
        'id': 'N18', 'what': 'navegação para authorizationUrl não https:',
        'edits': [(ORIGIN, "  if (url.protocol !== 'https:' || url.username || url.password) return null",
                   "  if (url.username || url.password) return null", 1)],
        'tests': [WEB_TEST], 'cited': r'https: authorization URLs|never navigates to the authorization URL', 'e2e': []
    },
    {
        'id': 'N19', 'what': '503 tratado como 401',
        'edits': [
            (APP, "          if (isSessionUnavailable(error)) {\n            setSessionStatus('unavailable')\n            setSessionError(oidcText.sessionUnavailable)\n          } else if (error instanceof ApiRequestError && error.status === 401) {",
             "          if (false) {\n            setSessionStatus('unavailable')\n            setSessionError(oidcText.sessionUnavailable)\n          } else if (error instanceof ApiRequestError && (error.status === 401 || isSessionUnavailable(error))) {", 1)],
        'tests': [WEB_TEST], 'cited': r'treats a session .* as unavailable', 'e2e': ['Q9n —']
    },
    {
        'id': 'N20', 'what': '403 com o texto de indisponível',
        'edits': [(APP, "    error instanceof ApiRequestError && error.status === 403\n", "    false\n", 1)],
        'tests': [WEB_TEST, PANEL_TEST], 'cited': r'no permission|Sem permissão', 'e2e': ['Q9e —']
    },
    {
        'id': 'N21', 'what': 'bundle OIDC com o caminho do token',
        'edits': [(CLIENT, "      __CVG_OPERATOR_LOGIN__ !== 'oidc' && bootstrapToken\n", "      bootstrapToken\n", 1)],
        'tests': [BUNDLE_TEST], 'cited': r'builds the OIDC profile without the bootstrap token path', 'e2e': []
    },
    {
        'id': 'N22', 'what': 'NGINX cai no SPA em /v1/',
        'edits': [(TEMPLATE, "    location ^~ /v1/ {\n" + V1_BLOCK_HEADERS + "        return 404;\n",
                   "    location ^~ /v1/ {\n" + V1_BLOCK_HEADERS + "        try_files $uri /index.html;\n", 1)],
        'tests': [SUPPORT_TEST], 'cited': r'answers 404 for /v1', 'e2e': ['Q8 —']
    },
    {
        'id': 'N23', 'what': 'connect-src amplo',
        'edits': [(TEMPLATE, "connect-src __CVG_API_ORIGIN__;", "connect-src __CVG_API_ORIGIN__ https:;", 'all')],
        'tests': [SUPPORT_TEST], 'cited': r'renders the exact CSP', 'e2e': ['Q8 —', 'Q9l —']
    },
    {
        'id': 'N24', 'what': 'fragmento não limpo',
        'edits': [(APP, "        window.history.replaceState(\n          window.history.state,\n          '',\n          `${window.location.pathname}${window.location.search}`\n        )\n",
                   "        void 0\n", 1)],
        'tests': [WEB_TEST], 'cited': r'reads the landing fragment', 'e2e': ['Q9m —']
    },
    {
        'id': 'N25', 'what': 'configuração aceita console http: ou no host da API no perfil HTTPS',
        'edits': [(CONFIG, "  if (httpsProfile) {\n    const consoleUrl = new URL(consoleOrigin)\n",
                   "  if (httpsProfile && false) {\n    const consoleUrl = new URL(consoleOrigin)\n", 1)],
        'tests': [API_TEST], 'cited': r'refuses an http: console|refuses a console on the API host', 'e2e': []
    },
    {
        'id': 'N26', 'what': 'composição aceita perfis de cookie diferentes',
        'edits': [(SERVER, "    options.operatorLogin.authority.cookieProfile !==\n      operatorCookiePolicy.profile\n",
                   "    options.operatorLogin.authority.cookieProfile !==\n      operatorCookiePolicy.profile &&\n    false\n", 1)],
        'tests': [API_TEST], 'cited': r'authority and server cookie profiles differ', 'e2e': []
    },
    {
        'id': 'N27', 'what': 'parser apara espaço Unicode com trim()',
        'edits': [(SESSION, "    if (trimSpaceAndTab(segment.slice(0, separator)) !== name) continue\n",
                   "    if (segment.slice(0, separator).trim() !== name) continue\n", 1)],
        'tests': [API_TEST], 'cited': r'compares the cookie name exactly|raw 0xA0 byte', 'e2e': []
    },
    {
        'id': 'N28', 'what': 'guarda de CSRF compara com a allowlist, não com o console',
        'edits': [(ROUTES, "    if (isConsoleOrigin(request.headers.origin, options.consoleOrigin)) return\n",
                   "    if (typeof request.headers.origin === 'string') return\n", 1)],
        'tests': [GUARD_TEST], 'cited': r'sibling Origin', 'e2e': []
    },
]


def sha(path):
    with open(os.path.join(ROOT, path), 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def node_env():
    env = {
        'HOME': os.environ['HOME'],
        'PATH': os.environ['PATH'],
    }
    for key in ('TEST_DATABASE_URL', 'CVG_OIDC_HOSTS_EDGE_PORT', 'CVG_OIDC_HOSTS_API_PORT',
                'CVG_OIDC_HOSTS_NGINX_PORT', 'CVG_OIDC_HOSTS_NGINX_NAME'):
        if key in os.environ:
            env[key] = os.environ[key]
    return env


def run_vitest(files):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, 'v.json')
        started = time.time()
        proc = subprocess.run(
            ['npx', 'vitest', 'run', *files, '--reporter=json', f'--outputFile={out}'],
            cwd=ROOT, env=node_env(), capture_output=True, text=True, timeout=900)
        failed = []
        passed = 0
        try:
            with open(out) as handle:
                data = json.load(handle)
            for result in data['testResults']:
                if result.get('message') and not result['assertionResults']:
                    failed.append(f"FILE {os.path.basename(result['name'])}: {result['message'][:160]}")
                for assertion in result['assertionResults']:
                    if assertion['status'] == 'failed':
                        failed.append(assertion['title'])
                    elif assertion['status'] == 'passed':
                        passed += 1
        except (OSError, ValueError, KeyError):
            failed.append('no-json-report')
        return {'exit': proc.returncode, 'failed': failed, 'passed': passed,
                'seconds': round(time.time() - started, 1)}


def run_e2e(grep):
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, 'p.json')
        env = node_env()
        env['PLAYWRIGHT_JSON_OUTPUT_NAME'] = out
        started = time.time()
        proc = subprocess.run(
            ['node', 'node_modules/@playwright/test/cli.js', 'test',
             '--config=playwright.oidc-hosts.config.ts', '--grep', f' {grep} '],
            cwd=ROOT, env=env, capture_output=True, text=True, timeout=1800)
        statuses = []
        try:
            with open(out) as handle:
                data = json.load(handle)

            def visit(suites):
                for suite in suites:
                    for spec in suite.get('specs', []):
                        for test in spec['tests']:
                            message = ''
                            for result in test['results']:
                                message = re.sub(r'\x1b\[[0-9;]*m', '', (result.get('error') or {}).get('message', ''))
                            statuses.append({'title': spec['title'], 'status': test['status'],
                                             'error': ' '.join(message.split())[:240]})
                    visit(suite.get('suites', []))
            visit(data['suites'])
        except (OSError, ValueError, KeyError):
            statuses.append({'title': grep, 'status': 'no-json-report', 'error': proc.stderr[-240:]})
        return {'grep': grep, 'exit': proc.returncode, 'tests': statuses,
                'seconds': round(time.time() - started, 1)}


def main():
    out_path = sys.argv[1]
    only = set(sys.argv[2:])
    files = sorted({edit[0] for mutant in MUTANTS for edit in mutant['edits']})
    baseline = {path: sha(path) for path in files}
    results = []
    for mutant in MUTANTS:
        if only and mutant['id'] not in only:
            continue
        before = {path: sha(path) for path in {edit[0] for edit in mutant['edits']}}
        assert all(before[path] == baseline[path] for path in before), mutant['id']
        originals = {}
        try:
            for path, old, new, count in mutant['edits']:
                full = os.path.join(ROOT, path)
                if path not in originals:
                    with open(full, 'rb') as handle:
                        originals[path] = handle.read()
                with open(full, encoding='utf-8') as handle:
                    text = handle.read()
                occurrences = text.count(old)
                if count == 'all':
                    assert occurrences > 0, (mutant['id'], path)
                else:
                    assert occurrences == count, (mutant['id'], path, occurrences)
                text = text.replace(old, new)
                with open(full, 'w', encoding='utf-8') as handle:
                    handle.write(text)
            mutated = {path: sha(path) for path in originals}
            unit = run_vitest(mutant['tests'])
            cited = [title for title in unit['failed'] if re.search(mutant['cited'], title)]
            e2e = [run_e2e(grep) for grep in mutant['e2e']]
        finally:
            for path, content in originals.items():
                with open(os.path.join(ROOT, path), 'wb') as handle:
                    handle.write(content)
        after = {path: sha(path) for path in originals}
        restored = all(after[path] == baseline[path] for path in after)
        e2e_killed = all(run['exit'] != 0 and any(test['status'] == 'unexpected' for test in run['tests'])
                         for run in e2e)
        record = {
            'id': mutant['id'],
            'what': mutant['what'],
            'files': sorted(originals),
            'shaBefore': before,
            'shaMutated': mutated,
            'shaAfter': after,
            'restored': restored,
            'unit': {**unit, 'citedFailures': cited, 'files': mutant['tests']},
            'e2e': e2e,
            'killed': unit['exit'] != 0 and bool(cited) and e2e_killed,
            'killedByUnit': unit['exit'] != 0 and bool(cited),
            'killedByBrowser': (e2e_killed if e2e else None)
        }
        results.append(record)
        print(json.dumps({key: record[key] for key in ('id', 'killed', 'killedByUnit', 'killedByBrowser', 'restored')}), flush=True)
        if not restored:
            raise SystemExit(f"restore failed for {mutant['id']}")
    with open(out_path, 'w', encoding='utf-8') as handle:
        json.dump({'baseline': baseline, 'mutants': results}, handle, ensure_ascii=False, indent=2)
        handle.write('\n')


if __name__ == '__main__':
    main()
