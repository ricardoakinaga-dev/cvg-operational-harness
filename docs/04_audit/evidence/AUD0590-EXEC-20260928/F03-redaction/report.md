# AUD-0590 F03 — OTel SDK boundary reproduction

## Result

The frozen F03 P1 criterion in [quality-bar-v1.json](../quality-bar-v1.json) requires the synthetic marker to be absent at the OpenTelemetry SDK boundary and in local telemetry buffers. This read-only product probe **reproduced a violation**: 4 of 8 fake SDK calls contained `AUD0590_SYNTHETIC_MARKER`; two local spans and one local metric also retained it. Probe exit code 0 means the assertions confirmed the leak. The product criterion is `FAIL_REPRODUCED`.

Captured SDK operations containing the marker:

- root `startSpan` attributes;
- `setAttribute`;
- child `startSpan` attributes;
- `counter.add` metric attributes.

The fake tracer and meter record arguments synchronously when the SDK methods are entered. No OpenTelemetry provider, exporter, network service, database, or real data was used.

## Reproduction

- **Environment:** Node `v22.23.2`; local `tsx` runner; synthetic in-process tracer/meter and `InMemoryTelemetry` fallback.
- **Command:** `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node node_modules/tsx/dist/cli.mjs docs/04_audit/evidence/AUD0590-EXEC-20260928/F03-redaction/probe.ts`
- **Exit:** `0` (diagnostic assertions passed by observing the expected leak).
- **Raw output:** [probe-output.json](probe-output.json).
- **Machine result:** [probe-result.json](probe-result.json).
- **Evidence manifest:** [proof.json](proof.json).
- **Reproduction source:** [probe.ts](probe.ts).

The adapter forwards `toOtelAttributes(attributes)` directly to root/child span creation and metric instruments; `setAttribute` calls the SDK span directly. `InMemoryTelemetry` redacts string contents for attributes but does not redact sensitive keys in spans, while an allowlisted `status` metric attribute retains the synthetic value. This evidence covers only the exercised adapter methods and fallback.

## Source identity

| File | SHA-256 |
| --- | --- |
| `packages/observability/src/otel.ts` | `0811b07301a1d7b2a8d72bb972c51b2d3c6bb749ba873ad61ea50f27e7bcb1d6` |
| `packages/observability/src/telemetry.ts` | `e127f27bd16104353d799e2c8286fa6c464bcd85582ca89be4e5f54eab620b5b` |
| `packages/observability/src/redaction.ts` | `50ea69a2a83fce8d131bc3cb83419e38da74d392656aade20c496bbac073a24f` |

The check did not modify product source, existing tests, SPEC 0163, or any external system. It does not prove exposure through a real exporter or composition outside the fake SDK boundary. F03 remains open; code remediation requires independent review and explicit T3 approval of the current SPEC 0163 hash.
