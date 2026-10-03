# PISO004-JOURNAL API for Lead integration

Foundation API and five source/test paths are frozen in source-freeze.json.
Status: IMPLEMENTED_NOT_INTEGRATED. Ownership returns to Lead after this report.
No SPEC edits. SPEC SHA-256: 988192fe48737b4571ed659f051e22f3a9283d5c433e7c6c078e1dd0f7be86c3.

```ts
new ShiftStore(dataDir?: string, {
  legacySession?: string, // required for V1 upgrade; actual configured session
  io?: JournalIO         // synthetic failure-injection hooks
})
store.commit({
  transitionId: string,
  expected: {
    inbox?: Record<string, number>,
    notes?: Record<string, number>,
    tasks?: Record<string, number>,
    outbox?: Record<string, number>,
    operation?: Record<string, number>
  },
  changes: readonly ShiftEvent[]
}): { seq: number, sha256: string }
store.revision(entity, id): number // absent entity is revision zero
store.close(): void              // synchronous, idempotent, releases only own lock
```

All affected revisions are mandatory; absent/mismatched guard throws STATE_CONFLICT.
Same transitionId + canonical changes returns original result, even after restart;
different changes throws IDEMPOTENCY_CONFLICT. Expected revisions are guards, not
the idempotency payload. Error code is available on StoreError.code/name.

append(ShiftEvent) obtains current guards and calls commit with a generated
compatibility ID. It does not append V1. Deterministic callers should use commit.
Reads return deeply frozen copies. nextTaskNumber uses max historical number + 1;
allocation still requires task-number revision zero and reference guards inside
commit. Guard maps use keys such as inbox[messageId], notes[noteId],
tasks[String(number)], operation.state. note_created also guards/touches inbox;
task_created also guards/touches its note; note_superseded touches both note IDs.

storageAvailable, diagnostic, operationalHold, effectsAllowed and sequence expose
local state. Readiness/ack/timers must use storageAvailable/effectsAllowed in the
next integration lane; old server has not been edited here. Corruption exposes
validated prefix for diagnosis and blocks writes. Recovery after write/fsync
failure requires close/reopen, replay and idempotent lookup before retry.

saveMediaDescriptor(bytes, MIME, messageKey) returns an immutable synced opaque
descriptor. saveMedia(name, bytes) only interprets the closed extension list and
returns a generated basename, preserving its temporary caller signature.
mediaInventory returns valid descriptors and retained artifacts; it does not
automatically commit orphan associations. Existing media remains untouched.

All current domain events are V1 compatibility events. Their confirmation flag
is historical state, never proof of V2 preview/binding approval. openTasks and
knownPatients remain empty until the Lead adds strict V2 confirmation/binding
events. task_reminded is rejected. taskProjectionState returns draft,
legacy_review_required, done or cancelled. Legacy operationalHold cannot be
cleared by resumed. No human decision or approval token is fabricated.

Strict migration_applied and recovery_recorded schemas exist locally in
journal.ts for physical journal maintenance; commit's public input accepts
only strict ShiftEvent, not unknown events or system maintenance injections.

Next domain integration must extend the discriminated union/schema, affected
revision mapping, batch reference validation and projection publication together.
Concrete SPEC event families: inbound_recorded, processing_started,
media_attached, transcript_recorded, processing_retry_scheduled, draft_prepared,
confirmation_committed, replacement_started, replacement_prepared,
task_completed, task_snoozed_v2, reminder_reserved, outbox_dispatch_started,
outbox_result, delivery_review_resolved, operation_paused/resumed.
They need actor, stable messageKey, references/revisions and SPEC-specific payloads;
confirmation_committed must include note/hash, activated tasks, patient binding
and response intention in the same batch. Local operational maintenance schemas
also need the final domain actor/audit contract. The Lead owns that integration,
including any approved local audited event that releases migration HOLD.
