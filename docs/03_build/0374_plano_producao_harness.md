# 0374 — Plano para levar o Operational Harness a produção

- Data: 07/10/2026. Task: `FULLTEST-20261007` (Claude Code).
- Base: snapshot `31dc1c3` (main publicado), instância local `cvg-harness-local-20261006`
  (http://127.0.0.1:3410), bateria completa registrada em
  [`docs/04_audit/evidence/FULLTEST-20261007/summary.md`](../04_audit/evidence/FULLTEST-20261007/summary.md).
- Barra de referência: [0373](0373_barra_producao_harness.md) (dez condições no mesmo
  commit e na mesma imagem) e [ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md)
  (harness como infraestrutura; produtos consumidores isolados).

## 1. Onde estamos

O código do harness está maduro: todos os gates executáveis do repositório passam no
snapshot `31dc1c3` em worktree limpo, a imagem endurecida sobe em modo produção com
PostgreSQL real, papéis separados, login, webhook assinado, aprovação, pausa e alerta
(smoke 22/22), o backup restaurado mantém a cadeia de auditoria íntegra e detecta
adulteração, e o CI remoto Verify/Security está verde no `main` atual.

O que falta não é código: é **infraestrutura, proteção de repositório, decisões de
operação e o aceite formal do isolamento para consumidores**. A barra 0373 tem nove
condições cumpridas localmente e uma (condição 5) cumprida pela metade: CI verde sim,
proteção do `main` não.

| Condição 0373         | Estado em 07/10/2026                                                  |
| --------------------- | --------------------------------------------------------------------- |
| 1 conformidade dsh    | ✅ `tests/conformance` sem `it.fails`                                 |
| 2 suítes verdes       | ✅ 359/2.952 + PG 37/302, zero skips fora do catálogo (SKIP-PG-021)   |
| 3 pilha real produção | ✅ smoke 22/22 na imagem própria `fulltest-31dc1c3`                   |
| 4 operadores entram   | ✅ login 200 / protegida 200 / sem sessão 401 (smoke)                 |
| 5 CI + proteção       | ⏳ Verify/Security verdes em `31dc1c3`; `main` **sem proteção** (404) |
| 6 segredos/deps       | ✅ gitleaks 0 na imagem; `npm audit` 0; ⚠ 1 HIGH sem correção na base |
| 7 imagem endurecida   | ✅ distroless, uid 10001, read-only, cap-drop ALL                     |
| 8 backup testado      | ✅ restore com cadeia íntegra e adulteração detectada                 |
| 9 alerta              | ✅ `worker_down` e `queue_stalled` assinados recebidos                |
| 10 botão de desligar  | ✅ pausa retém pendências e retomada drena                            |

## 2. Achados desta rodada (nenhum bloqueia código; todos entram no plano)

| Id   | Sev | Achado                                                                                                                                                                                                  | Encaminhamento                 |
| ---- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| F-01 | P1  | `main` sem branch protection nem rulesets; qualquer push entra sem checks obrigatórios                                                                                                                  | Fase A, item A1                |
| F-02 | P2  | `CVE-2026-84782` HIGH em `libssl3` do `distroless/cc-debian12`, sem versão corrigida publicada                                                                                                          | Fase A, item A4 (aceite + SLA) |
| F-03 | P3  | `scripts/restore-audit-chain-proof.ts` espera `pg_isready`; o contêiner oficial reinicia após init e a prova falha com "Connection terminated" (2/2 nesta máquina); passa com espera por consulta real  | Fase B, item B4                |
| F-04 | P3  | `npm run test:e2e` em clone limpo falha 10/12 porque o dev server do Vite não resolve `@cvg/*` sem `packages/*/dist`; passa 12/12 após `tsc -b`                                                         | Fase B, item B4                |
| F-05 | P3  | `verify:phase2`/`verify:phase3`/`test:phase4a` exigem `TEST_DATABASE_URL` e `PHASE4A_DISPOSABLE_PG=1`, não documentados no runbook de gates                                                             | Fase B, item B4                |
| F-06 | P3  | `boundary:products` leva ~22 min e termina `INCOMPLETE` (0 violações, 8.856 dependências instaladas não verificadas ao percorrer `node_modules`); fail-closed correto, mas inviável como gate de rotina | Fase B, itens B1 e B4          |
| F-07 | P3  | `npm audit` cobre dependências, mas a imagem não tem varredura de SO no CI (Trivy só foi rodado manualmente)                                                                                            | Fase A, item A4                |
| Obs  | —   | 150 requisições sem sessão em `/v1/tasks` retornaram 401 sem 429: rate limit não é acionado por tráfego anônimo no perfil memory                                                                        | Confirmar política na Fase C   |

## 3. Plano em quatro fases

Ordem pensada para custo crescente e dependência real. Cada fase termina com uma
reauditoria independente (Codex) sobre o mesmo SHA/digest e registro nos ledgers.

### Fase A — Fechar a condição 5 e as decisões pendentes (1 dia, sem código)

| Item | Ação                                                                                                                                                                   | Dono             | Aceite                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| A1   | Ativar proteção do `main`: checks obrigatórios `REM21 CI bar (Node 22)`, `codeql`, `secret-scan`, `supply-chain`; sem push direto; sem force-push; revisão obrigatória | usuário + Claude | `gh api .../branches/main/protection` 200 com os quatro contextos                        |
| A2   | Decidir a política do scan semanal de segredos: 6.548 achados são evidências históricas sintéticas em `docs/04_audit/evidence`; 9 fora dela são fixtures sintéticas    | usuário          | Allowlist por caminho registrada em `.gitleaks.toml` ou decisão de manter triagem manual |
| A3   | Definir destino e limiares reais do alerta (`CVG_STOP_ALERT_*`) e quem recebe                                                                                          | operação         | Receptor real validado com assinatura HMAC                                               |
| A4   | Política de vulnerabilidades da imagem: adicionar Trivy ao workflow Security; aceitar F-02 com prazo e rebuild automático quando a base distroless publicar correção   | Claude           | Security falha em HIGH/CRITICAL com correção disponível                                  |
| A5   | Reauditoria A (Codex) confirma condição 5 completa                                                                                                                     | Codex            | Parecer com SHA e proteção verificada                                                    |

### Fase B — Isolamento aceito para camadas consumidoras (3 a 5 dias)

Esta fase é o que torna o harness "pronto para receber programas acima". Cartões já
existem em [0370](0370_harness_product_isolation_backlog.md); aqui está a ordem.

| Item | Ação                                                                                                                                                                              | Cartão   | Aceite                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| B1   | Fechar os dois caminhos de dependência proibida que a crítica T2 reproduziu; gate `boundary:products` com caso negativo conhecido                                                 | HISO-005 | Gate falha ao introduzir import harness→produto; passa no `main`       |
| B2   | Publicar a lista de exports suportados (`@cvg/contracts`, `@cvg/harness`, `@cvg/model-gateway`, adapters) e o contrato de composição `createOperationalHarness` para consumidores | HISO-009 | Documento + teste de regressão que importa só o suportado              |
| B3   | Exemplo mínimo de consumidor fora de `products/shift-assistant` (um agente hospitalar sintético, por exemplo recepção) compondo o harness só por exports públicos                 | HISO-009 | Exemplo compila, roda jornada sintética e passa pelo gate de fronteira |
| B4   | Runbook de gates reproduzível em clone limpo: `tsc -b` antes de E2E, variáveis de PG por gate, espera robusta na prova de restore, tempo do `boundary:products`                   | HISO-006 | Novo colaborador reproduz todos os gates com um comando documentado    |
| B5   | CI e barra por artefato: harness e produto certificados separadamente                                                                                                             | HISO-010 | Workflow do harness não executa testes do produto e vice-versa         |
| B6   | Reauditoria B (Codex) e aceite documental da independência                                                                                                                        | HISO-014 | ADR-010 atualizada para "isolamento aceito"                            |

### Fase C — Ambiente real (1 a 2 semanas, depende de decisão de hospedagem)

| Item | Ação                                                                                                                                                                     | Aceite                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| C1   | Escolher destino (VM própria, Kubernetes ou PaaS) e registrar manifesto em `deploy/`                                                                                     | Manifesto versionado; segredos fora do repositório                    |
| C2   | PostgreSQL gerenciado ou dedicado com os quatro papéis (`migration`, `runtime`, `auth owner`, `session`), RLS ligado, sem SUPERUSER/BYPASSRLS                            | `scripts/production-stack-smoke.ts` adaptado ao destino passa 22/22   |
| C3   | Job de migração separado (`scripts/migrate-job.mjs`) executado antes da API/worker; serving sem credencial DDL                                                           | API recusa `DATABASE_MIGRATION_URL`; catálogo confirma dono do schema |
| C4   | Segredos: `CVG_OPERATOR_IDENTITY_KEYRING`, `WEBHOOK_SIGNING_SECRET`, `CVG_RATE_LIMIT_KEYRING`, `CVG_STOP_ALERT_WEBHOOK_SECRET` gerados e armazenados no cofre do destino | Rotação documentada; nenhum segredo em imagem ou repositório          |
| C5   | HTTPS com proxy reverso, `API_REQUIRE_HTTPS=true`, `API_TRUSTED_PROXY_ADDRESSES` com endereços reais; sonda `/live` por loopback                                         | `curl` externo sem TLS recebe 426; com TLS 200                        |
| C6   | Backup agendado (`pg_dump --format=custom`) com âncoras das cabeças dos ledgers guardadas fora do banco; ensaio de restore mensal                                        | Primeiro restore real registrado com cadeia íntegra                   |
| C7   | Observabilidade: logs estruturados coletados, métricas `/health/metrics` raspadas, alerta de parada ligado ao receptor da Fase A                                         | Parada induzida do worker gera alerta no canal real                   |
| C8   | Identidade de operador: `CVG_IDENTITY_MODE=trusted` com emissor de token (IdP corporativo ou emissor interno assinado); simulação desligada                              | Login real de dois operadores com papéis distintos; 401 sem sessão    |
| C9   | Smoke no destino com a mesma imagem e o mesmo digest da certificação; registro em `docs/04_audit/evidence/`                                                              | Mesmo digest da imagem em CI e em produção                            |
| C10  | Reauditoria C (Codex): dez condições 0373 no mesmo SHA/digest, em ambiente real                                                                                          | Parecer `GO` do núcleo; produtos continuam com barra própria          |

### Fase D — Operação assistida e primeiro consumidor (contínuo)

| Item | Ação                                                                                                                           | Aceite                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| D1   | Duas semanas de operação do núcleo sem produto, só com tráfego sintético e os alertas reais ligados                            | Zero incidentes sem alerta; pausa/retomada exercitada uma vez     |
| D2   | Primeiro consumidor real escolhido (o Assistente de Plantão tem barra 0368 e decisões D1–D4 próprias) passa pela própria barra | Release do produto registrado separadamente do release do harness |
| D3   | Revisão trimestral: dependências (`npm audit`, Trivy), rotação de chaves, ensaio de restore                                    | Evidência datada em `docs/04_audit/evidence/`                     |

## 4. O que NÃO está neste plano

- Nenhuma mudança funcional no kernel: os achados F-03 a F-06 são de ferramental de teste.
- Nenhum dado real, provider de modelo real ou canal real até a Fase C9 concluída.
- Nenhum release de produto: a separação da ADR-010 continua valendo.

## 5. Critério de "pronto para receber camadas acima"

O harness pode ser consumido por uma camada nova quando B1, B2 e B4 estiverem aceitos
(Fase B parcial). Pode ser consumido **em produção** quando a Fase C fechar com parecer
`GO`. Entre esses dois pontos, consumidores podem ser desenvolvidos e testados em
ambiente sintético contra os exports públicos, aceitando que o contrato ainda pode mudar
com SPEC e gate T3.

## 6. Execução — rodada PLAN0374-A (07/10/2026)

| Item | Estado             | Evidência / nota                                                                                                                                                                                                                                                                                                                                                                |
| ---- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1   | DONE               | Proteção do `main` ativa: quatro checks obrigatórios, `enforce_admins`, sem force-push/exclusão, histórico linear ([prova](../04_audit/evidence/PLAN0374-A-20261007/raw/branch-protection-main.json)). Fluxo de publicação no [runbook 0803](../08_runtime/0803_runbook_gates_locais.md)                                                                                        |
| A2   | DECISÃO DO USUÁRIO | Triagem dos 105 achados do scan semanal concluída: todos sintéticos ([triagem](../04_audit/evidence/PLAN0374-A-20261007/raw/weekly-secret-scan-triage.json)). A ampliação dos allowlists em `.gitleaks.toml` foi bloqueada pela política de permissão da sessão como "enfraquecimento de segurança"; o texto proposto está na rodada e aguarda aplicação explícita pelo usuário |
| A3   | ABERTO             | Destino/limiares do alerta continuam decisão de operação                                                                                                                                                                                                                                                                                                                        |
| A4   | DONE_LOCAL         | Job `image-scan` em `security.yml` (Trivy v0.36.0 pinado): HIGH/CRITICAL com correção falham; sem correção só reportam. F-02 aceito até a base distroless publicar `libssl3` corrigido; prova no primeiro run do CI                                                                                                                                                             |
| B4   | PARCIAL            | F-03 corrigido em `scripts/restore-audit-chain-proof.ts` (3/3 PASS); F-04 mitigado com `npm run test:e2e:prepare`; F-05/F-06 documentados no runbook 0803. Falta: HISO-005 tornar `boundary:products` viável (com o Fable)                                                                                                                                                      |
