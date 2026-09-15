# AAA-21 incident scenarios

| Incident | Detection | Containment | Do not do |
| --- | --- | --- | --- |
| Duplicate submission | Same tenant/key with a different request hash | Return conflict and preserve the first row | Create a second execution |
| Cross-tenant lookup | Tenant-scoped `GET` returns not-found | Preserve tenant context and review auth trace | Reveal whether another tenant’s ID exists |
| Lease stolen or stale worker resumes | Lease/fencing error or recovery event | Stop stale worker; let the current owner/recovery path proceed | Force a terminal result from the stale owner |
| Database unavailable | Readiness/connection error | Keep worker controlled/unavailable; retry infrastructure safely | Fall back to memory and claim durability |
| Approval bypass attempt | State transition from paused state without authorized resolver | Reject transition and audit the attempt | Execute the pending effect |
| Uncertain effect | Effect journal `UNCERTAIN` or `unknown_effect` failure | Quarantine for explicit reconciliation | Silent retry or manual success mutation |
| Terminal resurrection | Invalid transition error | Preserve terminal record and open review | Requeue the terminal record |
| Audit/telemetry sink failure | Missing causal event or append error | Fail closed according to the owning sink policy; retain execution evidence | Claim complete observability |

No incident path authorizes a real appointment, clinical, financial, channel,
or record action.
