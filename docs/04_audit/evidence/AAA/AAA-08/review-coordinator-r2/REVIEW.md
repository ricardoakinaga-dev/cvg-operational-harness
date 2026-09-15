# Auditoria do retorno Agente 1 — rodada 2

**Veredicto AAA-08: REWORK**, finding **AAA08-C1-F01 (P1)**. Revisão direta do coordenador, que não escreveu a implementação. Os quatro hashes de código/testes e o hash AAA-03 listados em `changed-hashes.txt` conferem.

A alteração corrige a reprodução original F15: `appointment.modify` sobre recurso `appointment` retorna DENY e zero chamadas de ferramenta. A suíte de policy foi reexecutada: **3 arquivos / 29 testes PASS, exit 0**. O diff preserva o teste de cancelamento exigindo aprovação, introduz restrição de recurso antes de grants/documentos e não concede confirm/reschedule.

A separação ainda pode ser contornada por entrada inconsistente: `capability=appointment.modify`, `resource.type=appointment_draft`, combinada com `action=appointment.confirm`, `appointment.reschedule` ou `appointment.cancel`. Nos três casos o runtime retorna **ALLOW / executed / 1 chamada à ferramenta falsa**. A policy valida recurso contra capability, mas não vincula a ação sensível à capability; o runtime repassa ambos ao executor. Não foi executada ação real e não se afirma que um adapter real aceitaria a combinação. O critério de AAA-08 exige decisão explícita por action sensível, e essa lacuna impede seu aceite.

Evidência nova: [probe sintético](action-binding-probe.mjs), [resultado](action-binding-probe.log), [suíte](policy-tests.log), [reprodução original](original-reproduction.json). O probe termina exit 0 quando confirma o contraexemplo; isso é **FAIL do critério**, não PASS da implementação. Rework deve cobrir capability/action/resource compatíveis, aliases explícitos se necessários, sem tratar resource draft como autorização de ação real. Matriz negativa deve incluir create e modify, roles/perfis e tentativa de expansão por documento de tenant; no runtime, zero chamadas ao executor falso.

## Reconciliação do restante do retorno

- AAA-03: há parecer independente **APPROVE da rev2 `9df1a05f…`**, em `AAA-03/review-agent-3/review-rev2.json` e `ADDENDUM-rev2.md`. Hash confere. A espera por esse parecer está desatualizada; o parecer anterior não foi transferido. Registrar aprovação técnica por versão, mantendo congelamento/autoridade de BUILD separados. OBS1/T-18 e OBS2/T-20 continuam obrigações executáveis futuras.
- AAA-04: parecer do Agente 1 é válido para **v1**, APPROVE_WITH_CONDITIONS. A **v2 já existe** (`aec32401…`, barra `3c2ffe03…`); seis hashes do manifesto atual conferem. Não pedir novamente que o autor crie v2 nem promover v2 pelo parecer de v1. Revisão de conteúdo da barra v2 não realizada nesta auditoria da frente 1.
- AAA-05 permanece **REWORK** pelo parecer coordenador v2; já referencia AAA-03 rev2. Não reduzir seu bloqueio à atualização desse link. A próxima tarefa do Agente 2 permanece intacta.
- AAA-16 já tem APPROVE independente funcional local; isso não implica DONE, durabilidade física ou autorização de AAA-10. Handoff e demais dependências permanecem.
- Relatório do executor 895 testes/typecheck/lint PASS preservado como histórico; não reexecutamos suíte global/coverage ou format global nesta auditoria. Não houve mudança de produto. Nenhum gate retroativo concedido pela expressão “menor task pronta”.

A próxima tarefa do Agente 1 é exclusivamente [corrigir AAA-08](next-task-agent-1.md). Não iniciar AAA-07/09/10/11 nesta rodada nem redistribuir outras frentes.
