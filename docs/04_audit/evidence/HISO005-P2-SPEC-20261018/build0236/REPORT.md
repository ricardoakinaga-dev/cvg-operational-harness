# BUILD local da SPEC0236 — mecanismo qualificado e integrado

A candidata congelada `75dfef50d0b5bc5a8063829ea4c63af8b4ab8b54` implementa o kernel conservador K0–K7, a proveniência de build compilado e a identidade de ocorrência emitida pelo checker. O usuário aprovou previamente a [SPEC0236](../../../../02_spec/0236_b6_semantic_boundary_proof.md), SHA-256 `cf07fd5dd87220cd3c41704a64d2bd294a8b972bfbf230e38fb6c3453fbffa49`; a [autoridade](../authority-build0236.json) foi registrada antes do código. Os 16 gates passaram, o verificador corrente conferiu os 38 hashes e os 17 arquivos próprios foram promovidos ao checkout compartilhado com pré-imagens verificadas. HISO-005 e B6 continuam incompletos.

## Entrega e evidência atual

- [Freeze dos 17 arquivos](source-freeze-recovery-r2.json), com origem das alterações e hashes. Contratos públicos de runtime, produto, lockfile e manifests não foram alterados por esta unidade.
- [Revisão final independente](recovery-r2/review-r2/review.json): APPROVE, zero achados obrigatórios, 16 cenários. [Conferência dos arquivos brutos](final-review-raw-integrity.json): 492 arquivos com tamanho e SHA-256 conferidos. A revisão aceita o mecanismo dentro do contrato; não certifica integração, isolamento completo ou produção.
- A [execução unitária oficial atual](certify-r2-unit-observation.json) passou com 4.978 testes e zero falhas, pendências ou todo. A [recontagem dos arquivos próprios](certify-r2-unit-owned-recount.json) confirma os 136 testes atuais da0236 na mesma execução: 100 do engine, 21 de integração CLI e 15 da receita compilada, além dos 93 casos legados preservados. Os runs focais anteriores continuam históricos, sem substituir o resultado oficial atual.
- A [migração dos testes legados](legacy-composed-r1.json) preserva os 93 casos e as recusas da0228. Os controles históricos e as primeiras falhas permanecem preservados.
- O [consumidor fresco](compiled-consumer-r4.json), compilado sem produto e usando exports públicos, passou com 207 imports, 76 exports de runtime em oito pacotes, jornada sintética e zero tentativas de rede. O denominador foi revisto contra a API vigente; não se reutilizou o antigo 198/72.
- A [certificação atual](current-qualification-summary.json), Node22 e recursos privados, passou nos 16 gates: 4.978 testes unitários, 302 testes PostgreSQL e 12 E2E, sem falhas ou skips. Cobertura: 94,37% das linhas e 90,18% dos ramos. O [verificador oficial corrente](certification-current-verification.json) conferiu os 38 hashes; artefatos brutos estão em [qualification-current](qualification-current/manifest.json). Decisão local `CONDITIONAL_GO / AAA_CONTROLLED`, sem aprovação de produção ou isolamento integral. A tentativa anterior interrompida e seus 92 erros de preparação continuam históricos.
- Após os gates, o [consumidor compilado](compiled-consumer-postcert-receipt.json) passou novamente, com as tabelas públicas iguais entre principal, candidata e variante. A [compatibilidade atual](compatibility-postcert.json) confirma relatório/grafo byteidênticos ao código P1 congelado nos modos padrão e somente identidade.
- A [promoção](promotion-receipt.json) copiou somente os 17 caminhos congelados, preservando os 63 arquivos protegidos e o índice Git. A [observação do checkout compartilhado](root-after-promotion-observation.json) retorna INCOMPLETE: 528 diagnósticos no modo padrão; 2.400 na sonda semântica com receipt compilado de outra variante, cuja proveniência foi recusada como UNAVAILABLE. Esses inventários pertencem à árvore compartilhada e não substituem os da candidata preparada. O checkout misto não recebe automaticamente a certificação da candidata.
- O [PostgreSQL privado foi removido](resource-cleanup-final.json) por ID/label conferidos, com zero clientes e portas56236/3386/4386 livres. Candidata, referências e consumidores permanecem preservados. [Estado](state.json) e [18 critérios](acceptance-status.json) registram o fechamento do mecanismo.

## Resultado real da fronteira

A [medição após os gates](real-postcert-state.json), em modo normal e strict, retorna `INCOMPLETE` e exit1. A [reconciliação independente final](postcert-frontier-independent-reconciliation.json) confere tuplas canônicas, hashes físicos, ponteiros, multiset de diagnósticos e nós instalados. A medição anterior permanece preservada como evento distinto.

| Medida                                        | Resultado atual |
| --------------------------------------------- | --------------: |
| Diagnósticos da baseline atual, todos abertos |             537 |
| Ocorrências novas com identidade própria      |           1.862 |
| Total de diagnósticos abertos                 |           2.399 |
| Diagnósticos resolvidos e provas consumíveis  |               0 |
| Nós instalados originais preservados          |             303 |
| Nós com identidade MATCH                      |             303 |
| Nós semanticamente verificados                |               0 |
| Novas origens com hash físico conferido       |           1.861 |
| Nova origem com arquivo e hash indisponíveis  |               1 |

As 168 ocorrências de primeira parte antigas estão preservadas; a árvore preparada atual tem 234, além dos 303 diagnósticos de pacotes. Normal/strict têm payload determinístico idêntico sem a telemetria de duração e grafo byteidêntico. MATCH não encerra a closure semântica.

As referências instalada e compilada foram produzidas em eventos próprios e revistas pelo operador. A [referência instalada](reference-r2-artifact-review.json) serve para comparação de bytes. A [referência compilada](compiled-reference-r2-operator-review.json) demonstra o buildforce real, não segurança; seu helper, 45 fontes, 351 inputs do compilador, 304 dependências e 112 outputs continuam correspondentes e são revalidados pelo leitor. Os commits desses eventos não são renomeados para o commit final. A referência compilada está vinculada à variante física avaliada e não pode ser transferida automaticamente ao checkout principal.

## Pendências concretas

1. Demonstrar a frontier real ainda aberta. O [inventário](remaining-semantic-frontier.json) tem 1.862 ocorrências em 847 arquivos: 569 symlinks, 522 resoluções ambíguas, 335 execuções externas, 236 formatos não suportados, 102 ausências, 67 interops, 29 recusas de parse e duas configurações de resolução. As classes podem se sobrepor por arquivo; não são autorizações para dispensar casos. A [preparação do próximo delta](NEXT.md) orienta o contrato seguinte na mesma frente.
2. Incorporar o [delta aditivo de streams vazios](../empty-artifact-central-delta.json) quando o writer do catálogo central integrar os registros ou liberar o recurso. O catálogo e as evidências alheias não foram alterados. A [checagem documental global observada](documentation-global-qualification-observation.json) encontrou quatro links quebrados e 48 hrefs absolutos em evidências CLAUDE100; o handoff identifica os locais. O [escopo documental próprio passou](documentation-scoped-qualification.json).

O contrato K0–K7 fechado exige novo delta T3 explícito para transferências positivas adicionais ou alteração de contratos públicos de sandbox/bootstrap. Recusas corretas desta versão não concluem H5-P2, P3 ou HISO-005. Nenhum dado real, efeito de provider, push, deploy ou produção foi autorizado por esta qualificação.

## Falhas e limites preservados

O primeiro ciclo de implementação terminou `FAILED_QUALITY_BAR` após duas revisões; suas reproduções e relatórios foram mantidos. A recuperação delimitada substituiu o parser filho por parse nativo dentro do worker supervisionado e criou origens próprias para a nova frontier. O último reparo impede a aquisição de origem por alias recusado, usando descritor canônico com limite e identidade antes/depois. A aprovação final é da fonte reparada; não reclassifica os resultados antigos.

A revisão usa cenários finitos, sem prova formal de JavaScript arbitrário. Os limites, formatos, entradas externas e executáveis nativos desconhecidos continuam bloqueantes. Os [526 arquivos selados anteriores](prior526-preserved-final.json) e os manifests foram conferidos integralmente e permanecem intactos.
