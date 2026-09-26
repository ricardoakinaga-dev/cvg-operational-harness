# legacy/

Everything in this directory belongs to the **legacy program Esmeralda V2**
(`cvg-agent-secretary-v2`), the veterinary-hospital secretary from which the
CVG Operational Harness was extracted. It is not part of the harness product.

- Inventory and classification: [`LEGACY_INVENTORY.md`](LEGACY_INVENTORY.md).
- Plan: front FL (PR-L01 to PR-L12) in
  [`docs/03_build/0356_production_backlog_2026-09-26.md`](../docs/03_build/0356_production_backlog_2026-09-26.md).
- Boundary rule (SPEC-LEGACY-001, enforced by
  `tests/architecture/legacy-boundary.test.ts`): legacy code may depend on the
  harness; `packages/` never imports legacy code, and `apps/` does so only from
  declared composition points.
- Layout: `packages/` for isolated legacy code (`@cvg/legacy-*`), `docs/` for
  the legacy product documentation, `secretary-product/` for the original
  provenance note.
- Isolated code is deleted once the neutral reference flow (PR-L07) replaces
  it and decision DL-05 authorizes removal (PR-L11).
