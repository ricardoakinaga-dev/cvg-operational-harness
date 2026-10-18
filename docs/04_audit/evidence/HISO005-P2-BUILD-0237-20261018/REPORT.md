# BUILD0237 — concluído e integrado localmente

O perfil `semantic-kernel-v2-resolution`, com aquisição `linux-rootfd-workspace-v1`, foi implementado, qualificado e integrado por sete arquivos próprios da fonte `84d8d4b4ed053493533d7e9ad55e574a9e6f9047`. Os 14 aceites locais passaram. **HISO005/B6 continua aberto:** a medição integral tem 1.609 diagnósticos e nenhuma prova semântica consumível.

[Estado final](state.json), [14 aceites](ACCEPTANCE.md), [checks documentais](documentation-final-checks.json) e [próxima tarefa](NEXT.md).

## Autoridade e implementação

A [aprovação do usuário](authority-build0237.json) resolveu o gate T3 da SPEC0237, SHA-256 `81f091fa8edaf3ce89543773e24960b4dc9feff3de15f6552940192e9f1ef5f1`, antes do código. A aprovação 0236 permanece válida. O pacote documental anterior e seus bytes continuam selados; a espera humana nele é histórica.

A [fonte congelada](source-freeze-r2.json) contém o helper de aquisição/resolução, integração no engine/CLI, dois arquivos novos de testes e adaptações delimitadas em dois controles anteriores. Treze outros caminhos originais permanecem idênticos à base D8. Produto, manifests, lockfile e API pública não receberam deltas de fonte.

A aquisição usa descritores Linux ancorados, leituras limitadas, UTF-8 estrito, inventários limitados e revalidação dos arquivos, links, manifests e ausências relevantes. A resolução finita preserva modo e ordem de condições. Nativos exatos, self-reference e formas fora do contrato mantêm as recusas previstas. Metadados e resolução permitem analisar o corpo real sob K0–K7; a prova depende do fechamento desse corpo e dos sucessores.

O censo de dependência de produto usa metadados e preserva VIOLATION também sob limites ou recusa. Os percursos de alias examinados não adquiriram corpos de produto. Helper, engine, worker e CLI vinculam hashes, perfil e snapshot de resolução; a recomputação e a revalidação continuam obrigatórias.

## Qualificação atual

| Verificação                   | Resultado                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| Revisão independente R1/R2    | R2 final APPROVE, zero obrigatórios; duas rodadas consumidas                                |
| Regressão focada              | 398 testes em sete arquivos, zero skips, fonte estável                                      |
| Certificação completa Node22  | 16 gates PASS, candidato `c93253f7e1fba8bd426b8109fdb1e492752b2ab2293cf400c6ca88723b54a29f` |
| Suíte completa                | 5.211 testes em439 arquivos, zero falhas/skips                                              |
| PostgreSQL                    | 302 testes, zero falhas/skips                                                               |
| E2E                           | 12 cenários, zero falhas/skips/flaky                                                        |
| Cobertura                     | 94,39% linhas;90,21% branches                                                               |
| Verificador oficial corrente  | 38 hashes confirmados, inclusive após os emits do SDK                                       |
| Consumidor fresco sem produto | 207 imports, 76 exports de runtime, oito pacotes; zero rede/aliases de fonte                |
| Default/P1                    | Report/grafo byteequivalentes nos mesmos inputs; oito pares de erros da CLI também iguais   |

[Qualificação e 38 arquivos preservados](current-qualification-summary.json), [verificador corrente](certification-current-verification.json), [regressão](focused-final-r2.json), [R2 final](review-r2/review.json) e [compatibilidade atual](compatibility-postcert.json). A classificação local `AAA_CONTROLLED`/`CONDITIONAL_GO` do agregado conserva seu escopo de candidata; não concede produção ou aceite B6.

A revisão R1 encontrou um P1 no censo de aliases de produto. A fonte final o corrigiu; cinco testemunhos originais e12combinações novas foram examinados independentemente. Os 1.036 artefatos por âmbito das duas revisões e os 20vínculos de fonte foram conferidos. Nenhuma fonte mudou depois da aprovação final; o orçamento não foi reiniciado.

A [revalidação após os gates](postsdk-input-revalidation.json) confirmou45 inputs,351 fontes do compilador,304 dependências e112 outputs na candidata e na fotografia de compilação. O leitor oficial retornou PROVEN. O [consumidor](consumer-postsdk.json) recompilado na API vigente manteve jornadas controladas, approval/handoff e zero rede. A proveniência da compilação não substitui a prova semântica.

## Fronteira real e continuidade

A [medição integral atual](real-postcert-reconciliation.json), sem allowlist ou aumento de limites, retorna INCOMPLETE/exit1 nos modos normal e strict:

- 537 origens anteriores, todas preservadas e ainda não resolvidas;
- 1.072 novas ocorrências canônicas;1.009 hashes físicos verificados e63 localizações indisponíveis com hash nulo;
- 303 identidades MATCH, zero pacotes semanticamente verificados e zero provas consumíveis;
- payload semântico idêntico após separar a telemetria e grafo byteidêntico.

O [ledger de transição](profile-frontier-multiset-reconciliation.json) guarda integralmente as 1.721 tuplas da fronteira anterior e as 1.072 atuais, com multiplicidade e versões explícitas. Foram conferidos3.266 hashes por registro nas duas fronteiras/baseline. Correspondências por localização são navegação, sem bijeção presumida. Nenhuma redução de contagem recebeu crédito de resolução; os inventários não são somados como locais únicos do programa. Os [4.532 arquivos selados anteriores](prior-sealed-preserved-final.json) permanecem intactos.

O [inventário por causa](qualified-frontier-triage.json) registra cada desconhecido. A próxima ação é estudar uma causa por vez, com testemunhos físicos e HOW delimitado. HISO005/P2/P3/B6 continuam abertos; qualquer expansão positiva posterior segue seu próprio gate T3.

## Integração e encerramento

A [promoção](promotion-receipt.json) copiou somente os sete deltas próprios após conferir as pré-imagens. Os 77caminhos protegidos, HEAD e índice ficaram intactos. O checkout compartilhado permanece misturado e [foi observado separadamente](root-post-promotion-observation.json): default528 diagnósticos; semântica1573 e compiledUNAVAILABLE para receipt de outra raiz física. A certificação da candidata não foi transferida ao root.

O [PG próprio foi removido](cleanup-owned-runtime.json) por ID/rótulo verificados, após zero sessões de cliente. Portas56239/3416/4416livres, nenhum processo próprio residual. Os [invariantes finais](final-invariants.json) confirmam fonte20,Root7/77,índice,arquivos das revisões e38artefatos preservados. Os outputs de qualificação esperados permanecem na candidata; sua fonte está limpa, a árvore completa contém os artefatos gerados. Sem commitroot,push,deploy ou produção.

## Tentativas e correções preservadas

A [tentativa 1](qualification-attempt1-preservation.json) passou em quatro gates e registrou5.119 PASS/92 FAIL, sem skips; as 92falhas eram ENOENT em dois testes antigos que leem outputs de runtime. O grupo próprio foi interrompido durante cobertura, sem crédito aos gates restantes. Seus artefatos e ausências foram preservados antes de reancorar somente os outputs gerados próprios ao commit. A [preparação corrigida](retry-preparation.json) gerou o runtime, recompilou shared/contracts e reproduziu93 controles PASS. A tentativa 2 completa usou banco sintético novo e a mesma fonte `84d8d4b4`.

A primeira preparação do consumidor também usou `tsc -b` diretamente e falhou por aliases. A cópia fresca seguinte usou o build de runtime e SDK sem aliases; a receita e os comandos estão preservados em [preparação do consumidor](consumer-fresh-preparation.json). O observador posterior foi ajustado para reproduzir os filtros originais do tar, inclusive produtos em fixtures históricas, e separar os 32 outputs de certificação dos inputs de fonte do consumidor. O verificador corrente vincula esses artefatos separadamente.

A [captura preliminar](real-precert-baseline-limit.json) tinha31 origens de arquivos gerados ausentes antes do build e não recebeu crédito de baseline. Mais tarde, a comparação com a fronteira completaD8 identificou nove outputs SDK ausentes, correspondentes a17 ocorrências. Foram gerados21 outputs a partir da fonte atual, com os mesmos hashes doD8/consumidor. [Paridade física](sdk-physical-parity.json), [comando real](sdk-physical-parity-command.json) e [captura anterior preservada](measurement-before-sdk-parity/preservation.json). A nova medição foi realmente executada depois dessa correção; ela é a base dos números finais1609. Os emits SDK não receberam autoridade semântica compilada.

A reconciliação do observador também corrigiu a comparação da localização vazia com `reportedFile:null`, conforme o emissor já existente. Os bytes e IDs das capturas foram preservados; nenhuma origem indisponível recebeu hash retroativo. [Registro da correção](postcheck-null-origin-reconciliation.json). Todas essas correções são da preparação/observação, separadas da fonte congelada e das duas revisões de código.
