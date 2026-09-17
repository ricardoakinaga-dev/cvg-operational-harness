# Phase 4A synthetic consumers

These examples exercise the public `@cvg/conversation` API with deterministic,
in-memory fixtures:

- `service-desk.ts` runs a meeting-room proposal, an approval-required pause,
  an authenticated approval resume, an effect-backed synthetic result, and a
  duplicate replay. Its `FakeConversationHarness` records only an in-memory
  synthetic reservation.
- `knowledge-assistant.ts` runs an independent knowledge-centric profile using
  `ApprovedOnlyKnowledgeProvider`. Only the versioned source allowed by that
  profile can ground the response; the decoy source is excluded.

Run the combined demonstration with:

```sh
npm run demo:phase4a
```

Run the focused structural and behavioral checks with:

```sh
npm run verify:phase4a
```

The output is controlled synthetic evidence only. It performs no network,
channel, provider, database, or production action, and reports
`externalEffects: false` with production `NO_GO`.
