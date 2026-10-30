#!/bin/bash
# SPEC 0288 slice 3 mutants: each must make the slice 3 tests fail.
cd "$(git rev-parse --show-toplevel)"

export CVG_AUD0625_FIXTURE_ROOT="${CVG_AUD0625_FIXTURE_ROOT:?owned fixture root outside /tmp}"
SVC=packages/sandbox/src/process-service/service.ts
PRO=packages/sandbox/src/process-profile.ts
STA=packages/sandbox/src/process-service/landlock-status.ts
mutant() { # id file perl-expr
  cp "$2" "$2.orig"
  perl -0pi -e "$3" "$2"
  if cmp -s "$2" "$2.orig"; then echo "$1 NOT_APPLIED"; mv "$2.orig" "$2"; return; fi
  if npx vitest run tests/par-x02-landlock-launch.test.ts packages/sandbox/src/__tests__/par-x02-landlock-status.test.ts --maxWorkers=1 >/dev/null 2>&1; then echo "$1 SURVIVED"; else echo "$1 KILLED"; fi
  mv "$2.orig" "$2"
}
mutant M1-status-ignored $SVC 's/if \(!report\.applied\) \{/if (false) {/'
mutant M2-landlock-not-requested $SVC 's/\.\.\.\(options\.requireLandlock === true \? \{ landlock: true \} : \{\}\)/...({})/'
mutant M3-workspace-rule-is-root $PRO 's/\[LL_ALL_ABI3, record\.workspaceRoot\]/[LL_ALL_ABI3, "\/"]/'
mutant M4-payload-not-wrapped $PRO 's/if \(landlock\)\n(\s+)args\.push\(\n(\s+)LANDLOCK_HELPER_DESTINATION,/if (false)\n$1args.push(\n$2LANDLOCK_HELPER_DESTINATION,/'
mutant M5-floor-ignored $STA 's/if \(abi < LANDLOCK_MIN_ABI\)/if (false)/'
mutant M6-extra-keys-accepted $STA 's/Object\.keys\(record\)\.length !== 5 \|\|//'
mutant M7-helper-not-required $PRO "s/if \(request\.landlock === true && !helper\) fail\('landlock_helper_required'\)//"
mutant M8-rules-not-written $SVC 's/rules\?\.end\(prepared\.landlock\.rules\)/rules?.end()/'
mutant M9-tmp-not-allowed $PRO "s/\[LL_ALL_ABI3, '\/tmp'\],//"
mutant M10-oversize-ignored $STA 's/if \(this\.#bytes > LANDLOCK_STATUS_MAX_BYTES\) \{/if (false) {/'
# Review P2 fixes (07): proof strength and early judgement.
mutant M11-rights-not-checked $STA 's/if \(\(handledFs & LANDLOCK_RULESET_RIGHTS\) !== LANDLOCK_RULESET_RIGHTS\)/if (false)/'
mutant M12-no-eof-judgement $SVC "s/landlockPipe\?\.on\('end', \(\) => judgeProof\(true\)\)//"
mutant M13-judged-only-at-exit $SVC 's/landlock\.feed\(chunk\)\n(\s+)judgeProof\(false\)/landlock.feed(chunk)/'
mutant M14-start-without-proof $SVC 's/if \(initPid !== undefined && landlockProven\) clearTimeout/if (initPid !== undefined) clearTimeout/'
