# Errata — sweep-callsite manifest timestamp

- Ref: `docs/04_audit/evidence/AAA/AAA-07/sweep-callsite/manifest.json` (`observedAt`).
- Issue (found by round-2 independent critic): the original value `2026-09-13T00:41:00+00:00` used local wall-clock time with a `+00:00` offset. The raw logs of the same package start at 00:34–00:40 local, i.e. `2026-09-13T03:34:00Z…03:40:00Z`.
- Correction: for ordering purposes the effective UTC observation window is `2026-09-13T03:34:00Z` to `2026-09-13T03:41:00Z`. The package content, hashes and conclusions are unchanged.
- The original manifest is preserved byte-for-byte (no rewrite). This errata does not modify, upgrade or invalidate any claim of the package; it only corrects the timestamp interpretation.
- All subsequent P1 remediation packages use UTC `Z` timestamps only.
