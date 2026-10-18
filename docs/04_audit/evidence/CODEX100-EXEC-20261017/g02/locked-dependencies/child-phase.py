#!/usr/bin/env python3
"""Trusted fixed operations only; no source build/check/test/run in acquisition."""
from pathlib import Path
import json
import os
import subprocess
import sys

PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
phase = sys.argv[1]
if phase == 'snapshot':
    if Path('/source/.git').exists():raise ValueError('Snapshot exists; inspect terminal prior attempt before reusing it')
    commands = [
        ['git','-c','safe.directory=/upstream','clone','--no-local','--no-hardlinks','--no-checkout','/upstream','/source'],
        ['git','-C','/source','switch','--detach',PIN],
    ]
    for argv in commands:subprocess.run(argv,check=True)
    def git(*args):return subprocess.check_output(['git','-C','/source',*args])
    head = git('rev-parse','HEAD').decode().strip()
    if head != PIN or git('status','--porcelain'):raise ValueError('Snapshot pin/worktree differs')
    if Path('/source/.git/objects/info/alternates').exists():raise ValueError('Snapshot has external object alternates')
    result = {'pin':head,'tree':git('rev-parse','HEAD^{tree}').decode().strip(),
              'tracked_paths':len(git('ls-files','-z').split(b'\0'))-1,
              'source_build_or_execution':False,'physical_clone_no_hardlinks':True}
    Path('/work/snapshot-result.json').write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result))
elif phase == 'help':
    os.execv('/toolchain/bin/cargo',['cargo','vendor','--help'])
elif phase == 'vendor':
    if not Path('/source/.git').is_dir():raise ValueError('Authenticated snapshot required')
    os.chdir('/source/codex-rs')
    os.execv('/toolchain/bin/cargo',['cargo','vendor','--manifest-path','/source/codex-rs/Cargo.toml','--locked','--versioned-dirs','--no-delete','/vendor'])
else:raise ValueError('Unknown acquisition phase')
