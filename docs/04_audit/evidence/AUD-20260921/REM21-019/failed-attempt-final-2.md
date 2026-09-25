# REM21-019 — INVALIDATED ATTEMPT

Run: `run-rem21-019-final-2`  
Candidate: `3fe3ee40fbff0ed9578209b1db4c69ec50f10bfbb00fedc321c3f216633feb2e`

The run was invalidated by the Gauntlet freeze rule after its E2E gate failed
five REM21-014 trusted-console tests. The browser screenshot showed the
controlled simulation inputs because `playwright.config.ts` started the web
server with `VITE_CVG_WEB_IDENTITY_MODE=simulation`, while the spec required a
trusted bootstrap and the text `Sessão confiável`.

No report or source was edited to force a pass. The correction separated the
trusted REM21-014 spec into its already-existing dedicated browser-proof
configuration by ignoring it in the general simulation E2E project. All gates
were rerun in `run-rem21-019-final-3`.

