# Próxima tarefa — Agente 1: corrigir AAA-08 / AAA08-C1-F01

Execute somente o rework AAA-08 descrito em `docs/04_audit/evidence/AAA/AAA-08/review-coordinator-r2/REVIEW.md`. Leia AGENTS, runtime/log/backlog e a entrada AAA-08. Preserve trabalho das demais frentes. Esta tarefa mantém o escopo de correção local controlada já solicitado; não concede gates ausentes, autorização real ou produção.

Objetivo único: impedir que uma capability de draft autorize uma action de confirmação, remarcação ou cancelamento por divergência capability/action/resource.

1. Reproduza `action-binding-probe.mjs`: hoje modify + draft + confirm/reschedule/cancel retorna ALLOW e chama ferramenta falsa. Preserve RED em teste de regressão cuja expectativa seja DENY e zero chamadas, sem alterar a evidência original.
2. Inspecione os chamadores e defina a relação explícita entre capability, action e resource. Não imponha igualdade textual global sem conferir aliases legítimos. Ações sensíveis incompatíveis devem falhar fechado antes de grants/documentos; policy de tenant não pode ampliar essa relação. Qualquer ajuste normativo em AAA-03 exige adendo versionado e revisão antes do consumo; não sobrescreva silenciosamente o contrato aprovado por hash.
3. Corrija o menor escopo em `packages/policy-engine/` e, somente se necessário, `packages/policy/`. Reserve exclusivamente esses paths durante o rework. Pode adicionar regressão sintética em `packages/agent-runtime/src/__tests__/` para provar o limite público; não altere runtime.ts nem inicie AAA-09. Registre paths exatos no handoff; não edite contratos/arquivos de outros agentes.
4. Prove matriz positiva e negativa para create/modify e ações confirm/reschedule/cancel: perfis/roles relevantes, ausência/incompatibilidade de recurso, tenant incorreto, tentativa de expansão por policy e aliases legítimos. Preserve draft permitido, cancel legítimo REQUIRE_APPROVAL e confirm/reschedule sem grant. No teste runtime só use executor falso e exija zero chamadas nos casos incompatíveis.
5. Rode testes focados, regressão policy/runtime, typecheck, lint e gates disponíveis exigidos pelo AGENTS ao concluir rodada com código. Coverage deve ser registrada sem reduzir barra e com slot global reservado; se indisponível registre a limitação, não invente PASS. Não use banco operacional, provider real ou dados reais.

Ownership documental: seus artefatos em `docs/04_audit/evidence/AAA/AAA-08/`, em nova versão; preserve manifesto e reviews anteriores. Não edite runtime/log/backlog/ledger/0327 compartilhados: o coordenador integra o próximo retorno. Se faltar gate aplicável ao ajuste necessário, entregue o adendo e bloqueio concreto, sem fabricar autorização.

Entregue IMPLEMENTED ou BLOCKED, diff, hashes do novo candidato, mapa finding→teste, RED/GREEN e comandos/exit codes. Não autoaprovar DONE. Não iniciar outra task ou redistribuir Agentes 2/3.
