"""Read-only: every empty file of this unit gets a record with real metadata for the central catalog
(docs/04_audit/evidence/empty-artifact-status.json, merged by the Lead; this unit never edits it).
Run: python3 -I tools/empty_artifacts.py   -> writes empty-artifact-delta.json

Metadata comes from the attempt directory that produced the file: command = the systemd-run argv of command.json,
exitCode = result.json systemd_run_rc, timestamp = result.json observed_at, environment = the --setenv pairs of that
argv (the only environment inside the sandbox, bwrap --clearenv), reason = the byte or frame counters of result.json
that make the file empty. A file whose counters do not prove the emptiness is recorded as capture_missing.
Repair R1 (R1-F09): environment_scope says which environment the field holds, and systemd_run_caller_env_keys lists the
keys of the caller environment recorded in command.json. R1-F02: a NO_CHILD slot whose driver error is not a spawn
failure (2A-TS12, ABORT_ERR) says that the child's existence and termination were not witnessed.
Continuation, repair R1 (review-r1 R1-F09): 2A-TS12R and DIAG-TS-PREABORT get separate reasons; in 2A-TS12R the OS witnessed only
the existence (IN_OPEN in the window), the termination is NOT_WITNESSED; DIAG-TS-PREABORT cites its own PID and SIGTERM record.
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
        name = f.name
        status, reason = 'capture_missing', 'contadores do result.json não provam o vazio'
        if name in ('service-stdout.txt', 'service-stderr.txt'):
            stream = name[len('service-'):-len('.txt')]
            n = res['service_output_bytes'][stream]
            if n == 0:
                status = 'expected_empty'
                reason = ('O serviço %s não escreveu em %s (result.json service_output_bytes.%s = 0): os papéis só emitem telemetria nos FIFOs '
                          'do observador; saída do serviço vazia é o esperado.' % (res['unit'], stream, stream))
        elif name.startswith('events-'):
            role = name.split('-', 1)[1].split('.', 1)[0]
            if res['frames'].get(role) == 0 and res['raw_frame_bytes'].get(role) == 0 and res['role_status'].get(role) == 'MISSING':
                status = 'expected_empty'
                ew = res.get('exec_witness') or {}
                if res['case'] == '2A-TS12R':
                    reason = ('Forma PREFRAME_TERMINATION (observer NO_CHILD classificado pela testemunha, R4-03): nenhum quadro %s na unidade %s '
                              '(result.json frames.%s = 0, raw_frame_bytes.%s = 0, role_status.%s = MISSING). Existência do filho testemunhada pelo SO: '
                              '%d IN_OPEN do executável do adapter na janela (exec_witness, inotify sem privilégio), sem falha de spawn e sem processo '
                              'sobrevivente no CALLS_DONE. Término NÃO testemunhado (acceptance.json abort.os_witness_recorded_r4: adapter_pid e '
                              'adapter_signal NOT_WITNESSED); o AbortError (ABORT_ERR) indica, pela semântica do Node v24, término por SIGTERM antes '
                              'do primeiro quadro, mas isso é inferência. O livro bruto deste papel é vazio porque nenhum quadro foi escrito.'
                              % (role, res['unit'], role, role, role, ew.get('in_open_in_window', 0)))
                elif res['case'] == 'DIAG-TS-PREABORT':
                    reason = ('Forma PREFRAME_TERMINATION (observer NO_CHILD classificado pela testemunha, R4-03): nenhum quadro %s na unidade %s '
                              '(result.json frames.%s = 0, raw_frame_bytes.%s = 0, role_status.%s = MISSING); o SO testemunhou %d IN_OPEN do executável do '
                              'adapter na janela (exec_witness, inotify sem privilégio) e nenhum processo sobrevivente no CALLS_DONE; o código próprio do '
                              'diagnóstico registrou o PID e a saída por SIGTERM (events-driver.jsonl PREABORT_RESULT: pid_present true, exit.signal '
                              'SIGTERM). O filho foi criado e encerrado pelo aborto antes do primeiro quadro, então o livro bruto deste papel é vazio por '
                              'construção.' % (role, res['unit'], role, role, role, ew.get('in_open_in_window', 0)))
                elif res['case'] == '2A-TS12':
                    reason = ('Forma registrada %s pelo observer: nenhum quadro %s e nenhum processo testemunhado na unidade %s (result.json frames.%s = 0, '
                              'raw_frame_bytes.%s = 0, role_status.%s = MISSING). A existência e o término do filho NÃO foram testemunhados pelo SO; o erro '
                              'do cliente (AbortError, code ABORT_ERR, de abortChildProcess) indica, pela semântica do Node v24, filho criado e encerrado por '
                              'SIGTERM antes do primeiro quadro. Ver adjudication-r1.json.' % (res['verdict'], role, res['unit'], role, role, role))
                else:
                    reason = ('Forma de captura %s: spawn falhou (ENOENT) e %s não iniciado na unidade %s (result.json frames.%s = 0, raw_frame_bytes.%s = 0, '
                              'role_status.%s = MISSING; exec_witness com %d eventos na janela); o livro bruto deste papel é vazio por construção.'
                              % (res['verdict'], role, res['unit'], role, role, role, len(ew.get('events_in_window') or [])))
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
