# Pedido de decisão humana — M07-S1-R1-C1I

**Estado:** `WAITING_HUMAN_APPROVAL`
**M07-S1:** `FAIL / OPEN`
**Produção:** `NO_GO`

## Decisão solicitada

C1H foi aprovado e parou no candidate freeze (exit 64) porque dois hashes documentais do baseline R1 estavam desatualizados. A tentativa C1H e o baseline R1 foram preservados. C1I propõe uma cópia nova do baseline e um replay local em diretório próprio.

A task `A24-03-C1I-GATE` está registrada em `docs/03_build/0344_reaudit_m07_backlog.md`. Aprove ou peça correções para os bytes exatos deste pedido. Para aprovar, responda **“Aprovo exatamente o gate M07-S1-R1-C1I”** em resposta ao pedido que apresenta o SHA-256 completo deste arquivo. A aprovação não se transfere da decisão C1H.

## Baseline reconciliado proposto

- Baseline R1 original: `docs/04_audit/evidence/AUD-20260923/M07-SPEC/candidate-baseline.json`, SHA-256 `40b33ca1f63a2c263abcd621cb25d6c6fdf6aae0d0ab05be36b108717357675a`; permanece byte-idêntico.
- Baseline C1I proposto: `candidate-baseline.json`, SHA-256 `ea28a36f156bda03fa6da930443feea21a873fd451775d86f43150bc15c8d67d`; fingerprint `6744024cd8bcdf45be4149c30438f0582ea1f44b884471570bde88f8eaa577c9`.
- A cópia contém 973 inputs. Os únicos tuples diferentes do R1 são `docs/02_spec/0190_spec_validation.md` (4264 → 5539 bytes) e `docs/07_agents/AGENTS.md` (4958 → 5246 bytes); hashes anterior/atual, recálculo e comparação ficam em `baseline-refresh-report.json`.

## Escopo autorizado se aprovado

Somente estes três paths de produto podem mudar, exatamente como em `correction-preview.patch` (SHA-256 `186854bfbccba9238cc501f11bc19e5fac9e8227d1fe13afed69726951733f5f`):

- `config/workspace-dependency-policy.json`
- `scripts/workspace-dependency-audit.mjs`
- `tests/workspace-dependency-audit.test.js`

O fixture `packages/conversation/src/__tests__/postgres-store.unit.test.ts` é apenas snapshot e deverá permanecer byte-idêntico. O patch vincula o path/hash exato do baseline C1I, o npm-version C1I e o output C1I, mantendo controles de traversal e symlink. Os quatro additions esperados do candidate são os mesmos quatro paths R1 já aprovados.

O único archive permitido é mover o `.gauntlet/` C1H, se seu estado `FINISHED / STOP / FAIL`, binding de arquivos, lock livre e destino ausente forem confirmados, para `.gauntlet-archive/m07-s1-c1h-20260924-finished-fail/`. O plano verifica os sete arquivos após a movimentação antes de inicializar o `.gauntlet/` C1I. Evidências novas ficam somente em `docs/04_audit/evidence/AUD-20260924/M07-S1-C1I/`.

## Plano congelado e critérios

O `command-plan.json` tem 36 passos nomeados e um verificador final. O primeiro passo compara os hashes do pedido com cada input imutável e exige uma decisão aprovada vinculada ao SHA deste pedido. Cada comando é invocado individualmente pelo `capture_command.py` e registra argv, UTC start/end, duração, exit imediato, stdout/stderr, tamanhos, SHA-256 e efeitos declarados. O plano exige Node `v22.23.2`, TypeScript local `6.0.3`, npm `10.9.8`, npm offline e remoção das variáveis PostgreSQL listadas. Qualquer precondição ou exit inesperado interrompe as etapas dependentes; retries são zero.

Se aprovado, o plano aplicará o patch, congelará e verificará um candidate, rodará inventory, testes focados e suite completa, typecheck, lint, coverage, post-check, sanitização e verificação de hashes históricos. O candidate esperado tem 977 inputs e quatro additions. A barra mantém statements ≥90%, branches ≥85%, functions ≥90% e lines ≥90%, além de inventory bound ao mesmo fingerprint e limites de segurança. I1 e Final Critic são revisões distintas e obrigatórias; indisponibilidade de qualquer uma mantém M07-S1 `FAIL / OPEN`.

## Limites

A aprovação não aceita M07-S1, não autoriza M07-S2/S3/S4 ou M05, não abre G21-5/G21-6, não permite dados reais, serviço, banco, rede externa ou ação sensível, e não libera produção. Candidate, checks e reviewers não começam antes da aprovação.

## Hashes dos arquivos congelados

Estes hashes identificam os inputs C1I. `command-records.json`, `decision-record.json` e `evidence-index.json` estão em estado inicial e só podem mudar conforme a decisão e a execução autorizada. O SHA-256 completo do próprio `approval-request.md` será informado junto à pergunta de decisão.

| Arquivo | SHA-256 | Bytes | Função |
| --- | --- | ---: | --- |
| `correction-gate-proposal.md` | `de65feeaabe1fad4c8cf08ba0773273c07e4f367e91c377767750c6372a0bb2d` | 4058 | Gate scope and stop rules |
| `correction-preview.md` | `c39a9f2b8d75373a318d3f98c12025ef01376a91d564b22902d5291647e586e3` | 1065 | Human-readable patch summary |
| `correction-preview.patch` | `186854bfbccba9238cc501f11bc19e5fac9e8227d1fe13afed69726951733f5f` | 8398 | Exact proposed product patch; not applied |
| `candidate-baseline.json` | `ea28a36f156bda03fa6da930443feea21a873fd451775d86f43150bc15c8d67d` | 553618 | Proposed refreshed baseline, exactly 973 inputs |
| `baseline-refresh-report.json` | `12a9b404cbb92776bf67f4462b3f151c5543908119d5f4cf05fe5052fa6f9787` | 1737 | Two current input tuples and recomputed fingerprint |
| `source-baseline.json` | `22109ca9f3f616eabf1452490ea7c0b888f0bfc140591250ea9bb805ffa0a542` | 2728 | Eleven frozen source byte hashes/sizes |
| `prior-gauntlet-binding.json` | `606b95e5dd7d7d4e3c630d12f56e60d6ddd9294ffc11866a0d13e75141997187` | 2063 | Exact C1H finished state and post-archive preservation binding |
| `capture_command.py` | `8cea1b08df3caf77c92ca3cb6a26161ca676425ced124e081a4a58a9cc3347f0` | 9336 | C1I recorder; it verifies approval and packet hashes before the first planned command |
| `command-plan.json` | `d92be241bcfc465fbde19f24db517191ae168a0be75dc65d7bbcc356a19fbea3` | 26137 | 36 exact setup/check steps plus final verifier |
| `command-records.json` | `1f798b604d39076ad08bfbc41ab182706b06fdf5b13346a6d6dd4ef3c98a8906` | 106 | Initial NOT_STARTED ledger; mutable only after approval |
| `quality-bar.json` | `da98cc9dd89521d7aa53bb54740a1c47b3dc0f7a09bf44320f1f22a1e34045ad` | 14854 | Ten required acceptance criteria |
| `gauntlet-goal.txt` | `49c3a40a9923b07368ea555fe9d881ec4384645b5030757df527bde507a9ea49` | 448 | Exact C1I goal and safety boundaries |
| `gauntlet-budget.json` | `e7b3a6d34299cea526f70914c1222722a7e140d18d2b9c81dcf35d91967908c4` | 203 | Frozen bounded retry/reviewer envelope |
| `gauntlet-capabilities.json` | `5513a6c3742c575e5235808ec4f6fb41ddae6b8d19a394640e071d2c317e51f9` | 344 | Independent review requirement |
| `historical-evidence-manifest.json` | `91fabc719876509d5e4c6b22144c81330cde4c7a3ed6051c1db8cc2ff255ccc4` | 49010 | 210 preserved R1/C1E/C1F/C1G/C1H evidence files |
| `historical-evidence.sha256` | `0ea2b7c4544d153bd726838ca425913ecc8b6ddf34de8d063dbdb4489f18597d` | 30184 | SHA-256 list for those immutable evidence files |
| `packet-validation.json` | `3356e714be8abdce77cc02c86ee18dd60332cb7c1f2b74d229df7cabdf2891e9` | 2897 | Static packet checks only |
| `evidence-index.json` | `cf7dbdb249e35a101f753e61c0a57a4c8337fdc406a584da6caf29ac84f8bca5` | 1862 | Initial WAITING_HUMAN_APPROVAL index; mutable after gate |
| `decision-record.json` | `efd2b8924a323bb5532eb1be8f47cad8c86d59e3e3bedfb69515b92733dd4865` | 336 | Initial WAITING_HUMAN_APPROVAL decision; mutable to bind approval |
