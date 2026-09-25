# Pedido de decisão humana — M07-S1-R1-C1J

**Estado:** `WAITING_HUMAN_APPROVAL`<br>
**M07-S1:** `FAIL / OPEN`<br>
**Produção:** `NO_GO`

## Decisão solicitada

C1I foi aprovada para seu próprio escopo e terminou em `candidate-freeze` com exit 64 porque `validateExecutionCandidate` ainda referencia `C1H_NPM_VERSION_FILE`. Nenhum candidate C1I foi criado e os checks downstream não rodaram. C1J prepara uma correção nova, limitada e hash-bound, em diretório de evidência próprio. A tentativa e o Gauntlet C1I serão preservados.

A mensagem “aprovo este gate” recebida antes da apresentação deste pedido não está associada ao gate C1J. A decisão anterior foi registrada somente para C1I. Aprove ou solicite correções para os bytes exatos deste pedido. Para aprovar, responda **“Aprovo M07-S1-R1-C1J”** à pergunta que inclui o SHA-256 integral deste arquivo.

## Baseline reconciliado proposto

- Baseline R1 histórico: `docs/04_audit/evidence/AUD-20260923/M07-SPEC/candidate-baseline.json`, SHA-256 `40b33ca1f63a2c263abcd621cb25d6c6fdf6aae0d0ab05be36b108717357675a`; permanece byte-idêntico.
- Baseline C1J proposto: `candidate-baseline.json`, SHA-256 `ea28a36f156bda03fa6da930443feea21a873fd451775d86f43150bc15c8d67d`; cópia byte-idêntica do baseline C1I reconciliado com 973 inputs. Os únicos dois tuples diferentes de R1 são `docs/02_spec/0190_spec_validation.md` e `docs/07_agents/AGENTS.md`; fingerprint recalculado `6744024cd8bcdf45be4149c30438f0582ea1f44b884471570bde88f8eaa577c9`.
- Candidato esperado após patch: 977 inputs e exatamente os quatro additions R1 aprovados. O estado corrente não contém candidate C1J.

## Escopo autorizado se aprovado

Somente estes três paths de produto podem mudar, exatamente como em `correction-preview.patch` (SHA-256 `c8c12e5de9286317159f17fa5c32422131b564a7ac3487066f075db723b457f4`):

- `config/workspace-dependency-policy.json`
- `scripts/workspace-dependency-audit.mjs`
- `tests/workspace-dependency-audit.test.js`

O patch troca o binding C1I para baseline/npm C1J, corrige a referência residual `C1H_NPM_VERSION_FILE` para `C1J_NPM_VERSION_FILE`, e permite o diretório de output C1J mantendo compatibilidade histórica C1I. O fixture `packages/conversation/src/__tests__/postgres-store.unit.test.ts` é snapshot-only e deve permanecer byte-idêntico. Não há alteração de política clínica, financeira, dados, provider ou produção.

## Plano congelado e critérios

`command-plan.json` contém 36 passos capturados individualmente, mais o verificador final. O primeiro passo valida os 19 hashes da tabela abaixo, a decisão hash-bound e os registros ainda não iniciados. O plano exige Node `v22.23.2`, TypeScript local `6.0.3`, npm `10.9.8`, `npm_config_offline=true` e remoção das variáveis PostgreSQL listadas no plano. Cada comando registra argv, timestamps UTC, duração, exit code, stdout/stderr e seus hashes; retries são zero e uma falha interrompe os passos dependentes.

O plano verifica o Gauntlet C1I como `FINISHED / STOP / FAIL`, lock e destino livres, arquiva o `.gauntlet/` somente para `.gauntlet-archive/m07-s1-c1i-20260924-finished-fail/`, verifica os oito arquivos pelo hash e só então inicializa C1J. Depois captura snapshots dos quatro arquivos previstos, aplica somente o patch de três paths, verifica os deltas e tenta congelar o candidate.

Se o freeze e a verificação passarem, roda inventory e comparação semântica, testes focados e suite completa, typecheck, lint, coverage, pós-check, sanitização de logs e integridade histórica. A barra de dez critérios mantém statements ≥90%, branches ≥85%, functions ≥90% e lines ≥90%. I1 e Final Critic são revisões separadas e obrigatórias sobre o mesmo candidate congelado. Falha, drift, critério crítico não atendido ou review obrigatório indisponível mantém M07-S1 `FAIL / OPEN`; não haverá retry C1J sob este gate.

## Limites

A aprovação não aceita M07-S1, não autoriza M07-S2/S3/S4 ou M05, não reabre G21-5/G21-6, não permite dados reais, serviço, banco, rede externa, ação sensível ou produção. O escopo de produto fica nos três paths acima; os demais efeitos locais previstos são o archive de C1I, o novo `.gauntlet/` e os artefatos no diretório C1J. Nenhum patch ou comando C1J foi iniciado.

## Arquivos congelados do packet

Os hashes abaixo identificam os 19 arquivos do packet. `decision-record.json`, `command-records.json` e `evidence-index.json` são ledgers mutáveis: permanecem em `WAITING_HUMAN_APPROVAL`/`NOT_STARTED` e só mudam para registrar a decisão ou execução deste C1J. O próprio `approval-request.md` é identificado pelo SHA-256 apresentado junto à pergunta de decisão.

| Arquivo | SHA-256 | Bytes |
| --- | --- | ---: |
| `correction-gate-proposal.md` | `db2f03f88e88d295ebedc86dc7e959e10d0ec76f926382a6c1a50dc73aee72b2` | 2431 |
| `correction-preview.md` | `5cf5110082f34b0281e6f732a7b1dccea8ac1f189d77ab89a689d8bd7bf400c5` | 529 |
| `correction-preview.patch` | `c8c12e5de9286317159f17fa5c32422131b564a7ac3487066f075db723b457f4` | 8873 |
| `candidate-baseline.json` | `ea28a36f156bda03fa6da930443feea21a873fd451775d86f43150bc15c8d67d` | 553618 |
| `baseline-refresh-report.json` | `6a8fbe0f9bc8d31310d3d32be2b72ea5c6ef8946c9a4cc639752a79332ea74d8` | 2028 |
| `source-baseline.json` | `a2dfbb5bf4aafe6c8f0e5f3bc546a6321d3a6bdce8ddde7aae891378947bacb3` | 2682 |
| `prior-gauntlet-binding.json` | `9dd00819787c61ff6d8aced2e781075207b8577889bbdce2ad9bb4daca99e06c` | 2367 |
| `capture_command.py` | `a799c95e4986505b3ebd70f6dc6d1f0121997aac582bfa3451c6cc653761f51a` | 9336 |
| `command-plan.json` | `81da4ddb7971ee7030983cd10e251f1adccd9a1fd7b742212d108fb4703c0fd9` | 26137 |
| `command-records.json` | `2a69166176999c272a5042edd890e1dec6543c87d7e4315c31471b271c0dbd9d` | 106 |
| `quality-bar.json` | `9493a61100ea547f74b6c06b848d5a47e51a84ae5dd692430524cc0ae458bee7` | 14731 |
| `gauntlet-goal.txt` | `df633e40c8ab2a8e6efed2a4870d30d069b9ccb8b9be67e57194be2a4a4d675b` | 501 |
| `gauntlet-budget.json` | `e7b3a6d34299cea526f70914c1222722a7e140d18d2b9c81dcf35d91967908c4` | 203 |
| `gauntlet-capabilities.json` | `0b52245c599f7bad17c7cb342abb1f13c989e8282206492d18b71aa776c07e6a` | 344 |
| `historical-evidence-manifest.json` | `b4cd6fbf2e296e3341c1588bab90d34d6178babc79b5cff333f58535be52e0e1` | 69182 |
| `historical-evidence.sha256` | `6abe0e9cd5cd6c7a4911c39933a9f4f4bfd9f162e14b12428cc2dcd9777ea0df` | 42605 |
| `packet-validation.json` | `322b037eff82e338cda3754b191201d3a41a3445e8be2560c0a67a64ead095fe` | 4023 |
| `evidence-index.json` | `fa5db1ac29a189cc875c4d0a4e36f2b4266e67d51090ed4e8954ac4cb8339d1a` | 275 |
| `decision-record.json` | `519a0c75ef30bb701601582098c56568e2b48e7799b937e827e68bb68822697b` | 337 |
