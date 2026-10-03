# Execução das ações de auditoria do isolamento — 03/10/2026

## Purpose / Big Picture

Executar o plano anexado pelo usuário e as decisões B1/B2/B3 registradas em `docs/08_runtime/handoffs/harness_isolation_audit_actions_20261003.md`. Corrigir o gate HISO-005, preservar o trabalho no Git, tornar a reprodução independente de /tmp e entregar emendas concretas das SPECs 0179/0180 para aprovação humana separada. Após aprovação, seguir as fatias verticais da seção D. O escopo original de 24 critérios permanece; nenhuma preparação documental equivale a BUILD T3 ou piloto.

## Progress

- [x] Recuperação e leitura do anexo, decisões, skills, constituição, coordenação e ledgers. D-12 igual ao HEAD.
- [x] A1: commit próprio `fa915323386a1bf7563c27d1b3766daaf1c30892`, 437 arquivos de corpus/SPECs/evidências/handoff; sem push e sem arquivos alheios. Checkpoint de preservação, não release ou candidato integrado.
- [ ] A2: WAITING_LEDGER_OWNER; 99/20/30 têm alterações anteriores não pertencentes a esta execução.
- [x] A4/A5: runner/reconstrução duráveis executados; estados anteriores explicitamente históricos. A3 frente/claim de0190 correlacionados ao I10-FIX-009 anterior; autoria exata do processo editor permanece não comprovada.
- [ ] C1: código congelado; 17 arquivados/78 focais PASS, typecheck/lint/builds PASS; 2680 casos descobertos cobertos (2679 rodada completa+1 PG complementar),288 testes PG dedicados e12E2E PASS/MATCH. Única revisão posterior encerrada REJECT, doisP1/sete falsos PASS novos; encaminhamento semanal, nenhuma correção/revisão adicional autorizada.
- [x] C2/C3/C5/C6/C8: emendas T1/SPEC aprovadas pelos hashes concretos; contratos T3 ainda não implementados.
- [x] C4: suporte documental WAHA/Evolution registrado; qualificação operacional ainda pendente.
- [x] C7: diffs/hashes/packet conferidos; aprovações separadas 0179/0180 recebidas.
- [ ] D: BUILD T3 autorizado; primeira fatia congelada IMPLEMENTED_NOT_INTEGRATED:122PASS (40 físicos intactos+37 cenários+45 novos), build/typecheck/lint/smoke do construtor verdes. Integridade Lead90fontes/ZIPs/patches MATCH; crítico fresh-context em andamento. Lead achou divergência de contrato: ok simples sempre recusado, apesar da elegibilidade permitida pela0179; corrigir só após retorno selado. Suíte Lead2765casos PASS/339files, gate FAIL por12clones de testes em dist sem tsconfig; nova cópia de fontes idênticas preparada, sem mudar Vitest/coverage. Rootbaseline própria preservada; nenhuma promoção até revisão/rework e regressões. D009/D011 aguardam aceite C1 antes da integração. Piloto/release/dados reais fora da autorização atual.

## Surprises & Discoveries

A tabela B e a tarefa C7 do handoff antecedem as decisões respondidas. Prevalece a seção de decisões mais recente e o anexo: dois itens de aprovação, hashes atualizados e NO_MODEL, sem grant. C6 sugere dizer T2 aceito antes de haver aceite; registrar conclusão física da movimentação e distinguir aceite do gate. Controllers `.agent` anteriores continuam reservados a outros programas.

## Decision Log

03/10/2026, usuário: B1 correção agora + uma revisão; B2 emendar antes de aprovar por partes; B3 manter NO_MODEL e abrir D2 separada. As duas SPECs emendadas foram aprovadas separadamente para BUILD local sintético; recibo em audit-actions/human-t3-approval.json. NO_MODEL e D2 aberta preservados. Lead aplica as decisões atuais sem repetir perguntas já respondidas. Corpo do plano de Claude preservado como fonte; status corrente em evidências/handoff próprios.

## Context and Orientation

Core em packages/apps; consumidor em products/shift-assistant, com domínio e backlog próprios. C1 escreve scripts/check-product-boundary.mjs e tests/product-boundary.test.js sob SPEC0178. SPEC0179 governa futuras mudanças PISO; SPEC0180 governa futuras interfaces/transportes/segurança/CI. Evidências atuais e novas em docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions. Barra AUDIT-ACTIONS-v1 complementa, sem reduzir, HISO-v1.

## Plan of Work

Lead mantém commits explícitos, estado e integração. Três lanes disjuntas: C1 código/checks; S179 texto e fixtures de equivalência/quote; S180 texto. Lead pesquisa C4 e constrói reprodução durável enquanto workers atuam. Encerrar builders antes de um crítico fresh-context do C1. Não iniciar revisão enquanto código mutável. Antes de pedir aprovação, integrar diffs, atualizar manifests/packet e verificar links/formato/integridade. Pergunta humana se refere aos dois hashes concretos; trabalho independente continua enquanto se aguarda.

## Concrete Steps

Usar Node `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node`. Candidato próprio em `/home/ricardo/.cache/cvg-harness-audit-actions-20261003/candidate`, PG sintético 55595, API 3255/web 4255. Reproduzir os 17 casos arquivados em candidato separado; sete falsos PASS prévios devem ser recusados, controles positivos passar. Regressões T2: typecheck, lint, npm test com PG efetivo, test:postgres e E2E. Nunca usar sandbox 3400/3401, dados reais ou chaves de serviço.

## Validation and Acceptance

Barra frozen em audit-actions/quality-bar.json; código por SHA-256 e captures com sentinels antes/depois. Raw logs preservados, sem retry de falha determinística para obter verde. Corpus proposto não prova fidelidade clínica; pesquisa primária não equivale a provider homologado. A2 ocupado permanece WAITING. Nenhum critério original vira DONE por preparação apenas. FAIL de uma revisão C1 encerra correções desta fatia até decisão semanal.

## Idempotence and Recovery

Não limpar, restaurar, resetar ou stashar arquivos alheios. Reconstrução cria destino novo e recusa destino existente; captura recusa sobrescrever logs. Commit raiz só de caminhos próprios, conferindo staging anterior. Recuperar por este plano, claim, barra e evidências atuais; não confiar no snapshot anterior em /tmp. Estado Gauntlet somente no candidato isolado, sem alterar controller antigo.

## Artifacts and Notes

Baseline e cópias anteriores das SPECs preservadas em arquivos .txt para não criar documentos vigentes com links relativos inválidos. A1 registrado em a1-commit.json. Diferenças de SPECs serão vinculadas aos hashes novos no packet T3; aprovação humana confirmada para BUILD local sintético. Entradas atuais dos ledgers em audit-actions/ledger-handoff-current.md; PostgreSQL próprio parado após gates. Critérios da primeira fatia projetados diretamente da SPEC aprovada em product-first-vertical-acceptance.json, sem alterar a barra original.

## Outcomes & Retrospective

Em execução. Próxima ação: concluir/verificar primeira fatia vertical independente no candidato do produto; C1 retorna à sessão semanal. D009/D011 não integram antes do aceite HISO005. Objetivo active; progresso de preservação confirmado. Veredito integral anterior FAIL preservado até evidência suficiente para alteração.

## Checkpoint — rework da primeira fatia, 03/10/2026

R1 do produto encerrada REJECT por quatro defeitos reproduzidos: fonte/campo, unidade abreviada, confirmação simples e falha permanente de correção. Sentinels/89 provas conferidos pelo Lead; artefato R1 preservado. Rework em product-verification, paths disjuntos e devolvidos ao Lead após congelamento. Fonte65PASS (61 novos + quatro oráculos intactos), suíte integrada194PASS/7files/zero skips, tipos e lint PASS, build público PASS. Primeira execução187PASS/7FAIL por testes sem fechamento do store e typecheck FAIL por outbox opcional preservados; correções verificadas na segunda execução, sem enfraquecer os asserts. Suíte completa com PostgreSQL em andamento. Inventário estático mantém os37 nomes originais; não demonstra a execução original do provider clínico. ParseV2 positivo/negativo foi restaurado de forma pura, zero chamadas de modelo; comportamento clínico positivo permanece BLOCKED por D2/NO_MODEL, e PV13 não será declarado PASS por contagem de nomes. R2 fresh-context será a segunda e última revisão desta mudança, após gates/freeze. Root ainda sem promoção; nenhum critério original alterado. C1 continua REJECT/sessão semanal, sem nova correção autorizada.

Gates finais do rework:2837PASS/340files/zero skips em invocação única com PG exigido, test:postgres288PASS/35files e E2E12PASS/zero retries; produto194 é subconjunto, não somar. R2 fresh-context Arendt01a1024f-431b-7c10-8af9-43f71727a108 em andamento, packetSHA967795bdc29efbc5c0cb211b316bf5120b0e5ffe8ea9e18e8c0c50361bf46a4b. Patch preparado contra os27caminhos atuais próprios do root, preimages coincidem com baselineT2 de código e reprodução hash-bound PASS; NÃO aplicado. Rootbacklog, ledgers/core/lock/coord excluídos do patch. Fonte91 congelada e R1 intacta.
