# Fresh current UI critic I1 — 2026-09-13

Verdict: REQUEST CHANGES for PROD-03. Two high-severity contract defects reproduced independently; no production or visual-quality approval. Read-only audit of current source, no previous review/outcome narratives consumed; no descendants, repo source edits, real data, backend calls, or production actions.

Scope: async identity/state correctness in JourneysPanel, transport signal forwarding in client.ts, existing race tests. Read docs/07_agents/AGENTS.md and current PROD-03 contract. Read design-director SKILL.md to classify: this is logic-debugging with UI state consequences, not a visual design audit; no layout/visual score or screenshot claim. Governance state/log/backlog updates delegated to leader to preserve critic read-only independence.

## Blocking findings

1. HIGH — selected session changes do not invalidate pending operations. `apps/web/src/features/journeys/index.tsx:24-26,49-69` generation depends only on actor/role/tenant; selectedSessionId is absent. `:243-260` createTask captures old session but prints a success referring to the currently selected session. Executable A→B session test records `{aborted:false,busyAfterTransition:true,staleSuccessVisible:true}`. Separate delayed-error test displays `SYNTHETIC SESSION A PRIVATE ERROR` in B's role=status element. Old busy state remains during B and old finally clears it, because both contexts have the same generation. This violates contract no stale state/messages after session switch. Fix within reopened PROD-03 scope; regression must cover selectedSessionId changes/null, delayed success/error, clearing old busy and preserving a newly started B operation's busy.

2. HIGH — patientName survives identity reset and leaks into another tenant's form. `:34` patientName is local state, but reset block `:54-65` omits it. Executable probe: A creates owner draft, types synthetic private pet name, switch to tenant B, create B owner draft → B's pet name input contains A's exact value. No stale network promise is needed. This violates the contract's no prior identity data reappearance. Reset the field along with all draft/selection/input state; test actor/role/tenant/logout transitions after populating fields.

## Positive evidence and coverage limits

All three repository journeys-identity-race tests pass: old-tenant owner success hidden; old-tenant error hidden; current response visible. Independent deferred-fetch probes also pass for tenant, actor, role and logout transition: signal aborted and old error ignored; for non-null new identity, start B search then settle A error and B stays busy, finally resolving B successfully shows current candidate. Thus generation error/finally isolation works for those identity transitions once effects flush. Static inspection finds all eight panel journey operations pass AbortSignal to client methods and guard result writes. Client forwards signals to fetch for these methods.

Existing repository suite does not exercise selectedSessionId, retained form values, actor/role/logout separately, unmount, or B-busy preservation. Independent added coverage above is focused; not exhaustive mutation-path or React concurrent scheduling coverage. No transport login credential/session API exists in OperatorIdentity or panel props: only selected conversation session is directly testable here. No Chromium rerun, responsive render, accessibility or backend authorization validation performed by this critic. A passing jsdom suite is not browser acceptance.

## Next independent product gaps — propose SPEC/tasks; do not implement before gate

- Resume persisted drafts: panel never calls existing listJourneyOwnerDrafts/listJourneyPatientDrafts/listJourneyAppointmentDrafts methods (client.ts:579,630,682). Refresh/unmount loses handles; UI only offers new creation. Define scoped resume selection, TTL/expired states and continuation consistency in a separately approved contract; wire read cancellation for newly used list methods then.
- Handoff: section titled “Handoff e tarefa” only creates a task and shows explanatory text. It has no handoff reason/destination/action/result flow. Task creation must not be presented as an observed handoff transition. Define actual safe handoff operation and operator ownership/state in a separate gate.
- Conversation pagination: App.tsx:184 always requests `{limit:25,offset:0}`; client supports pageInfo and offsets but conversation navigation does not advance them. Audit-evidence pagination at :503-512 is separate and does exist. Define next/previous conversation behavior and identity/selection reset contract as independent work; don't blanket-claim all pagination missing.

## Executable evidence

Private copy: `/tmp/m1-ui-critic.w7N07Y` (apps/packages/node_modules/config copied, no node_modules symlink to repository). Node `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node` (target major 22). Custom source `/tmp/m1-ui-critic.w7N07Y/apps/web/src/__tests__/critic-ui.test.tsx`. Command from copy:

```
/home/ricardo/.nvm/versions/node/v22.23.2/bin/node node_modules/vitest/vitest.mjs run apps/web/src/__tests__/critic-ui.test.tsx apps/web/src/__tests__/journeys-identity-race.test.tsx
```

Final exit 1, 10 tests total: 7 pass, 3 discriminating failures (session success/busy/abort, session error, patient name). Exact final log `/tmp/m1-ui-critic-tests.log`. First attempt failed before tests because copy omitted tsconfig.base.json; copied that unchanged config into temp, reran successfully to actual assertions. No dependency installation or repo test cache write.

Pre/post source sentinel: `/tmp/m1-ui-critic-pre.sha256`, `/tmp/m1-ui-critic-post.sha256`; `diff -u` exit 0; `sha256sum --check` all OK before final read completion. SHA256:

```
40178910ad38aca18d9d0c2a4f01088244ba3ace8b094abe231578e4f5b6501e  apps/web/src/features/journeys/index.tsx
5b230630cd1ca4f460420c30fd1f26c46ef6e0fc4dfac736303958a1cdca393e  apps/web/src/api/client.ts
61dbe2d9e1baa964c592e515f31fa00edff426eb24a8aff356e81413a9cd8b05  apps/web/src/__tests__/journeys-identity-race.test.tsx
```

Sentinel covers the three assigned source/test files, not unrelated concurrent leader changes. Findings apply exactly to these hashes. Confidence HIGH for two reproduced defects; MEDIUM for adjacent product gaps based on static reachable UI surface, without browser end-to-end verification.
