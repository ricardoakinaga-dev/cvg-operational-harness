# AUD-0576 — auditoria independente de nota por item — 26/09/2026

Escopo: leitura dos 3.559 arquivos de [`docs/`](../README.md) (54 MB) mais
inspeção de código, testes e CI. Verificações executadas durante a auditoria:
`npx prettier --check .`, `npm run typecheck`, `npm run lint`,
`node scripts/check-doc-links.mjs README.md docs`,
`node scripts/check-evidence-hygiene.mjs` (todos exit 0) e
`node scripts/phase10-verify.mjs` (**5 falhas**). Nada foi modificado pela
auditoria além deste registro, do [roadmap 0352](../03_build/0352_score_roadmap_2026-09-26.md)
e do [backlog 0353](../03_build/0353_score_backlog_2026-09-26.md).

Esta auditoria é documental e de planejamento. Ela não autoriza build,
rollout, uso de dados reais nem alteração de comportamento de produto;
produção permanece `NO_GO` e a autoridade dos gates M07-S1 não é alterada.

## Notas por item

### A. Documentação (`docs/`)

| #   | Item                                          | Nota | Evidência                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Estrutura e organização                       |   62 | Pipeline `00→10` nomeado e navegável, mas corpus fragmentado em 5 pipelines paralelos (`00..10`, `platform/00..08`, `phase2..4a`, `harness-audit`, `refoundation`) sem índice comum; 84% dos arquivos são só `04_audit/evidence/`                                                                                                                |
| 2   | Ledgers operacionais                          |   65 | `99_runtime_state`/`20_master_execution_log`/`30_backlog_master` são append-only reais com formato uniforme (24/22/16 commits), mas o mesmo evento é escrito **5×** com redações divergentes — origem de contradições                                                                                                                            |
| 3   | Pipeline DISCOVERY→PRD→SPEC→BUILD→AUDIT       |   55 | Formalmente seguido com decision-records e SHA-256; porém BUILD contornado por instrução blanket com SPECs em `DRAFT`/revisão `NOT_RUN` (registrado em [`0190`](../02_spec/0190_spec_validation.md)), e M07-S1 preso em **11 tentativas de gate** sem fechar                                                                                     |
| 4   | Docs mestres (Discovery/PRD/SPEC originais)   |   40 | `0001_analise_da_dor` 40 linhas, `0020_prd_master` 61 linhas com requisitos em uma frase; validações `0090` são checklists auto-atestados sem evidência por item                                                                                                                                                                                 |
| 5   | Profundidade técnica (ondas M07/AAA/platform) |   78 | Substância real: SPECs de 31–38 KB, inventário M07 com AST de 813 arquivos, `platform/` com PRD 96 KB + SPEC 112 KB, 8 ADRs de arquitetura + 10 de fase 2 + 8 de phase10                                                                                                                                                                         |
| 6   | Evidência de auditoria                        |   75 | 2.889 artefatos com command-records, decision-records e hashes verificáveis; ledger C1J em `INTEGRITY_PASS`. Contra: 231 arquivos vazios (todos catalogados), cadeia C1F→C1L sem fechamento                                                                                                                                                      |
| 7   | Consistência entre documentos                 |   55 | Contradições concretas: [`0351`](../03_build/0351_audit0573_backlog.md) marca RA25-01/02/03/06/08/09/10 como `PROPOSED` enquanto [`0574`](0574_aud0573_execution_evidence_2026-09-25.md) diz `COMPLETED`; dois "backlog master" concorrentes (`0302` vs `30_`); `README:96` aponta para ciclo já histórico; numeração duplicada `0311/0312/0313` |
| 8   | Higiene técnica                               |   88 | `check-doc-links` exit 0 (0 links quebrados), `check-evidence-hygiene` exit 0 (231/231 catalogados), prettier OK, 0 duplicatas md5. Contra: 53/571 refs em code-span não resolvem (classe invisível ao checker), incluindo a pasta `BRIEFING/` citada como fonte-de-verdade e inexistente                                                        |

**Média docs: 65/100**

### B. Código implementado

| #   | Item                                        | Nota | Evidência                                                                                                                                                                                                                                                                                        |
| --- | ------------------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 9   | Volume e substância                         |   82 | 83.368 linhas de produção + 92.925 de teste em 276+290 arquivos; **0 `TODO`/`FIXME`/`not implemented`** em 176k linhas de TS; complexidade real (approval-engine 1.338 linhas, iterative-runtime 1.488)                                                                                          |
| 10  | `apps/api`                                  |   75 | 58 rotas reais incluindo webhook com HMAC sobre raw body, ciclo de jornada completo e ciclo de vida de agentes (publish/rollback). Contra: `server.ts` com **5.857 linhas / 74 handlers** (59% da API num arquivo)                                                                               |
| 11  | `apps/worker`                               |   74 | Claim com lease, heartbeat, requeue, dead-letter, 4 runtimes componíveis; `kernel-composition.ts` 532 linhas. Contra: com o `.env.example` default o worker **não sobe nenhum modo**                                                                                                             |
| 12  | `apps/web`                                  |   72 | 7 painéis funcionais + cliente HTTP de 1.581 linhas com ~35 chamadas. Contra: inteiramente **fora do denominador de cobertura**; `PlatformPanel` 1.739 linhas num arquivo                                                                                                                        |
| 13  | Persistência                                |   80 | 27 migrations SQL, ~50 tabelas, RLS multi-tenant com inventário canônico + preflight + teste closed-world. Contra: **Drizzle é fachada** — `drizzle-orm` declarado e nunca importado, `schema.ts` sem uma única `pgTable`, `drizzle.config.ts` órfão                                             |
| 14  | Model gateway / policy / approval           |   74 | Gateway com circuit breaker, budget USD, retry, prompt registry SHA-256, guard SSRF com pinning DNS; policy-engine deny-by-default sem LLM. Contra: providers OpenAI/Ollama **só instanciados em testes** — produção usa `DeterministicModelProvider`                                            |
| 15  | Integrações plugadas (canal/RAG/pagamentos) |   35 | Adapters WhatsApp (Evolution/Chatwoot) implementados mas **nunca instanciados fora de testes**; RAG sem import em runtime; `ENABLE_REAL_*` declaradas sem consumidor de runtime (defeito reconhecido pela própria auditoria [`0556`](0556_project_audit_2026-09-11.md)); pagamentos inexistentes |
| 16  | Arquitetura de pacotes                      |   58 | Bons limites em approval/policy/persistence. Contra: `@cvg/conversation` (**7.917 linhas, 0 importadores**), `memory` (13 linhas), `workflows`/`tools` órfãos; `ssrf-node.ts` duplicado (158/178 linhas iguais); 0 READMEs em 25 workspaces                                                      |
| 17  | Guardas fail-closed                         |   85 | Verificado em código: `parseEnv` aborta o boot em 7 condições (placeholder key, RLS off, origins vazio, etc.); webhook com verificação de assinatura; feature-flags de dado real fixadas `false`                                                                                                 |

**Média código: 72/100**

### C. Testes, CI e certificação

| #   | Item                        | Nota | Evidência                                                                                                                                                                                                                                                      |
| --- | --------------------------- | ---: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 18  | Testes unitários            |   88 | 324 arquivos / **2.295 testes / 801 suites, 0 falhas** no run certificado; razão teste:código = 1,11; subconjunto re-executado na auditoria passou                                                                                                             |
| 19  | Integração PostgreSQL       |   85 | 32 arquivos `*postgres*` + 16 integração, suíte dedicada, 258 testes, `postgres:16` como service container no CI. Contra: só rodam com `TEST_DATABASE_URL` (39 skips condicionais, inventariados)                                                              |
| 20  | E2E (Playwright)            |   70 | 6 specs ativos + 1 qualificação, 12 testes, snapshots visuais, webServer duplo. Contra: superfície pequena (12 asserções para 58 rotas) e `playwright-results.xml` defasado (22/09 vs certificação 26/09)                                                      |
| 21  | Cobertura                   |   72 | 92,61 / 87,71 / 95,00 / 93,59 com thresholds 90/85/90/90 + 95/arquivo crítico + mutation guard 10/10. Contra: **exclui `apps/web/**`e todos os adaptadores Postgres**; artefato`coverage/coverage-summary.json` **ausente agora**                              |
| 22  | Formato/typecheck/lint      |   95 | Executados nesta auditoria: `prettier --check .` exit 0, `tsc --noEmit` exit 0, `eslint .` exit 0                                                                                                                                                              |
| 23  | CI/CD (GitHub Actions)      |   90 | `verify.yml` com **34 gates numerados e versionados** (`rem21-014-v1`), artefatos por sha256+runId+candidateId, actions pinnadas por SHA, `permissions: contents: read`                                                                                        |
| 24  | Segurança supply-chain      |   88 | Gitleaks + CodeQL + `npm audit` high + licenses + SBOM CycloneDX, com cron semanal                                                                                                                                                                             |
| 25  | Certificação (estado atual) |   40 | Dossiê denso (16 gates PASS, decision `CONDITIONAL_GO`), mas **`phase10-verify` retorna 5 falhas agora**: `CANDIDATE_DRIFT` (worktree sujo) + 3 falhas por `coverage/coverage-summary.json` perdido. Evidência do coverage **não reproduzível neste instante** |

**Média qualidade/CI: 79/100**

### D. Processo e governança

| #   | Item                            | Nota | Evidência                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------- | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 26  | Aderência às próprias regras    |   50 | Gates com aprovação por SHA são reais, mas BUILD executado sob instrução blanket com SPEC em draft (declarado, não oculto); packet **C1M incompleto** (3 arquivos, sem approval-request/decision-record) é o bloqueio declarado de toda a cadeia                                                                          |
| 27  | Honestidade do estado declarado |   90 | `NO_GO` consistente em 235 arquivos/680 ocorrências; auditorias publicam notas baixas contra si mesmas ([`0572`](0572_repository_score_assessment_2026-09-24.md): 28/100 de prontidão); `99_operational_index` avisa que não autoriza nada; nenhum doc afirma produção liberada                                           |
| 28  | Burocracia × valor              |   35 | 11 tentativas de gate, 14 command-records e 10 final-gate-results sem fechar M07-S1; C1J passou **2.137 testes e cobertura** e morreu por `agent thread limit reached` (56 ocorrências) com política que **proíbe retry/substituto**; a própria edição de documentação quebra a baseline do gate (`baseline input drift`) |

**Média processo: 58/100**

## Nota global: 69 / 100

Média simples das 4 seções: docs 65, código 72, qualidade/CI 79, processo 58.

**Leitura:** engenharia e infraestrutura de verificação são sólidas e
raramente vistas em repos deste porte (34 gates de CI, mutation guard, RLS
multi-tenant, 0 TODO em 176k linhas). O que derruba a nota é: (1) o processo
documental virou fim em si mesmo — 84% do `docs/` é evidência e o gate de
BUILD tem circularidade estrutural que o impede de fechar; (2) integrações de
canal/RAG existem só como biblioteca, nunca plugadas; (3) a certificação está
**reprovada neste instante** (drift + artefato de cobertura perdido); (4)
produção segue `NO_GO` por design — correto, mas significa que o sistema
ainda não foi validado fora do ambiente controlado.

## Achados materiais

1. **Circularidade gate × documentação.** O candidate freeze congela o
   repositório inteiro, então editar `0190_spec_validation.md` ou os ledgers
   invalida a baseline do próprio gate: C1L morreu por `baseline input drift`
   e deixou um preview aplicado em 3 paths **sem validação de teste** no
   worktree daquele run.
2. **C1J passou toda a matriz local e falhou por infraestrutura.** 36/36
   passos, 2.137 testes, 0 falha, cobertura acima do threshold — recusa de
   I1 e Final Critic com `agent thread limit reached`, causa presente em 33
   arquivos / 56 ocorrências, com stop rule que proíbe retry e substituto.
3. **O packet C1M, que bloqueia tudo, está incompleto.** Três arquivos, sem
   `approval-request.md`, `decision-record` nem `final-gate-result`, e ainda
   assim mantém `RA25-05 BLOCKED_BY_C1M` e as cadeias M07/M05 paradas.
4. **Certificação reprovada no momento da auditoria.** `phase10-verify`
   exit 1 com 5 falhas: worktree sujo (`postgres.ts` modificado e
   `postgres-audit.ts` não rastreado) e `coverage/coverage-summary.json`
   ausente, com 116 shards órfãos em `coverage/.tmp/`.
5. **Contradição de status entre registros correntes.**
   [`0351`](../03_build/0351_audit0573_backlog.md) e
   [`0574`](0574_aud0573_execution_evidence_2026-09-25.md) divergem sobre 7
   itens RA25; `0302_backlog_master.md` e `30_backlog_master.md` coexistem
   como "backlog master".

## Próxima etapa

Executar a remediação pelo [roadmap 0352](../03_build/0352_score_roadmap_2026-09-26.md)
e registrar as tasks no [backlog 0353](../03_build/0353_score_backlog_2026-09-26.md).
Nenhuma task de código começa sem SPEC e gate de BUILD próprios; as decisões
humanas estão marcadas como `WAITING_HUMAN_APPROVAL`.
