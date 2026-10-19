"""Read-only: every empty file of this unit gets a record with real metadata for the central catalog
(docs/04_audit/evidence/empty-artifact-status.json, merged by the Lead; this unit never edits it).
Run: python3 -I -B tools/empty_artifacts.py   -> writes empty-artifact-delta.json

Metadata comes from the attempt directory that produced the file: command = the systemd-run argv of command.json,
exitCode = result.json systemd_run_rc, timestamp = result.json observed_at, environment = the --setenv pairs of that argv
(the only environment inside the sandbox, bwrap --clearenv), reason = the byte counters of result.json that make the file
empty. A file whose counters do not prove the emptiness is recorded as capture_missing.
"""
import json
from pathlib import Path

U = Path(__file__).resolve().parent.parent
EVIDENCE = U.parents[2]  # docs/04_audit/evidence


def setenv(argv):
    env = {}
    for i, a in enumerate(argv):
        if a == '--setenv' and i + 2 < len(argv):
            env[argv[i + 1]] = argv[i + 2]
    return env


def main():
    records = []
    for f in sorted(p for p in U.rglob('*') if p.is_file() and p.stat().st_size == 0):
        d = f.parent
        cmd = json.loads((d / 'command.json').read_text())
        res = json.loads((d / 'result.json').read_text())
        status, reason = 'capture_missing', 'contadores do result.json não provam o vazio'
        if f.name in ('service-stdout.txt', 'service-stderr.txt'):
            stream = f.name[len('service-'):-len('.txt')]
            if res['service_output_bytes'][stream] == 0:
                status = 'expected_empty'
                reason = ('O serviço %s não escreveu em %s (result.json service_output_bytes.%s = 0): os papéis só emitem telemetria nos FIFOs '
                          'do observador; saída do serviço vazia é o esperado.' % (res['unit'], stream, stream))
        records.append({'path': f.relative_to(EVIDENCE).as_posix(), 'bytes': 0, 'status': status, 'command': cmd['argv'],
                        'exitCode': res['systemd_run_rc'], 'timestamp': res['observed_at'], 'environment': setenv(cmd['argv']),
                        'environment_scope': 'sandbox: env dos processos que produziram o arquivo (bwrap --clearenv + --setenv do command)',
                        'systemd_run_caller_env_keys': cmd.get('env_keys'), 'reason': reason})
    doc = {'schemaVersion': 1, 'kind': 'EMPTY_ARTIFACT_DELTA_FOR_CENTRAL_CATALOG',
           'target': 'docs/04_audit/evidence/empty-artifact-status.json (merge pelo Lead; esta unidade não edita o catálogo central)',
           'unit': U.relative_to(EVIDENCE).as_posix(), 'count': len(records),
           'by_status': {s: sum(1 for r in records if r['status'] == s) for s in sorted({r['status'] for r in records})}, 'files': records}
    (U / 'empty-artifact-delta.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'count': len(records), 'by_status': doc['by_status']}))


if __name__ == '__main__':
    main()
