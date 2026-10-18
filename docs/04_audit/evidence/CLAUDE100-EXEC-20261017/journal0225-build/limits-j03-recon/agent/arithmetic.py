"""Independent stdlib string/arithmetic models; never imports candidate code.
Each generated specimen is <2.1MB; cumulative materialized specimen bytes <20MB.
JSON serialization below models these selected scalar strings/arrays only;
it is neither execution of the JS canonicalizer nor PostgreSQL jsonb output.
"""
import base64
import hashlib
import json

M, D, E = 1048576, 1398104, 1398616
records = []
cumulative = 0
largest = 0

def record(name, text, **extra):
    global cumulative, largest
    raw = text.encode('utf-8')
    cumulative += len(raw)
    largest = max(largest, len(raw))
    assert cumulative <= 20_000_000
    records.append(dict(name=name, utf8_bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest(), **extra))
    return raw

for size in (M, M + 1):
    text = '"' + 'a' * (size - 2) + '"'
    raw = record('ASCII-' + str(size), text, depth=1, value_nodes=1)
    data = base64.b64encode(raw).decode('ascii')
    payload = dict(encoding='base64', decodedBytes=size, decodedSha256=hashlib.sha256(raw).hexdigest(), data=data)
    records[-1].update(base64_chars=len(data), compact_envelope_bytes=len(json.dumps(payload, separators=(',', ':'))), spaced_envelope_model_bytes=len(json.dumps(payload, separators=(', ', ': '))))
    del raw, data, payload, text

for label, unit, width in [('NUL-value', '\0', 6), ('BMP-value', '界', 3), ('astral-value', '😀', 4), ('quote-value', '"', 2)]:
    k, r = divmod(M - 2, width)
    for extra in (0, 1):
        value = unit * k + 'a' * (r + extra)
        text = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        raw = record(label + '-' + str(extra), text, units=k, ascii_filler=r+extra, depth=1, value_nodes=1)
        assert len(raw) == M + extra
        del raw, value, text

k, r = divmod(M - 6, 6)
for extra in (0, 1):
    text = json.dumps({'\0' * k + 'a' * (r + extra): 0}, ensure_ascii=False, separators=(',', ':'))
    raw = record('NUL-key-' + str(extra), text, units=k, ascii_filler=r+extra, depth=2, value_nodes=2)
    assert len(raw) == M + extra
    del raw, text

for depth in (64, 65):
    record('depth-' + str(depth), '[' * (depth - 1) + '0' + ']' * (depth - 1), depth=depth, value_nodes=depth)

for n in (524288, 1000000, 1000001):
    text = '[' + '0,' * (n - 2) + '0]'
    raw = record('nodes-' + str(n), text, depth=2, value_nodes=n)
    assert len(raw) == 2 * n - 1
    del text, raw

# Tight maximum nodes at the exact byte cap, by replacing the last 0 by 10.
text = '[' + '0,' * (524288 - 2) + '10]'
raw = record('max-nodes-at-exact-bytes', text, depth=2, value_nodes=524288)
assert len(raw) == M

overhead_compact = len(json.dumps(dict(encoding='base64', decodedBytes=M, decodedSha256='0'*64, data=''), separators=(',', ':')))
overhead_spaced = overhead_compact + 7
assert overhead_compact == 137 and overhead_spaced == 144
assert D == 4 * ((M + 2) // 3)
assert (D + 1) % 4 == 1
assert D + overhead_spaced == 1398248
result = dict(evidence_kind='STATIC_INDEPENDENT_STRING_MODELS_ONLY', candidate_execution=False, native_execution=False,
 caps=dict(logical_bytes=M, depth=64, nodes=1000000, data=D, envelope=E), records=records,
 bounds=dict(maximum_nodes_under_byte_cap=(M+1)//2, node_threshold_min_bytes=1999999, node_plus_one_min_bytes=2000001,
            compact_envelope_overhead=overhead_compact, spaced_envelope_model_overhead=overhead_spaced,
            spaced_envelope_model_max=D+overhead_spaced, envelope_model_slack=E-D-overhead_spaced,
            first_valid_base64_length_above_D=D+4, minimum_decoded_bytes_for_that_length=M+3),
 resources=dict(cumulative_specimen_bytes=cumulative, largest_specimen_bytes=largest, budget_bytes=20000000),
 caveat='Spaced envelope model is not a PostgreSQL measurement. Numeric/string models do not prove adapter/native behavior.')
print(json.dumps(result, indent=2, ensure_ascii=False))
