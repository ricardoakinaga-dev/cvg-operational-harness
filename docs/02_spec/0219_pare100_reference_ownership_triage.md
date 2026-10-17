# SPEC 0219 — Triagem rastreável de responsabilidade da referência

P100-003, T1, inventário autorizado pelo pedido integral. Complementa a SPEC0209; não altera o coletor, runtime, mapa original de famílias nem os critérios dos 36 cartões. Saída exclusivamente documental em `evidence/PARE100-EXEC-20261014/matrix/r22/`.

## Problema observado

O catálogo R22 preserva as 44132 entradas,3218 fontes e os contratos da coleta anterior. Tem118 entradas com `UNRESOLVED_OWNERSHIP`:92 linhas e um grafo em `docs/capability-seams.md`,23 entradas do preset `packages/client/tsdown.client.ts` e duas de `packages/tsdown.worker.ts`. A aprovação do reparo do coletor não resolve sua classificação funcional.

## Regras anteriores à geração

1. Conferir os hashes físicos das três fontes contra o catálogo e o commit de referência já autenticado. Somente ler declarações/documentação; não executar ou copiar implementação.
2. Para cada linha da tabela gerada de serviços, usar a coluna **Owner**, nunca o primeiro link do texto ou uma busca por substring. Resolver seu link somente para diretório de pacote presente no mapa original. Se a célula contém apenas um nome em backticks, exigir correspondência única com o nome de pacote autenticado do mapa; não inferir por semelhança. Correlacionar a linha ao contrato pelo digest da identidade e dos valores projetados, sem pareamento por ordinal. Ausência, duplicação ou ambiguidade bloqueiam a classificação.
3. O grafo agregado representa composição entre serviços: propor P100-012 como responsabilidade primária e registrar os demais cartões encontrados nas linhas como relacionados. Isso exige evidência das relações; não converte um grafo em prova de execução.
4. Os dois presets de build recebem proposta P100-052, com responsabilidade relacionada de UI/extensões ou inicialização conforme sua função observada. O planejamento mantém essas entradas como obrigações de build; não as exclui do denominador.
5. Registrar por ID o owner/scope original, proposta, motivo, fonte/hash e declaração de pacote que sustenta a decisão. O catálogo original continua imutável; a triagem não reescreve sua extração UNKNOWN ou NOT_VERIFIED.
6. A matriz inicial retém todas as entradas e hashes. Cada folha liga seu cartão e a necessidade de um procedimento comportamental rejeitável. Procedimento ainda não definido continua explicitamente pendente; nenhuma folha recebe PASS por classificação, quantidade de testes ou inventário.

## Verificação e limite

Gerar inventário completo de IDs, resumo por cartão/status e triagem118. Se uma linha não trouxer owner autenticado exato, registrar PENDING com motivo e manter seu owner original; a ausência bloqueia a classificação daquela folha, não autoriza inferência nem exclusão. A célula `inspector`, sem link e sem nome completo de pacote, permanece pendente nesta rodada. Rejeitar fonte adulterada, owner ausente/fora dos36cartões, link ambíguo, ID duplicado ou perda de requisito. Guardar método e hashes no parent/evidência. Revisão técnica da triagem precede seu uso como classificação aceita. O aceite semântico integral de P100-003 e a comprovação funcional permanecem separados.

## Extensão finita R23 — owner Inspector por declaração autenticada

R22 foi aceito tecnicamente com117propostas e a folha `contract:0392ba0d7ff2d89b621a2fca0f163ae93398703f6d627320e0d0a0f033c6d57a` pendente. A falta de link não será resolvida por semelhança de nome. Para essa folha específica, a coluna ctx é `ctx.inspector` e a coluna Owner é `inspector`. R23 exige os dois contratos existentes exatos `@deepseek-ai/cordis.Context.inspector`, com IDs `contract:02b90737ec6b6331bbe68ee3e3bcdd09e3798e689535ef9412824bcb0a3f4af4` e `contract:ffcb8defad9c69d2d01e83ef98001c2b9523d1a56dc1a9cecd02d960ec815b86`. Ambos devem pertencer a `@deepseek-ai/dsh-experimental-inspector`, ter ownerP100-046 e tipo declaradoInspectorService.

O gerador fixa a lista literal correta de dois IDs, contrato SHA87feb533e2666a3620e61335b1178e4f753c352e5a9cf9b95ab96aa2efca95c6, fontes index.ts e client/plugin.ts, seus hashes físicos e o manifesto do pacote no mapa original. Ausência, terceiro candidato, pacote/owner/tipo divergente ou digest adulterado mantém a classificação bloqueada. Ler as declarações como dados, sem executar ou incorporar implementação. A ligação explícita do serviço ao pacote sustenta somente uma proposta de responsabilidade, não prova lifecycle/runtime. Todas as demais117propostas, folhas, owners e UNKNOWN do catálogo permanecem idênticos; R23 precisa revisão técnica do delta antes de aceite.
