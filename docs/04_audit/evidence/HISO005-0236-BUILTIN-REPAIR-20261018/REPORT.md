# HISO005 — P1 de precedência nativa corrigido e integrado

O P1 R2-01 foi corrigido no checkout compartilhado por dois arquivos provenientes da fonte congelada `d8e3f8f2d346d4f8d3ddd162384ebbb79a322137`. Nomes reconhecidos pelo `isBuiltin` do Node pinado recebem UNKNOWN antes da busca de pacote ou autorreferência; o kernel não publica prova de um arquivo homônimo que o Node não seleciona. Nenhum resumo positivo de módulo nativo foi acrescentado. [Fonte e hashes](source-freeze.json), [promoção](promotion-receipt.json).

A retomada foi solicitada explicitamente pelo usuário após o ciclo7ad6 reprovado. A autoridade0236/cf07 continua válida; os ciclos e pacotes anteriores permanecem históricos/selados. Não houve nova aprovação presumida da SPEC0237, produção ou isolamento integral.

## Validação corrente

173focaisPASS:58CLI+100engine+15compiler,zero falhas/skips.14controles novos;44anteriores preservados. O primeiro vermelho foi mantido e distingue substituições PROVEN indevidas de recusas antigas com razão diferente. [Suíte focal](focused-current.json), [classificação dos vermelhos](first-red-classification.json), [preservação](prior-controls-preservation.json).

Crítico fresco Ramanujan APPROVE/zero obrigatórios:12cenários/40chamadas, sem executar alvos; homônimos/autorreferências/subpaths/prefixos recusados, quatro positivos ordinários vinculados ao arquivo físico realmente selecionado, prioridadeFAIL e default/P1 preservados. Lead conferiu567arquivos vinculados,17fontes, os resultados brutos e hashes dos positivos. Seis ponteiros de navegação foram acrescentados depois, preservando os567julgados e o manifesto. [Parecer](review-r1/REPORT.md), [recomputação do Lead](review-r1-lead-acceptance.json), [adendo de navegação](post-review-navigation.json).

Certificação corrente `ee7d9aaccc56eba8950b8c5c766200277343b79a9125f8e9d9adc62a5e74baa1`, run `run-ee7d9aaccc56-mvdo0ve4`:16gatesPASS,5.015unit/302PG/12E2E,zero falhas/skips,zero flakyE2E. Cobertura94,38%linhas/90,19%branches. Verificador oficial em modo corrente:exit0/38hashes. Resultado local CONDITIONAL_GO/AAA_CONTROLLED, sem crédito de produção ou do root misto. [Qualificação e38artefatos](current-qualification-summary.json), [verificador](certification-current-verification.json), [orquestração completa](qualification-orchestration.json).

Projeções compiladas pré/pós-gates revalidam45inputs/351fontes do compilador/304dependências/112saídas. Geração real1c e receipt d6df permanecem identificados como tal; só engine/teste mudaram fora dos inputs desse build. Consumidor repetido com207imports/76exports/zeroRede/sem produto ou aliases de fonte. Default/P1 byteiguais ao checker anterior sobre os mesmos inputs físicos. [Pós-gates](projection-revalidation-postcert.json), [compatibilidade](compatibility-postcert.json).

## Fronteira e integração

A fronteira real permanece INCOMPLETE/exit1 em normal e strict:2.258ocorrências=537baseline+1.721novas,303instaladosMATCH/zeroverified/zeroresolvidos. Payloads iguais sem telemetria e grafos byteiguais; IDs/tuplas/pointers conferidos,1.720hashes físicos+umaorigem indisponívelnull. Todos537diagnósticos de baseline,168origens próprias originais e303nós instalados preservados. A diferença para a medição histórica2.399 não representa141provas ou resoluções: o baseline resolvido continua zero. [Medição](real-postcert-state.json), [reconciliação](postcert-frontier-independent-reconciliation.json).

Promoção somente de engine/testeCLI, com pré-imagens e índiceGit preservados.75dos78protegidos mantiveram os hashes iniciais; três arquivos privados do qualifier foram promovidos em paralelo pela outra frente. O preflight interrompeu sem escrita; seus bytes foram conferidos contra o commit qualificado f2204200 e reancorados como novas pré-imagens protegidas. Nenhum dos78foi alterado pelo portHISO. A certificação privadaD8 não incorpora essa evolução do peer nem se transfere ao checkout compartilhado. [Drift preservado](promotion-preflight-drift.json), [preimages do peer](promotion-peer-preimages.json), [receipt final](promotion-receipt.json).

PG próprio fba82780 foi removido por ID/label com zero outros clientes; portas56238/3406/4406livres. Os3.716arquivos selados anteriores foram conferidos byteiguais. Candidata/commits/referências/consumidor retidos; jobs e crítico encerrados. [Limpeza](resource-cleanup-final.json), [selos anteriores](prior-sealed-preserved-final.json).

## Documentação e continuidade

Os119registros de vazios HISO pendentes foram acrescentados ao catálogo após liberação e claim próprio:484→603, prefixo e registros anteriores exatos. Nenhuma entrada alheia ou metadata desconhecida foi inventada. Novas capturas desta unidade recebem catálogo local e fechamento próprio. [Append119](central-old119-append-receipt.json).

O P1 local está resolvido. HISO005/P2/P3/B6 continua aberto por UNKNOWN; o próximo perfil0237 ainda exige atualização da baseline/HOW, preservação desta precedência nativa e revisão documental/humana própria antes de qualquer código novo. Não solicitar novamente a aprovação0236. Nenhum push, deploy, dado real ou provider real foi usado.

Checkout compartilhado observado depois da promoção:defaultINCOMPLETE/528diagnósticos; opt-in com receipt de outra raiz físicaINCOMPLETE/2.269diagnósticos e compiledUNAVAILABLE. Isso não é a medição da candidata qualificada nem transfere seu certificado ao root. [Observação do root](root-post-promotion-observation.json). Novas55capturas vazias catalogadas localmente e acrescentadas ao central preservando638entradas/prefixo anteriores, total693no ato; recurso liberado. [Append55](central-new55-append-receipt.json).

Checagens finais de links/formato/higiene do escopo próprio passaram;55vazios constam no catálogo local e central. [Checks documentais](documentation-final-checks.json), [invariantes finais](final-invariants.json), [cinco aceites](acceptance-status.json). Fonte17 e HEAD da candidata permanecem congelados. Seu worktree contém somente outputs esperados de certificação/evidência diferencial gerados pelos gates; eles foram preservados, sem restore/clean e sem afirmar que o worktree inteiro ficou limpo após a emissão.
