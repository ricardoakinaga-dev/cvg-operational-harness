from pathlib import Path
import json, re, datetime, hashlib, wave, sys

root = Path(sys.argv[1]).resolve()
base = root / 'products/shift-assistant/src/__tests__/fixtures/reliability'
cases = sorted((base / 'cases').glob('*.json'))
assert [p.name for p in cases] == [f'case{i:02}.json' for i in range(1, 21)]
anchors = expected_fields = draft_tasks = 0
entries = []

for i, p in enumerate(cases, 1):
    data = json.loads(p.read_text())
    assert data['id'] == f'SYN-REL-{i:02}'
    assert data['synthetic'] is True and data['status'] == 'PREPARED_NOT_EXECUTED'
    assert data['expectations'] == 'PROPOSED_SPEC0179_AWAITING_HUMAN_REVIEW'
    assert data['input']['rawText'] and data['timezone'] == 'America/Sao_Paulo'
    assert datetime.datetime.fromisoformat(data['clockInstant'].replace('Z', '+00:00')) == datetime.datetime.fromisoformat(data['localInstant'])
    expected = data.get('expectedOutput', data.get('expectedSafeDisposition'))
    assert expected and data['forbiddenEffects'] and data['revisionConditions']
    assert expected.get('sourceApproval') is False

    def resolve(source, context):
        parts = re.findall(r'\w+|\d+', source)
        obj = context if parts and parts[0] in context else data
        for part in parts:
            obj = obj[int(part)] if isinstance(obj, list) else obj[part]
        return obj

    def walk(value, context):
        global anchors
        if isinstance(value, dict):
            if isinstance(value.get('input'), dict) and 'rawText' in value['input']:
                context = value
            if {'source', 'start', 'end', 'quote'} <= value.keys():
                source = resolve(value['source'], context)
                actual = source[value['start']:value['end']]
                assert 0 <= value['start'] < value['end'] <= len(source)
                assert actual == value['quote'] == value.get('literal', actual)
                anchors += 1
            for child in value.values():
                walk(child, context)
        elif isinstance(value, list):
            for child in value:
                walk(child, context)

    walk(data, data)
    if isinstance(expected.get('organizedV1'), dict):
        for field in expected.get('sourceFields', []):
            value = expected['organizedV1']
            for part in re.findall(r'\w+|\d+', field['field']):
                value = value[int(part)] if isinstance(value, list) else value[part]
            target = field.get('normalization', {}).get('expectedValue', field['literal'])
            assert value == target, (p.name, field['field'], value, target)
            expected_fields += 1
    for task in expected.get('tasks', []):
        assert task['draft'] is True and task['active'] is False and task['requiresFutureConfirmation'] is True
        assert datetime.datetime.fromisoformat(task['dueAt'].replace('Z', '+00:00')) == datetime.datetime.fromisoformat(task['dueAtLocal'])
        draft_tasks += 1
    entries.append({'id': data['id'], 'path': str(p.relative_to(base)), 'scenario': data['scenario'], 'sha256': hashlib.sha256(p.read_bytes()).hexdigest(), 'sizeBytes': p.stat().st_size, 'variants': [v['id'] for v in data.get('variants', [])], 'status': data['status']})

negative_controls = []

def strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, list):
        for value in obj:
            yield from strings(value)
    elif isinstance(obj, dict):
        for value in obj.values():
            yield from strings(value)

for number in [13, 14]:
    data = json.loads((base / 'cases' / f'case{number:02}.json').read_text())
    source_numbers = set(re.findall(r'\d+(?:[.,]\d+)?', data['input']['rawText']))
    for candidate in data['modelResponses']:
        candidate_numbers = set(re.findall(r'\d+(?:[.,]\d+)?', ' '.join(strings(candidate['payload']))))
        assert candidate['deliberateBadCandidate'] is True and source_numbers == candidate_numbers
        assert any(issue['blocking'] for issue in data['expectedSafeDisposition']['requiredIssues'])
        negative_controls.append({'case': data['id'], 'candidate': candidate['label'], 'sourceNumbers': sorted(source_numbers), 'candidateNumbers': sorted(candidate_numbers), 'sameGlobalNumbers': True, 'expectedBlockingMismatch': 'PREPARED_NOT_EXECUTED'})

audio = json.loads((base / 'audio-manifest.json').read_text())
assert len(audio['audio']) == 10 and audio['whisper']['status'] == 'NOT_RUN'
audio_anchor_count = patient_bindings = 0
for item in audio['audio']:
    path = base / item['path']
    assert hashlib.sha256(path.read_bytes()).hexdigest() == item['sha256']
    assert hashlib.sha256((base / item['referencePath']).read_bytes()).hexdigest() == item['referenceSha256']
    assert (base / item['referencePath']).read_text() == item['referenceTranscript'] + '\n'
    with wave.open(str(path), 'rb') as waveform:
        duration = waveform.getnframes() / waveform.getframerate()
        assert waveform.getnchannels() == 1 and waveform.getsampwidth() == 2 and waveform.getframerate() == 16000
        assert 0 < duration <= 60 and abs(duration - item['durationSeconds']) < 0.000001
    text = item['referenceTranscript']
    for term in item['criticalTerms']:
        for span in term['ranges']:
            assert text[span['start']:span['end']] == term['literal']
            audio_anchor_count += 1
    for binding in item['patientBindings']:
        span = binding['segment']
        assert text[span['start']:span['end']] == span['text']
        patient_bindings += 1
        for field in binding['fieldSources']:
            field_range = field['range']
            assert span['start'] <= field_range['start'] < field_range['end'] <= span['end']
            assert text[field_range['start']:field_range['end']] == field['literal']

manifest_path = base / 'corpus-manifest.json'
files = [{'path': str(p.relative_to(base)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest(), 'sizeBytes': p.stat().st_size} for p in sorted(base.rglob('*')) if p.is_file() and p.name != 'corpus-manifest.json']
manifest = {'schemaVersion': 1, 'status': 'PREPARED_NOT_EXECUTED', 'synthetic': True, 'sourceSpecSha256': hashlib.sha256((root / 'docs/02_spec/0179_shift_consumer_reliability.md').read_bytes()).hexdigest(), 'cases': entries, 'audioManifest': 'audio-manifest.json', 'files': files, 'executionResults': None, 'whisperStatus': 'NOT_RUN', 'productStatus': 'NOT_RUN', 'humanReview': 'NOT_RUN'}
if '--write-manifest' in sys.argv:
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
else:
    assert json.loads(manifest_path.read_text()) == manifest
print(json.dumps({'status': 'FIXTURE_STRUCTURE_AND_SOURCE_INTEGRITY_PASS_ONLY', 'caseCount': len(cases), 'caseSourceAnchorOccurrences': anchors, 'positiveExpectedFieldsBoundToSource': expected_fields, 'draftTasksInactive': draft_tasks, 'audioCount': len(audio['audio']), 'audioTermOccurrences': audio_anchor_count, 'audioPatientBindings': patient_bindings, 'knownBadNumberSetControls': negative_controls, 'corpusManifestSha256': hashlib.sha256(manifest_path.read_bytes()).hexdigest(), 'actualProductOutputs': 'NOT_RUN', 'actualWhisperTranscriptions': 'NOT_RUN', 'humanQualification': 'NOT_RUN', 'scope': 'Lead data-integrity checks; no acceptance of proposed future product behavior'}))
