"""DV-C32-01 reproduction (read-only for the executed evidence; own code only, no SDK, no service, no network).

harness2b.HookSet._profile registers a thread name only on the first profile event of a new threading.get_ident(); CPython reuses
idents of finished threads, so a thread started after another one ended may never enter seen_threads (THREAD_REGISTRY). Here two
own threads run one after the other under an active HookSet; the frozen class is compared with a twin that marks each thread with a
threading.local() flag (the fix proposed for the next unit). Writes registry-ident-reuse-repro.json.
"""
import datetime
import hashlib
import json
import sys
import threading
from pathlib import Path

U = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(U / 'python'))
import harness2b  # noqa: E402  (own code, stdlib only)

TRIALS = 50


class LocalFlagHookSet(harness2b.HookSet):
    """Proposed fix: per-thread flag instead of the ident set."""

    def __init__(self, emit=None):
        super().__init__(emit)
        self._tl = threading.local()

    def _profile(self, frame, event, arg):
        if (event == 'call' or event == 'return') and self.active and not getattr(self._tl, 'seen', False):
            self._tl.seen = True
            self.seen_threads.add(threading.current_thread().name)
        super()._profile(frame, event, arg)  # frozen recording path unchanged (its ident set only adds names already added)


def work():
    sum(range(10))


def trial(cls):
    hs = cls()
    hs.install([], None)
    idents = []
    try:
        for name in ('cvg-first', 'cvg-second'):
            t = threading.Thread(target=work, name=name)
            t.start()
            t.join()
            idents.append(t.ident)
    finally:
        hs.stop()
    return {'ident_reused': idents[0] == idents[1], 'registered': sorted(n for n in hs.seen_threads if n.startswith('cvg-'))}


def main():
    rows = {'frozen_HookSet': [trial(harness2b.HookSet) for _ in range(TRIALS)],
            'local_flag_twin': [trial(LocalFlagHookSet) for _ in range(TRIALS)]}
    summary = {}
    for k, rs in rows.items():
        summary[k] = {'trials': len(rs), 'ident_reused': sum(r['ident_reused'] for r in rs),
                      'second_missing': sum('cvg-second' not in r['registered'] for r in rs),
                      'second_missing_when_reused': sum(r['ident_reused'] and 'cvg-second' not in r['registered'] for r in rs)}
    out = {'kind': 'DV_C32_01_REGISTRY_IDENT_REUSE_REPRO', 'python': sys.version.split()[0],
           'harness2b_sha256': hashlib.sha256((U / 'python' / 'harness2b.py').read_bytes()).hexdigest(),
           'summary': summary,
           'conclusion': ('frozen HookSet misses a thread whose ident was reused (second_missing_when_reused > 0); '
                          'the threading.local twin registers it in every trial')
           if summary['frozen_HookSet']['second_missing_when_reused'] > 0 and summary['local_flag_twin']['second_missing'] == 0
           else 'not reproduced in this run',
           'executed_evidence_changed': False, 'sdk_imported': False, 'services': 0,
           'observed_at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (U / 'registry-ident-reuse-repro.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(summary), out['conclusion'])


if __name__ == '__main__':
    main()
