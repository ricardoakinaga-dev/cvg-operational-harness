"""Case-by-case topology and service-property checks of DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2 (read-only over the
executed folders; erratum DP-SPEC/R2-F01 carry-over of the DP-1 next-task and DP1-ADM/R2-F05).

Usage: python3 -I -B tools/topology_checks.py -> topology-checks-dp2.json. Each check has a negative control that must be refused with
the exact message (string equality, lesson of DP-SPEC/R2-F03):
- topology: the plan of the folder, profile/adapter-config.json and result.json declare the topology of the supervisor table;
  driver_only folders have no adapter or peer byte; adapter_peer folders have the adapter BEGIN; DP-PY20A ran no service;
- service properties: the --property values of every service argv (command.json) equal the inherited table, except MemoryMax and
  TasksMax in DP-PY02P and DIAG-DP-REAL-CLI-APPSERVER (DDP-05); RuntimeMaxSec 45.
"""
import copy
import importlib.util
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.dont_write_bytecode = True
U = Path(__file__).resolve().parent.parent


def load_mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


SUP = load_mod('topo_supervisor_dp2', U / 'python' / 'supervisor.py')


def jl(p):
    return json.loads(Path(p).read_text())


def folders():
    out = {}
    for d in sorted(list((U / 'cases').iterdir()) + list((U / 'diagnostics').iterdir())):
        res = jl(d / 'result.json')
        row = {'dir': d, 'result': res}
        if (d / 'profile-manifest.json').exists():
            row['manifest'] = jl(d / 'profile-manifest.json')
            row['config'] = jl(d / 'profile' / 'adapter-config.json')
            row['command'] = jl(d / 'command.json')
            row['bytes'] = {r: (d / ('events-%s.bin' % r)).stat().st_size for r in ('driver', 'adapter', 'peer')}
            row['adapter_begin'] = any(json.loads(x)['kind'] == 'BEGIN' for x in (d / 'events-adapter.jsonl').read_text().splitlines())
        out[res['case']] = row
    return out


def topology_problems(fs):
    out = []
    for case, f in fs.items():
        if case in SUP.ARTIFACT_CASES:
            if f['result'].get('kind') != 'ARTIFACT_CHECK_EVALUATOR_ONLY_NO_SERVICE' or f['result'].get('service') is not None:
                out.append('%s ran a service' % case)
            continue
        want = SUP.topology(case)
        if f['manifest']['case_plan'].get('topology') != want or f['manifest'].get('topology') != want:
            out.append('%s: plan topology is not %s' % (case, want))
        if f['config'].get('topology') != want:
            out.append('%s: config topology is not %s' % (case, want))
        if f['result'].get('topology') != want:
            out.append('%s: result topology is not %s' % (case, want))
        if want == 'driver_only' and (f['bytes']['adapter'] or f['bytes']['peer']):
            out.append('%s: adapter or peer bytes in a driver_only capture' % case)
        if want == 'adapter_peer' and not f['adapter_begin']:
            out.append('%s: no adapter BEGIN in an adapter_peer capture' % case)
    return out


def props_of_argv(argv):
    out = {}
    for i, a in enumerate(argv):
        if a == '--property' and i + 1 < len(argv):
            k, v = argv[i + 1].split('=', 1)
            out[k] = v
    return out


def property_problems(fs):
    out = []
    for case, f in fs.items():
        if case in SUP.ARTIFACT_CASES:
            continue
        props = props_of_argv(f['command']['argv'])
        if props != SUP.props_of(case) or not SUP.props_ok(case, props) or props.get('RuntimeMaxSec') != '45':
            out.append('%s: service properties %s differ from the inherited table beyond DDP-05' % (case, SUP.props_diff(props)))
    return out


def main():
    fs = folders()
    checks = [{'check': 'per-case topology (plan, config, result; driver_only without adapter/peer byte; adapter_peer with the adapter BEGIN; '
                        'DP-PY20A without service)', 'problems': topology_problems(fs)},
              {'check': 'service properties of every service argv equal the inherited table except the DDP-05 limits (DP1-ADM/R2-F05)',
               'problems': property_problems(fs)}]
    for c in checks:
        c['ok'] = not c['problems']
    negs = []

    def neg(name, mutate, fn, msg):
        fs2 = copy.deepcopy(fs)
        mutate(fs2)
        got = fn(fs2)
        negs.append({'control': name, 'expected_message': msg, 'rejected': msg in got, 'got': got})
    neg('driver_only slot with another config topology', lambda x: x['DP-PY19A']['config'].update(topology='adapter_peer'), topology_problems,
        'DP-PY19A: config topology is not driver_only')
    neg('adapter bytes in a driver_only slot', lambda x: x['DP-PY02P']['bytes'].update(adapter=64), topology_problems,
        'DP-PY02P: adapter or peer bytes in a driver_only capture')
    neg('adapter_peer slot without the adapter BEGIN', lambda x: x['DP-PY19B'].update(adapter_begin=False), topology_problems,
        'DP-PY19B: no adapter BEGIN in an adapter_peer capture')
    neg('artifact slot with a service', lambda x: x['DP-PY20A']['result'].update(service='cvg-dx100-dp2-x.service'), topology_problems, 'DP-PY20A ran a service')
    neg('KillMode changed in a service argv', lambda x: x['DP-PY19C']['command']['argv'].__setitem__(
        x['DP-PY19C']['command']['argv'].index('KillMode=control-group'), 'KillMode=process'), property_problems,
        "DP-PY19C: service properties {'KillMode': ['control-group', 'process']} differ from the inherited table beyond DDP-05")
    doc = {'kind': 'TOPOLOGY_AND_PROPERTY_CHECKS_DP2', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-DISTRIBUTED-PROFILE-DP-2',
           'origin': 'erratum DP-SPEC/R2-F01 (checagem caso a caso) e DP1-ADM/R2-F05, levados ao DP-2 pelo next-task do DP-1',
           'ok': all(c['ok'] for c in checks) and all(n['rejected'] for n in negs), 'checks': checks, 'negative_controls': negs,
           'negative_controls_refused': '%d/%d' % (sum(n['rejected'] for n in negs), len(negs)), 'matching': 'igualdade exata de mensagem',
           'checked_at': datetime.now(timezone.utc).isoformat()}
    (U / 'topology-checks-dp2.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2, default=str) + '\n')
    print(json.dumps({'ok': doc['ok'], 'problems': [c['problems'] for c in checks], 'negatives': doc['negative_controls_refused']}))
    return 0 if doc['ok'] else 1


if __name__ == '__main__':
    sys.exit(main())
