# Emenda T3 — limites de custo e identidade do modelo

Task: HARNESS_ISO_GREEN_20261004 / GATEWAY_COST_MODEL. Estado: READY_FOR_HUMAN_T3_REVIEW. Somente BUILD local sintético, sem provider real, dados reais, push, piloto ou implantação. NO_MODEL permanece para CLINICAL, FINANCIAL, CREDENTIAL e entradas desconhecidas. SPEC0180 aprovada por SHA7971771ca8e4a12be90e58536ea105c8399d844e28c47093b2a50575afff6dc2 continua a base.

## Problema e evidência

A revisão independente Node22 R5 reproduziu duas lacunas do contrato público: request.maxCostUsd0/0.5 e profile.maxCostUsd0.5 admitem estimativa/custo0.6; perfil unregistered-model é informado no resultado, mas adapter OpenAI simulado envia color. Relatórios e probes imutáveis estão em /home/ricardo/.cache/cvg-harness-green-20261004/gateway-review-r5-critic5-output, report.json F04/F05 e proofs/public-wire-cap-results.json. São observações P2; não as converter em bloqueadores artificiais da barra congelada nem declarar corrigidas.

## Comportamento proposto para revisão humana

1. O limite efetivo é o mínimo entre request.maxCostUsd quando presente, maxCostUsd do perfil selecionado e o limite por request do BudgetGuard quando configurado. Ausência do campo do request não elimina o limite do perfil. Zero só admite bound conservador zero. NaN, infinito, negativos e configuração obrigatória ausente são recusados. A estimativa conservadora permanece max(profile.estimatedCostUsd, request.estimatedCostUsd quando presente); a chamada não admite uma estimativa acima de qualquer limite aplicável. Refusar antes de reserva, provider, DNS/HTTP e normalizador. Fallback verifica os mesmos limites do request e os limites do próprio perfil; não enfraquecer regras vigentes de retry/fallback, circuit ou cancelamento.
2. Antes de I/O, o modelo do perfil deve corresponder exatamente a um modelo anunciado pelo adapter registrado. Os adapters oficiais de modelo único já anunciam o modelo configurado. Modelo desconhecido é recusado por erro existente e sanitizado. Resultado/precificação permanecem associados ao perfil e modelo efetivamente executados; não inventar correspondência por alias ou trocar modelo silenciosamente. Provar o body HTTP do adapter simulado, não apenas mocks de propriedades. Perfis/preços registrados são snapshots imutáveis; a correção R9 já autorizada mantém esse contrato de autoridade.
3. Não alterar assinaturas, enums, SQL, política de transmissão, grants, credenciais ou fórmula de preço. Apenas implementar/refinar a admissibilidade dos campos existentes. Eventuais fixtures positivas próprias incoerentes terão diagnóstico explícito e histórico preservado; não apagar testes ou relaxar assertivas originais. Se um teste original demonstrar comportamento legítimo incompatível, registrar e revisar a emenda antes de mudar seu contrato.

## Paths e gates

Scratch exclusivo novo gateway-cost-model-candidate/output: packages/model-gateway/src/gateway.ts e helpers próprios, router.ts somente se necessário para snapshots; providers OpenAI/Ollama apenas para identidade de modelo, novos testes e runner/probes próprios. Root, lockfile, contratos/shared, SQL, product source e testes originais somente leitura. Task/claim antes de qualquer BUILD dependente; especificação presente é somente documentação.

Node22, regressões de limites0/menor/igual/maior e ausência, primary/fallback/cancel, budgets reais em cinco processos nativos, identidade do modelo em HTTP simulado, zero I/O nas recusas e perfis positivos legítimos. Tipos/lint/formato e regressões originais completas, depois revisão independente nova e gates finais integrados. Preservar falhas/retries/resultados NOT_RUN. Sem declaração automática de produção: T4 final e condições anteriores de promoção permanecem separados.

## Aprovação

A D-12 exige T2 + revisão explícita da SPEC pelo usuário antes do BUILD para mudanças de contrato público/segurança. A revisão anterior não definiu a precedência destes limites nem a recusa do modelo desconhecido; por isso esta emenda apresenta o comportamento concreto antes de implementá-lo. A aprovação solicitada limita-se a BUILD local sintético deste documento.
