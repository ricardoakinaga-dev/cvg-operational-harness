# Revisão humana T3 — SPEC 0175

**Escopo:** BUILD exclusivamente sintético do limite de resposta durante recepção, task AUD0592-STREAM-01/UP91-028. Programa integral e release permanecem abertos. **Estado da solicitação:** ENVIADA; crítica técnica final I1 aceita, sem achados materiais; resposta humana PENDENTE, nenhuma aprovação inferida.

Leia a [SPEC completa](../../../../02_spec/0175_stream_response_receive_limit.md). SHA-256 da versão proposta: `6ae712e64ce42dea48fce97775b38c9b58755efe2be6c058e9563c4c9b8f31a4`. O hash identifica o contrato; eventual alteração exige revisão da versão resultante.

A correção proposta abrange:

- propagar o limite existente aos transportes de modelo/canal e aplicar o teto antes de reter/copiar/concatenar resposta;
- limitar também a leitura de Response.body na via injetada, com ownership dos buffers, sem confundir tamanho comprimido com bytes expostos;
- rejeitar encoding não identity no caminho Node, sem descompressão ilimitada;
- acrescentar deadline total da leitura de resposta: default30s, opção explícita1–300000ms, após headers; preservar cancelamento/deadline já existente do modelo;
- classificar excesso sem retry e preservar efeito incerto quando um POST de canal pode ter sido enviado;
- provar comportamento nos quatro adapters e gateways/journal públicos com fixtures locais, controles, negativos e gates D-12.

A [baseline](baseline-result.json) observou262199bytes concatenados comcap4096 no modelo e canal antes da rejeição. No canal, effectUnknown=false após o POST sintético. O diagnóstico não é qualificação de memória geral, serviço real ou release.

A correção não altera policy/guard SSRF, approvals de domínio, lockfile, schema, prontuário ou agenda. Não autoriza dados reais, canal/provider externo, deploy, push ou GO. Não substitui aprovações de0174/0170/012/lote7;0174 continua condição independente para integração completa do transporte. A aprovação já existente0164 continua condicionada ao claim/liberação pertinente, sem repetição.

Origem do gate: [constituição, D-12](../../../../07_agents/AGENTS.md#governança-proporcional-d-12-26092026): T3 exige “revisão explícita da SPEC pelo usuário antes do BUILD”. O parecer técnico é prontidão para revisão; não constitui essa decisão.

Decisão possível após crítica válida: “Aprovo BUILD sintético da SPEC0175 no SHA-256 informado”. Outra resposta pode solicitar ajuste concreto; ausência de resposta permanece pendente. O estado de envio/resposta fica no registro JSON do pacote, separado desta descrição.

Parecer final: [registro de prontidão](final-review-status.json), com [retorno integral do crítico](I1-review-r3.md.txt). O primeiroREVISE e o segundo parecer com independência inválida permanecem arquivados; a versão aceita foi conferida por novo revisor com inputs restritos.
