#!/usr/bin/env python3
"""Directed mutation harness for AAA-12 critical guards.

Reads the frozen selection-v1.json, applies exactly one replacement per
mutant inside a throwaway copy of the isolated baseline tree, runs the
channel test suite, classifies the outcome and writes per-mutant evidence.
The shared product tree is never written to.
"""
import difflib
import json
import os
import re
import shutil
import subprocess
import sys
import time

ORIGIN = '/home/ricardo/cvg-agent-secretary-v2'
EVIDENCE = os.path.join(
    ORIGIN, 'docs/04_audit/evidence/AAA/AAA-12/mutation-hardening'
)
MROOT = '/tmp/opencode/aaa12-mutation'
BASE = os.path.join(MROOT, 'base')

TRANSPILE_ERROR = re.compile(
    r'(Failed to load|Transform failed|SyntaxError|Cannot find module'
    r'|failed to resolve import|Internal server error)'
)
FAILED_SUMMARY = re.compile(r'(Test Files\s+\d+ failed|Tests\s+\d+ failed)')
FAIL_LINE = re.compile(r'FAIL\s+(\S+)\s+>\s+([^\n]+)')


def classify(code, output):
    if code is None:
        return 'BLOCKED', []
    if code == 0:
        return 'SURVIVED', []
    if TRANSPILE_ERROR.search(output):
        return 'INVALID', []
    if FAILED_SUMMARY.search(output):
        killers = [
            f'{match.group(1)} > {match.group(2).strip()}'
            for match in FAIL_LINE.finditer(output)
        ][:8]
        return 'KILLED', killers
    return 'BLOCKED', []


def main():
    results_name = sys.argv[1] if len(sys.argv) > 1 else 'results-v1.json'
    selection = json.load(
        open(os.path.join(EVIDENCE, 'selection-v1.json'), encoding='utf-8')
    )
    os.makedirs(os.path.join(EVIDENCE, 'mutants'), exist_ok=True)
    results = []
    for mutation in selection['mutations']:
        mid = mutation['id']
        work = os.path.join(MROOT, f'work-{mid}')
        shutil.rmtree(work, ignore_errors=True)
        subprocess.run(
            ['cp', '-a', BASE, work], check=True, capture_output=True
        )
        target = os.path.join(work, mutation['file'])
        original = open(target, encoding='utf-8').read()
        old = mutation['mutation']['old']
        new = mutation['mutation']['new']
        if original.count(old) != 1:
            record = {
                'id': mid,
                'status': 'INVALID',
                'reason': 'selection snippet does not match exactly once',
                'killers': []
            }
            results.append(record)
            json.dump(
                {'results': results},
                open(os.path.join(EVIDENCE, results_name), 'w'),
                indent=2,
            )
            shutil.rmtree(work, ignore_errors=True)
            continue
        mutated = original.replace(old, new, 1)
        open(target, 'w', encoding='utf-8').write(mutated)

        patch = ''.join(
            difflib.unified_diff(
                original.splitlines(True),
                mutated.splitlines(True),
                fromfile=f"a/{mutation['file']}",
                tofile=f"b/{mutation['file']}",
            )
        )
        mutant_dir = os.path.join(EVIDENCE, 'mutants', mid)
        os.makedirs(mutant_dir, exist_ok=True)
        open(os.path.join(mutant_dir, 'mutation.patch'), 'w').write(patch)

        started = time.time()
        try:
            process = subprocess.run(
                [
                    'npx', 'vitest', 'run', 'packages/channel-gateway',
                    '--no-file-parallelism', '--maxWorkers=1'
                ],
                cwd=work,
                capture_output=True,
                text=True,
                timeout=selection['timeoutSeconds']
            )
            output = process.stdout + process.stderr
            code = process.returncode
        except subprocess.TimeoutExpired as error:
            output = (error.stdout or '') + (error.stderr or '')
            code = None
        duration = round(time.time() - started, 2)
        open(os.path.join(mutant_dir, 'run.log'), 'w').write(output)

        status, killers = classify(code, output)
        record = {
            'id': mid,
            'family': mutation['family'],
            'guard': mutation['guard'],
            'file': mutation['file'],
            'line': mutation['line'],
            'status': status,
            'exitCode': code,
            'durationSeconds': duration,
            'killers': killers,
            'log': f"mutants/{mid}/run.log",
            'patch': f"mutants/{mid}/mutation.patch"
        }
        results.append(record)
        json.dump(
            {'results': results},
            open(os.path.join(EVIDENCE, results_name), 'w'),
            indent=2
        )
        print(mid, status, killers[:3], flush=True)
        shutil.rmtree(work, ignore_errors=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
