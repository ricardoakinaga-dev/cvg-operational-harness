#!/usr/bin/env python3
"""Own evidence qualification only. Executes own reader and installed Prettier.

No target code/helper is imported or executed. Final seal/check output is emitted
externally, since appending it to its own sealed log would create a hash cycle.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[6]
NODE=Path('/home/ricardo/.nvm/versions/node/v22.23.2/bin/node')
PRETTIER=ROOT/'node_modules/prettier/bin/prettier.cjs'
records=[]


def dump():
    (HERE/'commands.json').write_text(json.dumps({
        'task':'DX100-G01:TUI-KEYMAP-VIEW-SURFACES',
        'records':records,
        'scope':'own evidence reader/Markdown/links only; no target/app gates',
        'external_final_commands':'Final --seal and --check stdout/exits are emitted outside this log to avoid circular hashing. Provisional seal/check are logged here.',
        'initial_obsolete_run':'See initial-run-observation.json; no PASS inferred from interrupted run.',
    },ensure_ascii=False,sort_keys=True,indent=2)+'\n')


def run(argv,label,record=True):
    proc=subprocess.run(list(map(str,argv)),cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    row={'id':label,'argv':list(map(str,argv)),'cwd':str(ROOT),'exit_code':proc.returncode,'stdout':proc.stdout,'stderr':proc.stderr,
         'reader_sha256':hashlib.sha256((HERE/'reader.py').read_bytes()).hexdigest()}
    if record:
        records.append(row);dump()
    print(json.dumps(row,ensure_ascii=False),flush=True)
    if proc.returncode: sys.exit(proc.returncode)
    return proc.stdout


def main():
    dump()
    if not (HERE/'manifest.json').exists():
        (HERE/'manifest.json').write_text('{"status":"UNSEALED_LINK_TARGET_ONLY"}\n')
    run([sys.executable,HERE/'reader.py','--build'],'source_build_determinism_negatives')
    version=run([NODE,'--version'],'node22_identity').strip()
    if not version.startswith('v22.'):
        raise ValueError('Node22 required')
    own_markdown=sorted(HERE.glob('*.md'))
    run([NODE,PRETTIER,'--ignore-path','/dev/null','--write',*own_markdown],'own_markdown_format')
    run([NODE,PRETTIER,'--ignore-path','/dev/null','--check',*own_markdown],'own_markdown_check')
    run([sys.executable,HERE/'reader.py','--links'],'own_markdown_links')
    run([sys.executable,HERE/'reader.py','--seal'],'provisional_manifest_seal')
    # Logging the seal changes the manifest's commands.json preimage, so reseal
    # without log mutation immediately before the observed reconstruction check.
    run([sys.executable,HERE/'reader.py','--seal'],'provisional_reseal_external',False)
    run([sys.executable,HERE/'reader.py','--check'],'source_and_strict_manifest_check')
    run([sys.executable,HERE/'reader.py','--seal'],'FINAL_SEAL_EXTERNAL',False)
    run([sys.executable,HERE/'reader.py','--check'],'FINAL_CHECK_EXTERNAL',False)


if __name__=='__main__': main()
