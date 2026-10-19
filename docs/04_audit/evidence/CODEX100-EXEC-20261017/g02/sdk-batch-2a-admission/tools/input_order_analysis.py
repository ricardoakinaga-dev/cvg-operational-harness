"""Read-only analysis of the input key order actually delivered to the roles (no service, no SDK).
Run: python3 -I tools/input_order_analysis.py   -> writes input-order-errata.json

Finding: supervisor.py builds each case_input as json.loads(fixture_bytes()) and fixture_bytes() serializes the rows
with sort_keys=True, so every JSON object inside the delivered case_input has its keys in code-point order instead of
the frozen insertion order of cases-2a.json. Arrays keep their order. This tool lists, per slot, the object paths whose
key order changed, derives what the frozen expectation becomes when only that key order changes, and compares the
derivation with the preserved observation. Outcomes are NOT changed (R3-09: frozen expectations stand; no retry,
no relabel); the derivation is an explanation of the three MISMATCH, never a credit.
"""
import datetime
import hashlib
import json
import re
from pathlib import Path

U = Path(__file__).resolve().parent.parent


def ordered_paths(a, b, path='$'):
    """Object paths where the key order of a (frozen) differs from b (delivered); same keys required."""
    out = []
    if isinstance(a, dict) and isinstance(b, dict):
        if list(a) != list(b):
            out.append({'path': path, 'frozen_order': list(a), 'delivered_order': list(b)})
        for k in a:
            out += ordered_paths(a[k], b.get(k), path + '.' + k)
    elif isinstance(a, list) and isinstance(b, list):
        for i, (x, y) in enumerate(zip(a, b)):
            out += ordered_paths(x, y, '%s[%d]' % (path, i))
    return out


def top_key(pair, keys):
    """Top-level config key of a rendered --config pair: the longest delivered key followed by '=' or '.'."""
    hits = [k for k in keys if pair.startswith(k + '=') or pair.startswith(k + '.')]
    return max(hits, key=len)


def inline_table_sorted(value):
    """Reorder the entries of TOML inline tables {a = 1, "b c" = 2} by code point of the bare key (sort_keys order)."""
    def fix(m):
        entries = m.group(1).split(', ')
        return '{' + ', '.join(sorted(entries, key=lambda e: json.loads(e.split(' = ')[0]) if e.startswith('"') else e.split(' = ')[0])) + '}'
    return re.sub(r'\{([^{}]*)\}', fix, value)


def derive_argv(frozen_argv, delivered_config):
    head, pairs, i = [], [], 0
    while i < len(frozen_argv):
        if frozen_argv[i] == '--config':
            pairs.append(frozen_argv[i + 1])
            i += 2
        else:
            head.append(frozen_argv[i])
            i += 1
    order = list(delivered_config)
    pairs = sorted(pairs, key=lambda p: order.index(top_key(p, order)))
    out = list(head)
    for p in pairs:
        k = top_key(p, order)
        out += ['--config', k + inline_table_sorted(p[len(k):])]
    return out


def main():
    spec = {c['id']: c for c in json.loads((U / 'inputs' / 'spec-2a' / 'cases-2a.json').read_text())['cases']}
    ledger = json.loads((U / 'case-ledger.json').read_text())
    rows = []
    for cid, c in sorted(spec.items(), key=lambda x: x[1]['slot']):
        d = U / 'cases' / ('%s-%s' % (cid, ledger['slots'][cid]['attempt'][:12]))
        cfg = json.loads((d / 'profile' / 'adapter-config.json').read_text())
        frozen = ({'control_client': c['control_client'], 'peer_script': c['peer_script']} if c['kind'] == 'CONTROL'
                  else {'sdk_calls': c['sdk_calls'], 'fixture': c['fixture']} if c['language'] == 'typescript'
                  else {'sdk_calls': c['sdk_calls'], 'peer_script': c['peer_script']})
        delivered = cfg['case_input']
        same_value = json.dumps(frozen, sort_keys=True) == json.dumps(delivered, sort_keys=True)
        paths = ordered_paths(frozen, delivered)
        rows.append({'case': cid, 'same_value_ignoring_key_order': same_value, 'reordered_object_paths': len(paths),
                     'paths': [p['path'] for p in paths][:40]})
    analyses = []
    # 2A-TS03: outputSchema bytes are JSON.stringify of the delivered object.
    c = spec['2A-TS03']
    acc = json.loads((U / 'cases' / ('2A-TS03-%s' % ledger['slots']['2A-TS03']['attempt'][:12]) / 'acceptance.json').read_text())
    obs = [p for p in acc['predicates'] if p['id'] == 'fixture.schema_bytes_exact'][0]['detail']
    schema = [s for s in c['sdk_calls'] if s['step'] == 4][0]['turn_options']['outputSchema']
    derived = json.dumps(schema, sort_keys=True, separators=(',', ':')).encode()
    analyses.append({'case': '2A-TS03', 'predicate': 'fixture.schema_bytes_exact', 'frozen_sha256': hashlib.sha256(c['expected']['schema_file_bytes'].encode()).hexdigest(),
                     'derived_from_delivered_order_sha256': hashlib.sha256(derived).hexdigest(), 'observed_sha256': obs['sha256'],
                     'observed_bytes': obs['bytes'], 'derived_bytes': len(derived),
                     'observation_equals_derivation': obs['sha256'] == hashlib.sha256(derived).hexdigest() and obs['bytes'] == len(derived)})
    for cid, step in (('2A-TS06', 4), ('2A-TS07', 4)):
        c = spec[cid]
        acc = json.loads((U / 'cases' / ('%s-%s' % (cid, ledger['slots'][cid]['attempt'][:12])) / 'acceptance.json').read_text())
        obs = [p for p in acc['predicates'] if p['id'] == 'argv.exact_vector'][0]['detail']['peer_reported']
        frozen_cfg = [s for s in c['sdk_calls'] if s['step'] == step][0]['options']['config']
        delivered_cfg = json.loads(json.dumps(frozen_cfg, sort_keys=True))
        derived = derive_argv(c['expected']['argv'], delivered_cfg)
        analyses.append({'case': cid, 'predicate': 'argv.exact_vector', 'frozen_config_key_order': list(frozen_cfg),
                         'delivered_config_key_order': list(delivered_cfg), 'frozen_argv': c['expected']['argv'],
                         'derived_from_delivered_order': derived, 'observed': obs, 'observation_equals_derivation': obs == derived})
    doc = {'kind': 'INPUT_KEY_ORDER_ERRATA_READONLY', 'task': 'DX100-G02:IMPLEMENT-AND-ADMIT-SDK-SOURCE-BATCH-2A',
           'root_cause': {'file': 'python/supervisor.py', 'functions': ['fixture_bytes (json.dumps(rows, sort_keys=True))', 'Attempt.prepare (case_input = json.loads(fixture_bytes())[case])'],
                          'effect': 'toda chave de objeto JSON do case_input entregue aos papéis fica em ordem de code point; arrays mantêm a ordem; valores iguais',
                          'missed_by': 'selectedFixture/selected_fixture comparam com stable() (ordem ignorada); os autotestes e os 9 DIAG não tinham objeto com ordem sensível'},
           'slots': rows, 'order_sensitive_predicates': analyses,
           'all_three_explained': all(a['observation_equals_derivation'] for a in analyses),
           'order_insensitive_elsewhere': 'Nos demais casos os predicados comparam objetos por igualdade de valor (dict/JSON), leem campos por nome, ou o objeto tem uma só chave; 2A-TS05 tem config cuja ordem congelada já é a ordem de code point (model, sandbox_workspace_write).',
           'outcome_policy': 'Os três MISMATCH ficam como estão (R3-09; sem retry, sem reclassificação). A derivação mostra que o SDK preservou a ordem que recebeu; o braço de ordem de chaves (achatamento de config e bytes do schema na ordem de inserção) não foi observado com a entrada congelada e fica OPEN para o BIND do 2A.',
           'functional_receipts': 0, 'parity_credit': 0, 'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (U / 'input-order-errata.json').write_text(json.dumps(doc, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'all_three_explained': doc['all_three_explained'], 'analyses': [[a['case'], a['observation_equals_derivation']] for a in analyses],
                      'slots_with_reordered_objects': sum(1 for r in rows if r['reordered_object_paths']),
                      'all_same_value': all(r['same_value_ignoring_key_order'] for r in rows)}))


if __name__ == '__main__':
    main()
