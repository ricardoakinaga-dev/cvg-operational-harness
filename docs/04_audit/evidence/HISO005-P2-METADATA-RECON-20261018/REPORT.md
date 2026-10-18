# HISO005 — Recon de metadados e próximo contrato

Preparação T1 da mesma frente HISO005/B6. Fonte congelada `84d8d4b4ed053493533d7e9ad55e574a9e6f9047`; nenhum código de aplicação alterado. A implementação0237 está concluída localmente e seu pacote590 permanece selado. O pai continua aberto: B6 INCOMPLETE1609,303 MATCH/zero verified/zero provas semânticas.

## O que foi observado

- [Censo](census.json): todas359 origens ambíguas retidas;358 arquivos físicos/hash conferidos,1586 candidatos AST.360 recusas na guarda949 do helper:357 arestas Vitest,duas OTel euma ReactDOM. Os conjuntos de arquivos se sobrepõem. Uma origem global indisponível permanece sem atribuição. São envelopes de diagnóstico e candidatos de aresta, sem bijeção presumida.
- [Fontes primárias](node-primary-source-binding.json): três módulos internos extraídos do Node22.23.2 efetivamente pinado, binary SHA3517c2df. O seletor nativo usa chave exports exata antes de procurar patterns, após rejeitar mistura global de chaves. `imports` participa de requisição `#`, sem transformar uma requisição ordinária em seleção de imports.
- [Oracles reais](real-node-resolution-witnesses.json): três arestas import reais e um require contrafactual de Vitest resolvem targets regulares. [28 controles privados](selector-witnesses.json),14 configurações em dois modos, distinguem presença inativa, uso ativo, mapa inválido, arquivo ausente e alias de produto. Nenhum target foi importado ou avaliado. URL resolvida não demonstra disponibilidade ou corpo seguro.
- [14 controles do corpo na v2](body-separation.json): dois PROVEN fechados,dez UNKNOWN,duas VIOLATION por produto; todos com validação válida. Reflexão opaca permanece UNKNOWN mesmo quando resolver Node/helper têm target. O caso combinado de metadados inativos+alias de produto hoje é UNKNOWN antes de descobrir o alvo; a nova proposta exige VIOLATION quando esse percurso passar a selecionar o alvo.
- [Reconciliação do Lead](lead-reconciliation.json):11 checks PASS, incluindo todos590 arquivos/53.903.975bytes do pacote0237,20 fontes da candidata,Root7/índice/HEAD,359 origens/multiplicidade,358 hashes,fixtures,binário/fontes nativas e hashes das14 saídas brutas do corpo.

## Decisão proposta e limites

[SPEC0240](../../../02_spec/0240_b6_node_metadata_resolution_scope.md) propõe um delta finito de seleção Node: mapa imports elegível inativo e chave exports literal exata com pattern elegível não selecionado. O driver é tornar a derivação de seleção compatível com o subconjunto nativo observado e alcançar os targets selecionados para análise/censo negativo. A alternativa de apenas remover as ocorrências ou excluir os testes foi rejeitada por não produzir prova.

Continuam fora desse delta: resolver ativo de imports/patterns, browser, summaries de Vitest ou dependência por nome, alteração K0–K7, provas parciais apesar de UNKNOWN global e dispensa da proveniência compilada de dist. Vitest ainda tem sucessores/corpos fora do kernel, módulos nativos/interop e dist sem receipt correspondente. Nenhuma redução real ou prova B6 é prometida pela resolução de metadados. A classificação357 arquivos de teste não concede permissão para omiti-los.

MS01–12 são aceites futuros NOT_RUN, pois não há implementação0240. Os testes executados nesta preparação avaliam somente o Node nativo e a fonte v2 já aprovada. A revisão independente é documental e não substitui BUILD/revisão de código/gates novos.

## Limitações e correções do operador

O primeiro operador interpretou `usage.openDescriptors` como contagem viva; é high-water. A [correção de observação](descriptor-observer-correction.json) e a captura inicial foram preservadas. A contagem posterior acompanha abertura/fechamento real e termina com zero FD próprio, pico7; não foi demonstrado vazamento no helper.

Nos controles de corpo, `cwd` registrado era a raiz lógica da análise. O subprocess herdou o cwd do repositório; o operador passou a raiz física privada explicitamente em argv para o kernel. A [correção aditiva](body-operator-metadata-correction.json) documenta isso sem reescrever a captura. A resolução nativa usa outro operador que passa cwd explicitamente. O resultado estático dos controles não depende do rótulo incorreto; não se usa essa captura como oracle de resolução por cwd.

## Próxima ação

R1 documental retornou REVISE/um P2: a expressão “antes de qualquer cap” tornava obrigatório descobrir um alvo mesmo quando a aquisição do manifesto era impedida pelo limite. O [rework](rework-r1.json) esclarece3.3/MS05/MS07: produto conhecido prevalece sobre recusa/cap posterior; falha antes de conhecer o alvo fica UNKNOWN/zero provas, preservando violações anteriores, sem ultrapassar limites. [45 artefatos/34 snapshots R1 conferidos](lead-review-r1-verification.json), sem reescrever o parecer. SPEC revisada e19 inputs no [freezeR2](contract-freeze-r2.json), segunda/final rodada documental.

R2 final APPROVE_SPEC/zero achados,12 casos documentais,35 artefatos/29 snapshots conferidos pelo Lead; crítico fechado e orçamento2/2 encerrado. Checks T1 de formato/links/higiene PASS. O [pacote concreto](decision-packet.md) solicita decisão humana somente sobre o novo delta0240. A exigência vem de D-12/T3 e da autoridade de transferência positiva0236, preservando as aprovações0236/0237 já resolvidas. Sem código0240 antes dessa decisão. Sem alteração de produto/lock/runtime público, full gates nesta T1, commit do root, push, deploy ou produção.

Recuperação de escrita compartilhada: o formatter aplicado ao arquivo de coordenação completo alcançou histórico alheio. O [receipt](coordination-format-recovery.json) documenta a reversão somente desse delta, por patch conferido, preservando os dois registros novos do peer e o claim próprio. As versões antes/depois formatam para os mesmos bytes; a verificação final de formato usa somente o trecho reivindicado, com links no documento inteiro.
