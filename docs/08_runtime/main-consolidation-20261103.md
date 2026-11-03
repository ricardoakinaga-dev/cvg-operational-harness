# Consolidação das branches — 03/11/2026

Status: IN_PROGRESS. Pedido do usuário: integrar as branches e manter somente main.

## Preservação e integração

As onze pontas originais foram preservadas e verificadas em tags `archive/consolidation-20261103/<branch>`. As sete branches dos PRs 28 e 33–38 tinham árvores idênticas aos respectivos commits squash já ancestrais da main; foram removidas sem reaplicar código antigo.

As quatro branches Codex restantes estão compostas nesta candidata. O host de cleanup da incorporação de runtime substitui a correção mais antiga da PR30. O pipeline atual conserva a autoridade de continuação e o registro físico de efeitos; as regressões da PR30 foram adaptadas ao cancelamento anterior ao dispatch e à preservação do resultado físico já executado. Nenhum contrato público novo ou implementação das propostas CLI/supervisor foi acrescentado.

## Documentos históricos transportados

15 documentos de evidência continham links relativos ao contexto físico original ou caminhos absolutos da máquina anterior. Esses documentos foram transportados como texto histórico `.md.txt`, com os mesmos bytes e SHA-256; não são documentação navegável atual nem evidência executada nesta candidata. O mapa exato em [doc-link-policy.json](../doc-link-policy.json) resolve referências antigas para os arquivos preservados, sem alterar o checker. Manifests históricos conservam seus nomes originais e devem ser interpretados com esse mapa, sem reemitir certificação histórica. Não foram fabricados arquivos, fontes ou aprovações ausentes.

## Validação e pendências

O primeiro teste composto expôs duas expectativas legadas incompatíveis com controles já na main. O resultado reprovado foi conservado no backup local; a adaptação acrescenta um caso de recusa antes do dispatch. Checks locais e CI integral serão registrados antes da integração protegida. Produção continua fora do escopo.

Backup local: `/home/ricardo/cvg-consolidation-backup-20261103`. Recuperação remota: tags de arquivo no mesmo repositório. Não remover tags durante a limpeza de branches.

## Orçamento dos produtores

A CI da PR39 (Verify41440968407) concluiu unit em 3.556.358ms e matou cobertura em 3.600.010ms, com SIGTERM/ETIMEDOUT, sem conclusão de cobertura. A barra executa ambas novamente dentro do certify. O reparo T2 amplia somente os prazos de unit/cobertura para90min, do parentcertify para270min e do job para360min. Os demais produtores conservam60min e os comandos, testes, concorrência, asserções, pisos e critérios de aceite permanecem idênticos. O teto inclui as quatro execuções completas e as etapas adicionais; não transforma a tentativa antiga em PASS.

## Recuperação das branches

| Branch original                                        | SHA preservado                             |
| ------------------------------------------------------ | ------------------------------------------ |
| `candidate/native-certifier-output-freshness-20261023` | `c6e71f79346984ea0fdab47a583111de047472fc` |
| `claude/aud0625-wave2`                                 | `bb23f44996f5aa00241ede2ec309a1550d8c0a9b` |
| `claude/aud0625-wave3`                                 | `834393633ebdb60103d2db9e75320dda58dacd67` |
| `claude/aud0625-wave4`                                 | `6022268943284794d91fcee73f9a91585dc1b6c1` |
| `claude/aud0625-wave5-pr`                              | `07df0bbcf8654517d954bfa64aeb65e7af010657` |
| `claude/aud0625-wave6`                                 | `c05031b402b27eb7c9f5b223f78bd88c76673e25` |
| `claude/aud0625-wave7`                                 | `c8212693103f0ea24fea1e7bc2d5eb918f1e74b9` |
| `codex/aud0627-ci-diagnostic-main-intake-20261102`     | `827212394839205c6ff86588eb9d23a7822a7941` |
| `codex/kernel-i7-disposal-20261027-81c4`               | `ba81cca4f3828365516d68101016961791a1b4e9` |
| `codex/openclaude-runtime-evidence-20261102`           | `df05e85612873d5e9123bbdefd3a34350d5d09b3` |
| `codex/runtime-incorporation-20261102`                 | `d4f72acb3f028aa6d92164491744131e8ed4fb2e` |

## Triagem nativa de segredo

Gitleaks8.28.0 encontrou quatro ocorrências na história importada: três identidades de operação sintéticas e um marcador sintético de teste de redação de erros em patch arquivado. Os quatro arquivos permanecem byte a byte idênticos. Cada exceção usa somente o detector generic-api-key, um path exato e um literal exato, com digest da fonte e linha vinculados no manifesto existente; o teste nativo exige que substituição do valor, mudança de path e regras específicas continuem detectáveis. Nenhuma regex ampla, diretório ou regra foi desativado.

## Primeira CI e reparo do prazo do scanner

A candidata606c5d35b passou supply-chain, image-scan e os dois jobs do produto. Verify41709659904 passou instalação/readiness/formato/tipos/lint/build e chegou ao unit, sem resultado final. Security41709659860/secret-scan foi cancelado no limite do job600s: checkout588s e GitleaksPASS/zeroachados, depois cancelamento no setupNode; prova de fronteira hospedada não executada. O prazo do jobsecret-scan passou de10 para20min, sem mudar fetch-depth0, comandos ou a prova nativa limitada a300s. A rodada antiga não é certificação da nova fonte.

Localmente, formatação completa/links/higiene43839JSON PASS; GitleakscommitsPASS. Primeira prova nativa local atingiu300807ms sobconcorrência (32pares passaram, os4últimos semconclusão). Após os demais processos locais terminarem, a mesma prova/limite passou38/38 semskips em174953ms. Sem mudança de critério ou repetição concorrente.
