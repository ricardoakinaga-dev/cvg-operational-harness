# Conferência das críticas do avaliador — 03/10/2026

**Veredito global: FAIL. Objetivo de implementação: BLOCKED.** A preparação entregue não encerra o plano: somente HISO-001 está DONE; oito cartões estão IN_PROGRESS e quinze estão TODO. Os 24 critérios permanecem exigidos. Meu resumo anterior omitiu o FAIL e deveria ter delimitado melhor o alcance dos 990 testes.

Esta conferência foi solicitada pelo usuário. Executei novamente a integridade do corpus e a compatibilidade dos dados com o schema V1 diretamente no repositório. Não reexecutei os 990 testes, a suíte de 2650 testes, as sondas de fronteira ou o npm audit. Esses resultados foram conferidos nos logs preservados. Não é uma terceira crítica técnica nem aprovação de correção T2/SPEC T3.

Resultados novos: [integridade](evaluator-corpus-integrity-r1.json), [schema](evaluator-corpus-schema-r1.json) e [fatos estruturados](evaluator-facts-r1.json). Logs anteriores e SPECs permanecem preservados.

## Conferência das oito ressalvas

1. **Alcance dos 990 testes — confirmada.** Os logs registram [78 arquivos/857 testes de nove pacotes](postgres-neutral-governance-r1.log) e [14 arquivos/133 testes de API/worker](postgres-neutral-host-recovery-r1.log), com PostgreSQL na variante sem produto e sem indicação de skips. Eles se sobrepõem aos [2650 testes/335 arquivos](full-tests-coverage-r3.log); não somar os totais. São uma baseline I0 da governança existente, sem aceite do checker de fronteira ou dos contratos futuros. Não foram reexecutados nesta conferência.

2. **Omissão do FAIL — confirmada no resumo anterior.** O handoff já registrava FAIL, mas isso precisava aparecer também na resposta ao usuário. As duas classes P1 têm sete falsos PASS nos [17 casos preservados](t2-critic-r2/review.md). Há 23 critérios sem aceite integral. Uma precisão adicional: o [npm audit preservado](security-audit-readonly-r1.log) conta três grupos de pacotes HIGH e um MODERATE, com vários advisories por grupo, e não apenas quatro advisories individuais. As versões afetadas continuam no lockfile atual. As correções PISO não foram implementadas; existem código anterior do consumidor, extração, documentação e fixtures, o que não constitui implementação desses critérios.

3. **Arquivos sem commit — confirmada.** Corpus, evidências e SPECs 0179/0180 continuam untracked. Confirmei o [claim HARNESS-ISO-EXEC](../../../08_runtime/agent_coordination.md#harness-iso-exec--implementação-integral-e-gauntlet--03102026), incluindo corpus, SPECs e evidências. A regra 3 proíbe outro agente de executar git clean sobre trabalho alheio; isso reduz conflito, mas não substitui preservação no Git. Nenhum commit foi feito nesta conferência. A recomendação do avaliador permanece pendente; não foi convertida em autorização para commitar o conjunto de mudanças.

4. **Ledgers sem integração — confirmada.** Runtime 99, log 20 e backlog 30 ainda não contêm esta execução. A regra 5 da coordenação manda esperar quando o arquivo está modificado por outro trabalho. As entradas foram preparadas no [handoff](../../../08_runtime/handoffs/harness_isolation_execution_20261003.md#entradas-prontas-para-os-ledgers-compartilhados), mas isso não equivale à atualização dos ledgers. Corrigi também a entrada proposta do runtime, que ainda dizia ACTIVE apesar do estado final BLOCKED. Integração continua pendente; os arquivos compartilhados foram preservados.

5. **Dependência de /tmp — parcialmente confirmada.** O runner histórico e a retomada da suíte dependem do snapshot volátil; não existe retomada integral independente dele pronta nesta entrega. Entretanto, corpus, manifests, checkers de integridade/schema, logs e [arquivo completo das fixtures R2](t2-critic-r2-fixtures.zip) estão no repositório. Os dois checks novos passaram diretamente no checkout, sem usar o snapshot. Acrescentei abaixo comandos reproduzíveis para esse escopo; isso não torna a suíte histórica portável nem resolve o risco de arquivos untracked.

6. **Limites da fala sintética — confirmada.** Os dez WAVs são PCM16, mono, 16 kHz, com durações de 25,977687 a 34,090187 segundos e hashes corretos. eSpeak limpo não qualifica áudio humano, ruído ou sotaques. Casos 17/18 continuam placeholders de mídia. Whisper e revisão humana estão NOT_RUN; versão/modelo/transcrições são nulos. A integridade comprova a preparação dos dados e seus vínculos de fonte, sem comprovar fidelidade clínica ou comportamento do serviço. PISO-009 permanece TODO.

7. **Bloqueio de processo — confirmada com qualificação.** Existe uma hipótese concreta de correção T2 para HISO-005, mas o gate tem defeitos técnicos reais ainda abertos. A [regra de duas revisões](../../../CVG_DIRECAO_PROGRAMAS_E_PLANO_HARNESS_2026-09-30.md#regras-de-trabalho) encaminha a mudança à sessão semanal; a [D-12](../../../07_agents/AGENTS.md#governança-proporcional-d-12-26092026) exige revisão humana explícita das SPECs T3 antes de BUILD. As decisões já apresentadas continuam sem resposta: encaminhamento/correção T2 e revisão de 0179/0180 no [packet humano](revisao_humana_t3.md). A mensagem com as críticas não concede essas aprovações. A exceção CLINICAL continua proposta, com default NO_MODEL. Mesmo após aprovação, ainda haverá implementação, verificações e etapas humanas do produto.

8. **Espaçamento do handoff — confirmada e corrigida.** Separei números, unidades, estados e referências documentais no texto, preservando links, hashes, identificadores em código e resultados históricos. O handoff agora destaca BLOCKED/FAIL e o alcance histórico dos 990 testes no início.

## Reprodução da integridade sem snapshot temporário

Execute a partir da raiz do repositório, com Python 3; para o segundo comando, use Node 22 e as dependências locais instaladas:

```bash
python3 docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/check-corpus-integrity.py "$PWD"
node --experimental-strip-types docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/corpus-schema-check.mjs "$PWD"
```

O primeiro comando é somente leitura: não acrescente `--write-manifest`. O segundo verifica o schema V1 existente, sem executar o produto. Os resultados esperados são 20 casos, 42 arquivos no manifesto, dez áudios, 192 vínculos de fonte, 23 candidatos estruturados válidos e um JSON deliberadamente truncado. Produto, Whisper e qualificação humana continuam NOT_RUN.

Para retomar a suíte inteira, será necessário reconstruir e registrar um candidato isolado sob claim a partir dos arquivos preservados, com manifests/lock coerentes, recursos sintéticos e sentinels novos. O [runner histórico](run-check-v2.py) permanece como evidência da execução passada; não é apresentado como runner portátil. As fixtures R2 estão arquivadas para extração em candidato próprio, sem criar packages vigentes no checkout compartilhado.

## Estado de entrega

Aceitar como preparação T1 e evidência I0 nas fatias descritas; não como aceite integral dos critérios restantes. Correções desta conferência: apresentação, espaçamento, estado proposto e instruções de reprodução. Código, SPECs, lockfile, corpus, cartões e ledgers compartilhados não foram alterados. Commit, integração dos ledgers, decisão T2, revisão T3 e qualificação humana permanecem pendentes. Objetivo continua BLOCKED e veredito global FAIL.
