"""SPEC0241 §3.1: confer the closed per-edge reason list against the frozen base code before editing.

Every UNKNOWN_* literal thrown by the engine or the resolution helper is classified as
PER_EDGE (exact SPEC list), GLOBAL (SPEC global classes) or UNLISTED (would be global by
default and must be registered in the task contract, never added to the list).
"""
import json, re, subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

PER_EDGE = [
    # resolve() do engine
    'UNKNOWN_RESOLUTION', 'UNKNOWN_NATIVE_BUILTIN', 'UNKNOWN_EXTERNAL_PATH', 'UNKNOWN_FORMAT', 'UNKNOWN_MODULE_INTEROP',
    # seleção e metadados do helper
    'UNKNOWN_AMBIGUOUS_RESOLUTION', 'UNKNOWN_UNSUPPORTED_EXPORTS', 'UNKNOWN_UNRESOLVED_EXPORT', 'UNKNOWN_BLOCKED_EXPORT',
    'UNKNOWN_EXPORTS_DEPTH', 'UNKNOWN_EXACT_EXPORTS_TARGET', 'UNKNOWN_TARGET_URL', 'UNKNOWN_UNSUPPORTED_RUNTIME_RESOLUTION',
    'UNKNOWN_PACKAGE_SELF_REFERENCE', 'UNKNOWN_PACKAGE_SCOPE', 'UNKNOWN_PACKAGE_NAME', 'UNKNOWN_PACKAGE_ESCAPE',
    'UNKNOWN_PACKAGE_DIRECTORY_WITHOUT_MANIFEST', 'UNKNOWN_CJS_FILE_PACKAGE', 'UNKNOWN_ABSOLUTE_PACKAGE_ENTRY',
    'UNKNOWN_WORKSPACE_CONFIG', 'UNKNOWN_WORKSPACE_LINK', 'UNKNOWN_SYMLINK', 'UNKNOWN_ANCESTOR_SYMLINK',
    'UNKNOWN_ANCESTOR_FORMAT', 'UNKNOWN_LINK_FORMAT', 'UNKNOWN_METADATA_ENCODING', 'UNKNOWN_INPUT_ENCODING',
    'UNKNOWN_INVALID_MANIFEST', 'UNKNOWN_PATH',
    # produto após violação gravada
    'UNKNOWN_PRODUCT_TARGET',
    # aquisição por errno
    'UNKNOWN_ACQUISITION_ENOENT', 'UNKNOWN_ACQUISITION_ENOTDIR', 'UNKNOWN_ACQUISITION_ELOOP',
    'UNKNOWN_ACQUISITION_EACCES', 'UNKNOWN_ACQUISITION_EISDIR',
]
GLOBAL = {
    'UNKNOWN_ANALYSIS_LIMIT': 'limite (corte de corpo só para maxStates/maxContexts/maxCallDepth/maxUnionValues na fase de corpo)',
    'UNKNOWN_RESOLUTION_LIMIT': 'limite de resolução',
    'UNKNOWN_INPUT_MUTATION': 'mutação', 'UNKNOWN_RESOLUTION_MUTATION': 'mutação', 'UNKNOWN_ROOT_MUTATION': 'mutação',
    'UNKNOWN_INVALID_SNAPSHOT': 'snapshot', 'UNKNOWN_TOOLCHAIN_MUTATION': 'toolchain',
    'UNKNOWN_ROOT': 'raiz', 'UNKNOWN_ROOT_ALIAS': 'raiz', 'UNKNOWN_ROOT_ACQUISITION': 'raiz',
    'UNKNOWN_CLOSED_SESSION': 'sessão', 'UNKNOWN_ACQUISITION_PLATFORM': 'sessão', 'UNKNOWN_ACQUISITION_CLOSE': 'sessão',
    'UNKNOWN_RUNTIME_PROFILE': 'perfil', 'UNKNOWN_INVALID_LIMITS': 'entrada', 'UNKNOWN_CENSUS_MODE': 'perfil',
    'UNKNOWN_PRODUCT_CALLBACK': 'callback', 'UNKNOWN_NEGATIVE_CALLBACK': 'callback',
    'UNKNOWN_TOOLCHAIN': 'toolchain', 'UNKNOWN_TOOLCHAIN_RUNTIME': 'toolchain', 'UNKNOWN_INVALID_INPUT': 'entrada inválida',
    'UNKNOWN_ACQUISITION_<errno fora da lista>': 'errno aberto (EMFILE, ENFILE, EIO, IO...)',
}
files = {'engine': 'scripts/boundary-semantic-engine.mjs', 'helper': 'scripts/boundary-semantic-resolution.mjs'}
found = {}
for label, rel in files.items():
    src = subprocess.check_output(['git', 'show', BASE + ':' + rel], cwd=CANDIDATE, text=True)
    for m in re.finditer(r"(?:fail|Error)\(\s*'(UNKNOWN_[A-Z_]+)(:?)'?", src):
        name = m.group(1)
        found.setdefault(name, set()).add(label)
    for m in re.finditer(r"'(UNKNOWN_(?:SYMLINK|ANCESTOR_SYMLINK|ANCESTOR_FORMAT|FORMAT))'", src):
        found.setdefault(m.group(1), set()).add(label)
# the open errno suffix (helper io()): 'UNKNOWN_ACQUISITION_' + code
dynamic = 'UNKNOWN_ACQUISITION_' in found
found.pop('UNKNOWN_ACQUISITION_', None)
rows = []
for name in sorted(found):
    cls = 'PER_EDGE' if name in PER_EDGE else 'GLOBAL' if name in GLOBAL else 'UNLISTED'
    rows.append({'reason': name, 'thrownBy': sorted(found[name]), 'class': cls})
unlisted = [r['reason'] for r in rows if r['class'] == 'UNLISTED']
listedNotFound = [r for r in PER_EDGE if r not in found and not r.startswith('UNKNOWN_ACQUISITION_E')]
out = {'task': TASK, 'observedAt': now(), 'base': BASE, 'specSection': '§3.1', 'perEdgeList': PER_EDGE, 'perEdgeCount': len(PER_EDGE),
       'globalClasses': GLOBAL, 'openErrnoSuffixInHelper': dynamic, 'classified': rows, 'unlistedFoundInCode': unlisted,
       'listedButNotLiteralInCode': listedNotFound,
       'notes': ['UNKNOWN_ACQUISITION_<errno> é sufixo aberto no helper (io()); só ENOENT/ENOTDIR/ELOOP/EACCES/EISDIR são contidos.',
                 'UNKNOWN_INPUT_ENCODING é contido; o engine o registra como UNKNOWN_ENCODING (regra v3 inalterada).',
                 'Erros fora do padrão UNKNOWN_* (ex.: SyntaxError, RangeError) são globais.'],
       'status': 'PASS' if not unlisted else 'UNLISTED_REASONS_GLOBAL_BY_DEFAULT'}
save('reason-census-base.json', out)
print(json.dumps({k: out[k] for k in ('status', 'perEdgeCount', 'unlistedFoundInCode', 'listedButNotLiteralInCode', 'openErrnoSuffixInHelper')}, indent=1))
