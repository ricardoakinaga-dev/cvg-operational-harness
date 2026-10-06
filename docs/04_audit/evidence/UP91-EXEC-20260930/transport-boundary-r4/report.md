# UP91 — diagnóstico de transporte e gate0174 —30/09/2026

**Resultado:** progresso concreto de diagnóstico e preparação, sem correção de produto. O código de transporte atual falha em duas famílias de comportamento; SPEC0174 recebeu `ACCEPT_FOR_HUMAN_REVIEW`, sem achados bloqueantes. BUILD T3 aguardando resposta humana explícita do hash congelado. Programa ativo, qualificação globalFAIL/produçãoNO_GO.

## Evidência observável

| Fronteira | Observação atual | Limite da prova |
| --- | --- | --- |
| Dois transportes exportados, hostname + IP fixado | GET200 rejeitado antes de request, Invalid IP address: undefined | SocketHTTP próprio loopback; não provider real |
| Controle causal da API Node22 | all=true exige lista; referência externa compatível funciona, referência atual falha; formato legado também exercitado | Referência diagnóstica, não patch do produto |
| Respostas204/205/304 | Rejeitadas ao construir Response com body não nulo | IP literal separa esse defeito de lookup |
| HEAD200 | Texto vazio, mas body não nulo | Divergência de semântica bodyless, não falha de conexão |
| Provider público de modelo | execute por localhost falha após lookup do guard; IP retorna synthetic-model-ok | DefaultNode, guard real, opções locais já existentes; sem fetchImpl |
| Adaptador público de canal | IP200 aceita; IP204 vira send_failed/effectUnknown após POST ao fixture | Canal simulado, sem destinatário/provedor real |

[Conformidade direta](baseline-conformance.json): **2PASS/10FAIL**, comando de adjudicação exit1. Não são testes Vitest ou nova execução da certificação. [Probes originais](transport-probe-v2.json), [controle Node corrigido](lookup-contract-probe-v2.json) e [adapters públicos válidos](public-adapter-probe-v3.json). Servidores/sockets próprios encerrados. As primeiras falhas dos harnesses estão preservadas e não contam como evidência do comportamento público.

## Correção pronta para decisão

[SPEC0174](../../../../02_spec/0174_bound_transport_node22_compatibility.md), SHA-256 `9653ffbffdf73e9f4d21dde48705cbb2caafa7b2ec9d0407d16c10605c5b824f`: callback compatível com options.all e Response bodyless nos dois transportes, mantendo pinning, Host/SNI, guard e TLS. Matriz exige regressões HTTP/TLS, formatos de body, abort/falhas e controles de composição. O reviewer I1 separado [aceitou a preparação](I1-spec-review.json), com quatro INFO de limites, sem P0/P1/P2.

O [pedido humano](human-review-request.json) foi enviado. `accepted` da ferramenta é só entrega da pergunta: resposta real `PENDING`, `buildAuthorized=false`. A regra é D-12 T3 em docs/07_agents/AGENTS.md: revisão explícita da SPEC pelo usuário antes do BUILD. Aprovações012/0170/lote7 e0164 possuem escopos diferentes; nenhuma transferência de autoridade.

## Continuidade do programa

SPEC0173/T2 foi interrompida antes dos dois arquivos de testes; nenhuma mudança de TypeScript de produto, contratos, guards, SQL ou lockfile. Builder e crítico desta rodada foram fechados. Sete fontes seladas root/snapshot continuam idênticas. [Fingerprint nativo](native-artifact-sentinel.json) permanece `86da033177b8f20eb668184896a20b7cf84240fd3c533c1513dedf41d7d87df1`; código inalterado dispensa repetição de nativecert nesta preparação documental, conforme D-12.

52 cartões,83 origens,13 gates e149 critérios continuam completos no objetivo e abertos conforme suas evidências. O código permanece no candidato da rodada3, cujo nativeFAIL e I1globalREJECT não mudaram. Catálogo/lock/formato/CI/staging e demais revisões continuam pendências independentes. Não houve commit, push, deploy ou GO.

[Continuity checks](continuity-checks.json): controller, links, higiene e formato próprio PASS. [Checkpoint terminal](terminal-checkpoint.json) preserva autoridade vazia e distingue taskBLOCKED de goalACTIVE. Esta rodada é PROGRESS: novas falhas reproduzidas e prontidão de correção alteram a próxima ação; não satisfaz limiar de três turnos sem progresso. [Handoff](../../../../08_runtime/handoffs/up91_execution_20260930.md) está preparado para os holders dos ledgers compartilhados modificados por terceiros.

Próxima ação: registrar a resposta humana exata da SPEC0174, se recebida; implementar somente seu corte autorizado e verificar o candidato correto. Sem resposta, não iniciar correção T3 nem reiterar testes/documentação inalterados para aparentar avanço.
