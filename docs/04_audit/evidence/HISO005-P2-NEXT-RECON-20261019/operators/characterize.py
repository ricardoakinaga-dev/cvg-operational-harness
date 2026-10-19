"""Builds q1-characterization.json and q2-characterization.json from the diagnostic records of this package and
from read-only git measurements of the shared repository (ls-tree/archive only). DIAGNOSTIC ONLY.

usage: characterize.py
"""
import json, re, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

GiB4 = 4 * 1024 ** 3
v = {n: load('diag-' + n + '.json') for n in ['official', 'ctx2x', 'ctx4x', 'ctx8x', 'all8x', 'nocut']}
nc = v['nocut']['result']
pipe = load('pipeline-caps-256-250k.json')
cons = load('diag-conservation-cut-vs-full.json')
q2m = load('q2-measure-excl-vs-t2.json')

variants = []
for n, d in v.items():
    r = d['result']
    variants.append({'variant': n, 'limitsOverride': d['limits'], 'loadAvgAtStart': d['loadAvgAtStart'][0], 'elapsedMs': r['elapsedMs'],
                     'maxRssMB': r['maxRssMB'], 'status': r['status'], 'cut': None if not r['cut'] else {k: r['cut'][k] for k in ('cap', 'value', 'statesNow', 'modulesStarted', 'contextDepth')},
                     'modulesStarted': r['bodyCoverage']['modules']['started'], 'modulesCompleted': r['bodyCoverage']['modules']['completed'],
                     'containedEdges': r['bodyCoverage']['containedEdges'], 'usage': {k: r['usage'][k] for k in ('states', 'contexts', 'callDepth', 'unionValues')},
                     'unknownTuplesWorker': r['unknowns'], 'violations': r['violations'], 'proofs': r['proofs']})

mods = nc['modules']
s = sorted(m['states'] for m in mods)
q = lambda p: s[min(len(s) - 1, int(p * len(s)))]
def cat(f):
    if f.startswith('node_modules/'): return 'node_modules'
    if '__tests__' in f or '.test.' in f or f.startswith('tests/'): return 'tests'
    if '/dist/' in f: return 'workspace-dist'
    return 'workspace-src'
cats = {}
for m in mods:
    a = cats.setdefault(cat(m['file']), {'modules': 0, 'inclusiveStates': 0, 'inclusiveMs': 0})
    a['modules'] += 1; a['inclusiveStates'] += m['states']; a['inclusiveMs'] += m['ms']
top = sorted(mods, key=lambda m: -m['states'])
fns = nc['topFunctionsBySignatures']
ser = nc['series']
body_rate = (ser[-1]['states'] - ser[0]['states']) / ((ser[-1]['ms'] - ser[0]['ms']) / 1000)
heap_per_state = (ser[-1]['heapMB'] - ser[0]['heapMB']) * 1024 * 1024 / (ser[-1]['states'] - ser[0]['states'])
normal = [r for r in pipe['runs'] if r['mode'] == 'normal'][0]
strict = [r for r in pipe['runs'] if r['mode'] == 'strict'][0]
cutpipe = [r for r in q2m['runs'] if r['mode'] == 'normal'][0]['telemetry']['elapsedMs']
fixed = cutpipe  # official caps: body cut after ~7.7k states, so this is ~all fixed cost
per_state_pipeline = (normal['telemetry']['elapsedMs'] - fixed) / (nc['usage']['states'] - v['official']['result']['usage']['states'])

import gzip
from collections import Counter


def identity_section():
    d = load('identity-deadline-probe.json')
    out = []
    for r in d['runs']:
        out.append({k: r[k] for k in ('label', 'limitsOverride', 'comparatorDeadlineOverrideMs', 'loadAvgAtStart', 'semanticTelemetry',
                                      'verifierAgeAtFirstFinalizeMs', 'verifierAgeAtFinalFinalizeMs', 'validation', 'envelopeTuples', 'diagnostics')}
                   | {'finalFinalizeStatus': r['finalFinalize']['status'], 'finalFinalizeReasons': r['finalFinalize']['reasons'],
                      'body': (r['phases'] or {}).get('body')})
    return {'record': 'identity-deadline-probe.json', 'runs': out,
            'reading': 'o comparador de identidade instalada mede 120 s desde a criação do verificador, antes da etapa semântica; a revalidação final depois do corpo integral passa de 120 s, vira COMPARISON_TIMEOUT, UNKNOWN_INSTALLED_REFERENCE e validation false (todas as provas descartadas). Com o prazo do comparador sem contar a etapa semântica (diagnóstico: 300 s) a validação volta a true, sem tupla de envelope. Sob carga ~10 até a configuração oficial com corte estourou o prazo semântico (135 s).'}


def tuples(report):
    s = report['semanticBoundary']
    return Counter((u.get('file') or '', u['reason'], u.get('detail') or '') for u in s['unknowns']), len(s['violations']) + len(report['violations'])


def pipeline_validation():
    out = {}
    for mode in ('normal', 'strict'):
        r = json.loads(gzip.decompress((RUNTIME / ('pipeline-caps-256-250k/' + mode + '-report.json.gz')).read_bytes()))
        s = r['semanticBoundary']
        out[mode + 'Validation'] = s['validation']
        out[mode + 'EnvelopeTuples'] = [u for u in s['unknowns'] if u['reason'] in ('UNKNOWN_INSTALLED_REFERENCE', 'UNKNOWN_INPUT_REVALIDATION', 'UNKNOWN_HOST_VALIDATION', 'UNKNOWN_ANALYSIS_LIMIT')]
        out[mode + 'SemanticPayloadBytes'] = len(json.dumps(s))
    out['validationNote'] = 'corpo integral dentro do prazo semântico, mas a revalidação final da identidade instalada estourou o prazo de vida do comparador (ver identityDeadline): validation false e duas tuplas de envelope'
    return out


def phase_section():
    d = load('identity-phase-probe.json')
    return {'record': 'identity-phase-probe.json', 'limitsOverride': d['limitsOverride'], 'comparisonTimeoutMs': d['comparisonTimeoutMs'],
            'pinnedNodeHeapSizeLimitBytes': d['pinnedNodeHeapSizeLimitBytes'], 'normalStrictEqual': d['normalStrictPayloadEqualExcludingTelemetry'],
            'runs': [{'mode': r['mode'], 'loadAvgAtStart': r['loadAvgAtStart'], 'semanticMs': round(r['semanticTelemetry']['elapsedMs']),
                      'verifierPhase1Ms': r['phaseClock'][0]['phaseMs'], 'verifierFinalPhaseMs': [x for x in r['phaseClock'] if x['finalization'] == 2][0]['phaseMs'],
                      'comparesAfterFirstFinalize': max(x['comparesAfterFinalize'] for x in r['phaseClock']), 'validation': r['validation'],
                      'envelopeTuples': r['envelopeTuples'], 'diagnostics': r['diagnostics'], 'semanticPayloadCompactBytes': r['semanticPayloadCompactBytes'],
                      'conservationVsT2Cut': r['conservationVsT2Cut']} for r in d['runs']],
            'note': 'L3 executada como diagnóstico na cópia privada: fase 1 da criação ao fim da 1ª finalização, finalização posterior com relógio próprio, checkTime e _deadline de collect() pelo início da fase. As outras linhas de fase do log são de comparadores das referências compiladas, criados e finalizados sem etapa semântica no meio.'}


def caps_headroom():
    u = nc['usage']
    lim = {'maxNodes': 2000000, 'maxFiles': 12000, 'maxCallDepth': 64, 'maxUnionValues': 128}
    used = {'maxNodes': u['nodes'], 'maxFiles': u['files'], 'maxCallDepth': u['callDepth'], 'maxUnionValues': u['unionValues']}
    out = {k: {'used': used[k], 'limit': lim[k], 'headroom': round(lim[k] / used[k], 2)} for k in lim}
    out['note'] = 'maxNodes e maxFiles são contados na aquisição, antes de phases.acquisition = COMPLETED; estourar perde o corpo inteiro (UNKNOWN global), sem corte declarado do corpo'
    return out


def conservation_p3():
    full = json.loads(gzip.decompress((RUNTIME / 'probe-P3-caps256-250k-240s-cmp300s/report.json.gz').read_bytes()))
    cut = json.loads(gzip.decompress((PROJECT / 'docs/04_audit/evidence/HISO005-P2-REFERENCE-RECIPE-T2-20261019/real-v4r2-normal-report.json.gz').read_bytes()))
    tf, vf = tuples(full)
    tc, vc = tuples(cut)
    missing = sorted(set(tc) - set(tf))
    return {'cut': '../HISO005-P2-REFERENCE-RECIPE-T2-20261019/real-v4r2-normal-report.json.gz', 'full': 'probe P3 (256/250k, 240 s, comparador 300 s), normal',
            'cutDistinctTuples': len(tc), 'fullDistinctTuples': len(tf), 'cutTuplesMissingInFull': [list(m) for m in missing],
            'onlyEnvelopeMissing': all(m[1] == 'UNKNOWN_ANALYSIS_LIMIT' for m in missing), 'violations': {'cut': vc, 'full': vf},
            'fullValidation': full['semanticBoundary']['validation'], 'diagnostics': {'cut': len(cut['diagnostics']), 'full': len(full['diagnostics'])}}


q1 = {
    'task': TASK, 'question': 'Q1', 'diagnosticOnly': True, 'notAcceptanceNotOfficial': True, 'observedAt': now(),
    'inputs': {'engineInput': 'engine-input-dump.json', 'officialEngineSha256': load('engine-input-dump.json')['officialEngineSha256'],
               'diagEngineSha256': load('engine-input-dump.json')['diagEngineSha256'], 'reproducesT2Diagnostics': load('engine-input-dump.json')['diagnostics']},
    'whatCausesTheCut': {
        'cap': 'maxContexts (64 per function codeId)', 'function': '__name', 'codeId': fns[0]['codeId'], 'file': fns[0]['file'],
        'pattern': 'helper de nomeação do bundler chamado no topo do módulo uma vez por função nomeada, cada chamada com um literal distinto: cada assinatura (fn.id, receiver, args, capturas) é um contexto novo',
        'distinctSignatures': fns[0]['distinctSignatures'], 'calls': fns[0]['calls'], 'maxDepth': fns[0]['maxDepth'],
        'cutAt': v['official']['result']['cut'], 'edgeChain': [m['file'] for m in v['official']['result']['modules'][-3:]],
        'reading': 'não é recursão nem profundidade: a pilha está vazia (contextDepth 0) e a profundidade máxima do corpo inteiro é 8. É largura: helpers de registro chamados dezenas de vezes no topo de bibliotecas de teste e validação.'},
    'needsWithoutCut': nc['usage'], 'variants': variants,
    'sequenceOfCuts': ['maxContexts 64 e 128: corte no módulo 23 (chai), 7.725/8.933 estados', 'maxContexts ≥ 145 (256, 512): o próximo corte é maxStates 100.000 no módulo 1.026 de 1.341',
                       'maxContexts ≥ 145 e maxStates ≥ 125.460: corpo integral (1.341/1.341, 1.535 arestas contidas), sem corte'],
    'contextsPerFunction': {'functionsWithContexts': ser[-1]['functionsWithContexts'], 'over64': sum(1 for f in fns if f['maxContextsPerId'] > 64),
                            'over32': sum(1 for f in fns if f['maxContextsPerId'] > 32), 'over16': sum(1 for f in fns if f['maxContextsPerId'] > 16),
                            'firstPartyMax': max((f['maxContextsPerId'], f['name'], f['file']) for f in fns if not f['file'].startswith('node_modules/')),
                            'top': [{k: f[k] for k in ('name', 'file', 'calls', 'distinctSignatures', 'maxContextsPerId', 'distinctArgs', 'distinctCaptures', 'maxDepth')} for f in fns[:12]]},
    'memoizationEffect': {'callsTop40': sum(f['calls'] for f in fns), 'distinctSignaturesTop40': sum(f['distinctSignatures'] for f in fns),
                          'reading': 'memoização por assinatura só reaproveita chamadas repetidas; nos helpers que estouram, quase toda chamada tem argumento distinto (__name 159 chamadas, 145 assinaturas), então não remove a barreira'},
    'statesPerModuleInclusive': {'note': 'estados medidos em load(), inclusivos: o módulo importador conta os módulos carregados dentro dele', 'modules': len(mods),
                                 'p50': q(.5), 'p90': q(.9), 'p99': q(.99), 'max': s[-1],
                                 'top': [{k: m[k] for k in ('order', 'file', 'states', 'ms')} for m in top[:12]], 'byCategory': cats},
    'callDepthByFile': nc['maxDepthByFile'][:8], 'statesByFileExclusiveTop': nc['topFilesByStates'][:10],
    'growth': {'singlePassBodyStatesPerSecond': round(body_rate), 'heapBytesPerState': round(heap_per_state),
               'series': [{k: p[k] for k in ('ms', 'states', 'maxContexts', 'functionsWithContexts', 'modulesCompleted', 'heapMB', 'rssMB')} for p in ser[::6] + [ser[-1]]],
               'singlePassTotalMs': nc['elapsedMs'], 'singlePassMaxRssMB': nc['maxRssMB'],
               'reading': 'tempo e memória crescem de forma linear com os estados; dobrar maxContexts não muda o custo (official e ctx2x gastam o mesmo), só maxStates e o tamanho do corpo pesam'},
    'officialPipeline': {'limits': pipe['limits'], 'deadlineMs': 120000, 'normal': normal['telemetry'], 'strict': strict['telemetry'],
                         'slackMs': [round(120000 - normal['telemetry']['elapsedMs']), round(120000 - strict['telemetry']['elapsedMs'])],
                         'cutPipelineMs': round(cutpipe), 'pipelineMsPerBodyState': round(per_state_pipeline, 4),
                         'projectedAt250kStatesMs': round(fixed + per_state_pipeline * 250000),
                         'diagnostics': normal['diagnostics'], 'proofs': normal['proofs'], 'violations': normal['violations'],
                         'normalStrictEqual': pipe['normalStrictPayloadEqualExcludingTelemetry'], 'reportBytes': normal['reportBytes'], 'workerMaxBufferBytes': 64 * 1024 ** 2,
                         **pipeline_validation()},
    'conservation': cons,
    'identityDeadline': identity_section(),
    'identityPhaseClockL3': phase_section(),
    'capsHeadroom': caps_headroom(),
    'costIndependentOfContexts': {'ctx4x_vs_ctx8x_ms': [v['ctx4x']['result']['elapsedMs'], v['ctx8x']['result']['elapsedMs']], 'all8x_vs_nocut_ms': [v['all8x']['result']['elapsedMs'], v['nocut']['result']['elapsedMs']],
                                  'note': 'pares com o mesmo ponto de parada e tetos de contexto diferentes gastam o mesmo; official e ctx2x param no mesmo módulo e não testam custo'},
    'inferenceAlternativesStillNeedStates': {'exclusiveStatesOfOverflowingHelperFiles': sum(f['states'] for f in nc['topFilesByStates'] if f['file'] in ('node_modules/zod/v4/core/core.js', 'node_modules/@vitest/expect/dist/index.js', 'node_modules/chai/index.js', 'node_modules/@vitest/utils/dist/helpers.js')),
                                             'remainingIfZeroed': nc['usage']['states'] - sum(f['states'] for f in nc['topFilesByStates'] if f['file'] in ('node_modules/zod/v4/core/core.js', 'node_modules/@vitest/expect/dist/index.js', 'node_modules/chai/index.js', 'node_modules/@vitest/utils/dist/helpers.js')),
                                             'note': 'inferência, não medição: mesmo zerando os estados exclusivos dos arquivos dos helpers que estouram, sobram mais de 100.000 estados, então widening ou corte por módulo ainda exigiriam subir maxStates'},
    'conservationValidFullBody': conservation_p3(),
    'options': [
        {'id': 'A', 'what': 'subir maxContexts 64→256, maxStates 100.000→250.000 e o prazo semântico 120→300 s, e contar o prazo de 120 s do comparador de identidade só no tempo de comparação (sem a etapa semântica); o resto igual', 'measured': True,
         'pro': 'menor diff (3 constantes e o início do relógio do comparador); medido: corpo integral, validation true, normal/strict iguais, só a tupla de envelope do corte some', 'contra': 'margem finita (1,77× contextos, 1,99× estados); custo linear cresce com a árvore'},
        {'id': 'B', 'what': 'widening por função depois de K contextos', 'measured': False,
         'pro': 'contextos ficam limitados por construção', 'contra': 'muda o domínio abstrato e a §3.5 (novos UNKNOWN por perda de precisão); ainda exige maxStates ≥ 125.460'},
        {'id': 'C', 'what': 'corte por módulo em vez de global', 'measured': False,
         'pro': 'um helper ruim não para o corpo inteiro', 'contra': 'muda bodyCoverage e a semântica de corte; chai, zod core e @vitest/expect são importados por quase todos os testes, então os UNKNOWN em cascata cobrem a maior parte; ainda exige mexer em maxStates'},
        {'id': 'D', 'what': 'memoização de chamadas', 'measured': True, 'pro': 'reduz trabalho repetido', 'contra': 'não muda a contagem de contextos dos helpers que estouram'}],
    'recommendation': 'A. É a menor mudança que remove a barreira sem mexer no algoritmo; B e C não evitam elevar maxStates nem o prazo, e mudam a semântica. Sem o ajuste do comparador, o corpo integral sai com validation false.',
}
save('q1-characterization.json', q1)

# ---------- Q2 ----------
def size_at(c):
    out = subprocess.run(['git', '-C', str(PROJECT), 'ls-tree', '-r', '-l', '-z', c], capture_output=True, check=True).stdout
    tot = ev = n = ne = 0
    for rec in out.split(b'\0'):
        if not rec: continue
        meta, name = rec.split(b'\t', 1)
        sz = meta.split()[3]
        if sz == b'-': continue
        sz = int(sz); tot += sz; n += 1
        if name.startswith(b'docs/04_audit/evidence/'): ev += sz; ne += 1
    return {'trackedBytes': tot, 'trackedFiles': n, 'evidenceBytes': ev, 'evidenceFiles': ne, 'restBytes': tot - ev}
def tar_size(c, excl=False):
    argv = ['git', '-C', str(PROJECT), 'archive', '--format=tar', c] + (['--', '.', ':(exclude)docs/04_audit/evidence'] if excl else [])
    p = subprocess.Popen(argv, stdout=subprocess.PIPE)
    n = 0
    while True:
        b = p.stdout.read(1 << 20)
        if not b: break
        n += len(b)
    assert p.wait() == 0
    return n
def date(c):
    return subprocess.check_output(['git', '-C', str(PROJECT), 'log', '-1', '--format=%cI', c], text=True).strip()

def lock_facts():
    out = {'command': 'git show <commit>:package-lock.json / package.json; git ls-tree -r --name-only <commit> -- docs/04_audit/evidence'}
    for c in ['228e7918', 'da35382a', 'ae14b824']:
        lock = json.loads(subprocess.check_output(['git', '-C', str(PROJECT), 'show', c + ':package-lock.json']))
        pk = lock['packages']
        root = json.loads(subprocess.check_output(['git', '-C', str(PROJECT), 'show', c + ':package.json']))
        names = subprocess.check_output(['git', '-C', str(PROJECT), 'ls-tree', '-r', '--name-only', c, '--', 'docs/04_audit/evidence'], text=True).splitlines()
        out[c] = {'lockPackages': len(pk), 'lockKeysUnderDocs': sum(1 for k in pk if k.startswith('docs/') or '/docs/' in k),
                  'fileDeps': sum(1 for v in pk.values() if isinstance(v.get('resolved'), str) and v['resolved'].startswith('file:')),
                  'links': sum(1 for v in pk.values() if v.get('link')),
                  'linkTargetTopDirs': sorted({v['resolved'].split('/')[0] for v in pk.values() if v.get('link')}),
                  'workspaces': root.get('workspaces'),
                  'underEvidence': {'npmrc': sum(1 for n in names if n.split('/')[-1] == '.npmrc'),
                                    'packageJson': sum(1 for n in names if n.split('/')[-1] == 'package.json'),
                                    'packageLock': sum(1 for n in names if n.split('/')[-1] == 'package-lock.json'),
                                    'tsconfig': sum(1 for n in names if re.match(r'tsconfig.*\.json$', n.split('/')[-1]))}}
    return out


def entries_dirs():
    files = int(subprocess.check_output(['bash', '-c', 'git -C "$0" ls-tree -r --name-only ae14b824 -- docs/04_audit/evidence | wc -l', str(PROJECT)], text=True))
    dirs = int(subprocess.check_output(['bash', '-c', 'git -C "$0" ls-tree -r -d --name-only ae14b824 -- docs/04_audit/evidence | wc -l', str(PROJECT)], text=True))
    per_file = (files + dirs) / files
    return {'evidenceFilesAe14': files, 'evidenceDirsAe14': dirs, 'entriesPerFile': round(per_file, 3),
            'entriesPerDay': round(per_file * frate_global()), 'daysToEntriesCapIfBytesRaised': round((200000 - ie['receiptSummary']['usage']['entries'] - files - dirs) / (per_file * frate_global()), 1),
            'note': 'estimativa: com 8 GiB, o teto de 200.000 entradas do snapshot chega antes do teto de bytes'}


def receipt_diff():
    out = {}
    for kind in ('installed', 'compiled'):
        a = json.loads((RUNTIME / (kind + '-reference-ref/reference.json')).read_text().replace(str(RUNTIME / (kind + '-reference-ref')), '<OUT>'))
        b = json.loads((RUNTIME / (kind + '-reference-excl/reference.json')).read_text().replace(str(RUNTIME / (kind + '-reference-excl')), '<OUT>'))
        diffs = []
        def walk(x, y, p=''):
            if isinstance(x, dict) and isinstance(y, dict):
                for k in sorted(set(x) | set(y)): walk(x.get(k), y.get(k), p + '.' + k)
            elif x != y: diffs.append(p)
        walk(a, b)
        out[kind] = diffs
    out['note'] = 'diferenças depois de trocar o prefixo do diretório de saída por <OUT>; elapsedMs e traceSha256 variam a cada execução do npm'
    return out


ir = load('installed-recipe-ref.json'); ie = load('installed-recipe-excl.json')
cr = load('compiled-recipe-ref.json'); ce = load('compiled-recipe-excl.json')
nm = ie['receiptSummary']['usage']['regularBytes'] - size_at(BASE)['restBytes']
commits = {}
for c in ['228e7918', 'da35382a', 'ae14b824']:
    m = size_at(c); m['date'] = date(c)
    m['installedSnapshotEstimate'] = m['trackedBytes'] + nm
    m['installedMarginEstimate'] = GiB4 - m['installedSnapshotEstimate']
    m['compiledTarBytes'] = tar_size(c); m['compiledTarMargin'] = GiB4 - m['compiledTarBytes']
    m['compiledTarBytesExcluded'] = tar_size(c, True)
    commits[c] = m
hist = []
for c in ['8922d167', 'cc1402ff', '35d280d0', '4c45ab4f', 'ca565391', '7ecc5b53', 'ee79a364', 'ae14b824']:
    m = size_at(c); hist.append({'commit': c, 'date': date(c), 'evidenceBytes': m['evidenceBytes'], 'evidenceFiles': m['evidenceFiles'], 'restBytes': m['restBytes']})
days = 17.7
rate = (hist[-1]['evidenceBytes'] - [h for h in hist if h['commit'] == 'cc1402ff'][0]['evidenceBytes']) / days
frate = (hist[-1]['evidenceFiles'] - [h for h in hist if h['commit'] == 'cc1402ff'][0]['evidenceFiles']) / days
def frate_global():
    return frate


q2 = {
    'task': TASK, 'question': 'Q2', 'observedAt': now(),
    'limits': {'INSTALLED_IDENTITY_LIMITS.maxTotalBytes': GiB4, 'INSTALLED_IDENTITY_LIMITS.maxEntries': 200000, 'compiledArchiveCeilingBytes': GiB4,
               'usedBy': ['receita instalada (snapshot + node_modules)', 'leitor do recibo instalado (limits do recibo == constante; usage <= teto)',
                          'comparador de identidade instalada', 'varredura instalada da fronteira de produto (boundary-manifests)',
                          'paginação da listagem da receita compilada (maxEntries)']},
    'measuredAt228e': {'installedSnapshotRegularBytes': ir['receiptSummary']['usage']['regularBytes'], 'installedMargin': GiB4 - ir['receiptSummary']['usage']['regularBytes'],
                       'installedEntries': ir['receiptSummary']['usage']['entries'], 'nodeModulesBytes': nm},
    'commits': commits, 'evidenceGrowth': hist,
    'meanGrowthSince20261001': {'bytesPerDay': round(rate), 'filesPerDay': round(frate),
                                'daysToInstalledCapAtAe14': round(commits['ae14b824']['installedMarginEstimate'] / rate, 1),
                                'daysToEntriesCapAtAe14': round((200000 - ie['receiptSummary']['usage']['entries'] - commits['ae14b824']['evidenceFiles']) / frate, 1),
                                'note': 'média de 17,7 dias (01/10 a 19/10), com um salto de 1,24 GB em cerca de 19 h (35d280d0→4c45ab4f) e +1,09 GB em cerca de 46 h (7ecc5b53→ee79a364); estimativa, não previsão'},
    'optionExclude': {
        'installed': {'ref': {k: ir['receiptSummary']['usage'][k] for k in ('regularBytes', 'entries', 'maxDepth')},
                      'excl': {k: ie['receiptSummary']['usage'][k] for k in ('regularBytes', 'entries', 'maxDepth')},
                      'packagesIdentical': True, 'packages': ie['receiptSummary']['packages'],
                      'receiptFieldsChanged': ['recipe.sourceSha256', 'recipe.sourceExclusions (novo)', 'usage', 'recipe.observation (tempo, trace)', 'caminhos do runtime'],
                      'receiptFieldsEqual': ['packages (304, todas as entradas)', 'lockSha256', 'configSha256', 'toolchain', 'selection', 'commit', 'limits']},
        'compiled': {'readerRef': cr['reader'], 'readerExcl': ce['reader'],
                     'receiptFieldsEqual': ['inputs', 'outputs', 'compiler', 'compilerSources', 'dependencies', 'runtimeResolutions', 'toolchain', 'commit', 'recipeVersion'],
                     'receiptFieldsChanged': ['commandsSha256 (argv do archive)', 'recipeSha256 (bytes do script)', 'installedReferenceDigest (encadeado)']},
        'b6Measurement': {'record': 'q2-measure-excl-vs-t2.json', 'diagnosticsMultisetEqual': all(r['diagnosticsMultisetEqual'] for r in q2m['runs']),
                          'unknownTuplesEqual': all(r['unknownTuplesEqual'] for r in q2m['runs']), 'diagnostics': 2410},
        'whyEvidenceIsNotAnInput': {'lockPackagesUnderDocs': 0, 'lockFileDeps': 0, 'workspaces': ['apps/*', 'packages/*', 'legacy/packages/*', 'products/*'],
                                    'npmrcUnderEvidence': 0, 'packageJsonUnderEvidence': 1188, 'packageLockUnderEvidence': 201,
                                    'reading': 'os package.json e locks dentro da evidência são fixtures e capturas; não estão sob nenhum glob de workspace nem no lock da raiz, então npm ci e tsc não os leem; isso é premissa e precisa de guarda que falhe fechado'},
        'provenance': 'o recibo continua amarrado ao commit completo (commit SHA), mas sourceSha256 deixa de cobrir os bytes da evidência; a exclusão fica explícita no recibo e no argv registrado'},
    'optionRaise': {'what': 'subir maxTotalBytes de 4 para 8 GiB', 'buysDaysAtMeanRate': round((4 * 1024 ** 3 + commits['ae14b824']['installedMarginEstimate']) / rate, 1),
                    'sideEffects': 'a mesma constante governa o leitor do recibo, o comparador e a varredura instalada da fronteira de produto; subir afrouxa todos, ou exige separar a constante (outra mudança de contrato); maxEntries (200.000) vira o próximo teto com a evidência crescendo em arquivos'},
    'compiledNeedsSameDecision': True,
    'lockFacts': lock_facts(),
    'entriesGrowthWithDirectories': entries_dirs(),
    'receiptDiffNormalized': receipt_diff(),
    'recommendation': 'Excluir docs/04_audit/evidence/** das duas receitas, com o prefixo como constante fechada, registro no recibo e guarda fail-closed; nenhum teto muda.',
}
save('q2-characterization.json', q2)
print(json.dumps({'q1': {k: q1[k] for k in ('needsWithoutCut', 'recommendation')}, 'q1pipe': q1['officialPipeline'], 'q2': {k: q2[k] for k in ('measuredAt228e', 'meanGrowthSince20261001', 'optionRaise')}, 'commits': commits}, indent=1, ensure_ascii=False))
