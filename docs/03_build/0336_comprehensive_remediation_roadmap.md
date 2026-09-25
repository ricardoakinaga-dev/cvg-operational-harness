# Roadmap de remediação abrangente — AUD21

## Visão executiva

O roadmap converte a auditoria `0566` em sete ondas ordenadas por redução de
risco. As durações são faixas indicativas de esforço para um agente Codex, não
promessas de calendário. Cada onda termina em evidência verificável e atualiza
runtime state, execution log e backlog.

```text
W0 Planejamento e autoridade
  -> W1 Verdade e controle
    -> W2 Segurança e identidade
      -> W3 CI, supply chain e qualidade
        -> W4 Operação durável
          -> W5 UX, manutenibilidade e higiene
            -> W6 Freeze, crítica e decisão

W7 Externo/piloto permanece bloqueada por G21-5
```

## W0 — Planejamento e autoridade

- status: `COMPLETED_DOCUMENTATION_ONLY`;
- esforço: concluído em 21/09/2026;
- entregas: auditoria `0566`, plano `0335`, roadmap `0336`, backlog `0337`,
  prompt `0338` e atualização dos registros mestres;
- gate de saída: `G21-0`;
- gate de entrada: `G21-1` registrado pelo envio humano do prompt `0338`;
  W1 segue ativa no escopo local/sintético/descartável.

## W1 — Verdade e controle

- status corrente do rate limiter: `REM21-007 = VERIFIED_LOCAL /
FINAL_CERT_DEFERRED` após BUILD/AUDIT; a prova continua
  local/sintética/descartável;

- status corrente: `IN_PROGRESS / REM21-007` após verificação local de
  `REM21-005`, `REM21-006` e `REM21-004`;

- esforço indicativo: 2–4 dias úteis;
- tasks: `REM21-001`, `REM21-002`;
- achados: `A21-F01`, `A21-F11`, `A21-F20`, parte de `A21-F13/F22`;
- objetivos:
  - reconciliar `AUD20-008`, backlog, estado, logs e índices;
  - remover findings/scores manuais da decisão de certificação;
  - impedir tecnicamente promoção com P0/P1 corrente;
- marco: `M21-0`;
- gate de saída: `G21-2`;
- demonstração: duas fixtures idênticas, exceto por um P0, produzem
  respectivamente decisão elegível e `REJECT`.

## W2 — Segurança, identidade e worker

- status corrente da identidade web: `REM21-005 = VERIFIED_LOCAL /
FINAL_CERT_DEFERRED`; BUILD/AUDIT está em
  `docs/04_audit/evidence/AUD-20260921/REM21-005/BUILD-AUDIT.md`;
- decisão local: bootstrap trusted one-shot para sessão opaca server-side;
  IdP/durabilidade/cookie de produção permanecem G21-5.

- esforço indicativo: 2–3 semanas;
- tasks: `REM21-003`–`REM21-007`;
- achados: `A21-F02`–`F05`, `F09`, `F10`;
- objetivos:
  - autenticar tokens antes do claim distribuído de replay;
  - fechar DNS rebinding e HTTP com credencial;
  - compor identidade confiável no web;
  - corrigir preflight/readiness/health/drain do worker;
  - pseudonimizar rate keys e impedir reset por eviction;
- marco: `M21-1`;
- gate de saída: `G21-3`;
- condição de pausa: qualquer solução exigir credencial, serviço ou dado
  real; nesse caso preparar contrato e manter `BLOCKED_BY_G21-5`.

## W3 — CI, supply chain e qualidade executável

- esforço indicativo: 1–2 semanas;
- tasks: `REM21-008`, `REM21-012`, `REM21-013`, `REM21-016`, `REM21-018`;
- achados: `A21-F08`, `F13`–`F15`, `F18`, `F21`, `F24`, `F25`;
- objetivos:
  - fixar Node 22 e tornar toda a barra bloqueante no CI;
  - exigir catálogo de skips e ampliar mutation por risco;
  - construir imagem mínima/non-root e vinculá-la ao candidate/run;
  - remover fallbacks fracos e documentar configuração segura;
- marco: `M21-2`;
- gate intermediário: self-tests negativos de cada gate;
- saída: CI reproduzível sem skip obrigatório oculto e manifesto verificável
  offline.

## W4 — Operação durável e observável

- esforço indicativo: 1–2 semanas;
- tasks: `REM21-010`, `REM21-011`;
- achados: `A21-F07`, `A21-F12`;
- objetivos:
  - medir carga no caminho API→PostgreSQL→worker;
  - provar backup/restore por conteúdo, RLS, roles, grants, outbox e journals;
  - ensaiar rollback/roll-forward de migration em ambiente descartável;
  - compor exporter, alertas, SLOs e degradação segura;
- marco: `M21-3`;
- gate de saída: `G21-4A`, limitado ao ambiente local/sintético;
- limite: RPO/RTO produtivo não pode ser inferido dessas medições.

## W5 — UX, manutenibilidade e evidência

- esforço indicativo: 1–2 semanas;
- tasks: `REM21-014`, `REM21-015`, `REM21-017`;
- achados: `A21-F16`, `F17`, `F19`, `F22`, `F23`, `F26`;
- objetivos:
  - testar browsers declarados, sessão confiável, tenant e acessibilidade;
  - extrair slices de hotspots com caracterização e sem big-bang;
  - corrigir checker/links/JSON vazio e padronizar logs/evidências;
  - reduzir duplicação corrente sem apagar registros históricos;
- marco: `M21-4`;
- gate de saída: docs/evidence determinísticas e matriz UX explicitamente
  suportada.

## W6 — Freeze, reauditoria e decisão

- esforço indicativo: 3–5 dias úteis;
- task: `REM21-019`;
- dependências: todas as tasks internas anteriores em `VERIFIED`;
- objetivos:
  - executar a barra integral uma vez no candidato final;
  - congelar source/runtime/imagem/reports por hashes;
  - submeter pacote imutável a crítico I1 fresco;
  - executar sentinel e registrar limitações e decisão humana;
- marco: `M21-5`;
- gate de saída: `G21-6`;
- regra: nenhuma correção durante a crítica; qualquer mudança invalida o
  freeze e reinicia somente depois de registrar a falha.

## W7 — Integrações externas e piloto

- status: `BLOCKED_BY_G21-5`;
- esforço: não estimável antes de owners/ambiente/contratos;
- tasks: `REM21-009`, `REM21-020`;
- achados: `A21-F06` e parte produtiva de `A21-F05/F07/F12`;
- preparação permitida: contratos, mocks, runbooks, threat model, DPIA quando
  aplicável, rollback, kill switch, matriz de owners e plano de teste;
- execução proibida sem gate: IdP/provider/canal real, credenciais, dados
  reais, RPO/RTO produtivo, piloto e produção;
- marco eventual: `M21-6`, sempre com decisão humana separada.

## Dependências críticas

| Predecessor       | Sucessor             | Motivo                                               |
| ----------------- | -------------------- | ---------------------------------------------------- |
| `REM21-001`       | todas                | estado e ownership precisam estar reconciliados      |
| `REM21-002`       | `REM21-019`          | certificador deve ser confiável antes do freeze      |
| `REM21-003`–`007` | `REM21-008`/`019`    | CI e candidato devem provar as fronteiras corrigidas |
| `REM21-008`       | `REM21-012/013/016`  | novos gates precisam de orquestração CI comum        |
| `REM21-010/011`   | `REM21-019`          | prontidão interna exige recuperação/telemetria       |
| `REM21-014`–`018` | `REM21-019`          | UX, evidência e supply chain entram no pacote final  |
| `G21-5`           | `REM21-009/020` real | nenhuma evidência local concede autoridade externa   |

## Indicadores de acompanhamento

- P0/P1 alto abertos: alvo interno `0`;
- gates obrigatórios executados no mesmo run: alvo `100%`;
- skips desconhecidos/expirados: alvo `0`;
- mutantes sobreviventes no conjunto crítico selecionado: alvo `0`;
- evidências sem comando/exit/timestamp/candidate: alvo `0`;
- drift entre runtime, backlog, logs e task ativa: alvo `0`;
- cobertura global: `>=90%` statements/lines/functions e `>=85%` branches;
- eval integrado: `>=97%` em holdout selado;
- produção: permanece `NO_GO` até `G21-5` e `G21-6`.

## Handoff

O backlog executável está em
[`0337_comprehensive_remediation_backlog.md`](0337_comprehensive_remediation_backlog.md).
O plano de autoridade e recuperação está em
[`0335_comprehensive_remediation_executive_plan.md`](0335_comprehensive_remediation_executive_plan.md).
Para iniciar a execução local autorizada, usar deliberadamente o
[`0338_codex_full_remediation_prompt.md`](0338_codex_full_remediation_prompt.md).
