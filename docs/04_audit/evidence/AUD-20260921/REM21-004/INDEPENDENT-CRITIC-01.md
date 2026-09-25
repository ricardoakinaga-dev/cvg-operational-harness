# REM21-004 — Independent critic 01

- reviewer: `Mill` (`01a0c521-67c5-7432-bf26-6fee930ea9a6`)
- context: fresh read-only worktree inspection
- disposition: `PARTIAL / SUPERSEDED_BY_FIX_ROUND`
- I1: not claimed

## Verdict received

The reviewer confirmed the main path, manual redirects, public HTTP rejection,
hostname/SNI preservation and fail-closed DNS behavior, but did not approve the
task. The blocking finding was that a native `lookup` hook without
`agent: false` did not prove that a reused keep-alive socket belonged to the
address validated for the current hop. A second finding required HTTP loopback
opt-in to reject a DNS answer that was public even when the configured hostname
looked local. Node 22 execution and final evidence were also still pending in
that review.

## Response

The subsequent fix round adds `agent: false` to both Node transports, introduces
`allowLoopbackOnly` into the shared guard, applies it to loopback HTTP, adds
model-provider coverage, and reruns the declared Node 22 gates. This report is
preserved as the original independent critique; it is not treated as a final
approval.
