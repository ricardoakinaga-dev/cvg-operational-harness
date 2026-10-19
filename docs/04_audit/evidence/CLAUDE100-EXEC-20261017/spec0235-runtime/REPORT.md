# SPEC0235 — probe nativo local qualificado

**Concluído no escopo local e sintético aprovado.** O probe privado foi integrado ao checkout compartilhado: 27 novos arquivos, byte a byte iguais à candidata certificada. Os 250 testes focados passaram após a integração. A SPEC original e os sete arquivos protegidos permaneceram intactos.

## Resultado observado

O Claude Code 2.1.302 instalado foi executado uma vez sob o perfil contido aprovado, com chave sintética e endpoint local fixo 503. Foram registrados três POST/503 elegíveis e 13 controles aprovados. A consulta de versão encerrou com código 0; o probe encerrou com código 1 pelo erro 503 esperado, sem timeout ou sinal. Isso comprova a porta observada; não é êxito de um modelo.

A [auditoria independente do runtime](review-r1/REPORT.md) aceitou 163 de 163 verificações, sem bloqueios. Os dois containers nativos e o PostgreSQL dos gates foram removidos, com ausência dos IDs exatos conferida. Não foi utilizada conta ou modelo real.

## Validação

A candidata `288119672028afb6f0ea5dcca62dae73247b7033` concluiu os 16 gates em Node 22. O [verificador oficial](final-verify-r1.log) confirmou os 38 hashes e a identidade atual `8ad65c01527dcc1573a8057ea16b033576b089702273737e932d99b318b7a7de`, execução `run-8ad65c01527d-mvdahkmf`.

| Verificação | Resultado |
| --- | --- |
| Unitários gerais | 4.952 aprovados; zero falhas; uma pendência da baseline |
| PostgreSQL | 302/302 |
| E2E | 12/12 |
| Testes focados após integração | 250/250; zero pendências |
| Gates locais | 16/16 |
| Auditoria nativa independente | 163/163 |

A [qualificação NP01–NP10](qualification-result-r1.json) foi aceita no escopo delimitado da SPEC. Ela combina observação nativa com testes unitários e simulados explicitamente identificados. Os [brutos dos gates](cert-r1/archive-manifest.json) e o [recibo de integração](integration-result-r1.json) preservam os vínculos. O certificado mecânico `CONDITIONAL_GO / AAA_CONTROLLED` não concede produção.

A aprovação humana original está em [authority.json](../spec0235-decision/authority.json); o SHA da SPEC continua `aaa12b3ee55021e357fc9a17518316135eb4ca423b87215af754cd18dbb41f04`. Os ciclos anteriores BUILD235 e LEDGER reprovados continuam históricos. A recuperação ORIGIN foi revista e aceita separadamente; nenhum achado anterior foi apagado.

## Integridade e limitações

O [manifesto da captura](capture-manifest-r1.json) vincula 51 arquivos capturados e 48 artefatos de execução. Todos os bytes originais permanecem intactos. Quatro [arquivos auxiliares de navegação](documentation-companions-r1.json) foram acrescentados depois da captura; estão identificados como não capturados e não consumidos pelo probe. O primeiro auxiliar JSON saiu em Markdown, foi detectado pela higiene e corrigido; os bytes dessa tentativa foram preservados separadamente, sem alterar input histórico.

A evidência real cobre o caminho normal observado e sua limpeza. Casos adversariais de caps, cancelamento, crash e falhas combinadas possuem escopos unitários/simulados descritos na matriz; não foram todos reproduzidos com o Claude nativo. O perfil observado não é atestação independente do kernel nem medição dos picos de consumo. O achado LOW `ORPOST-N1` permanece: uma entrada malformada é rejeitada por TypeError antes do diagnóstico tipado; falha fechado e não motivou correção fora do orçamento.

A [higiene deste pacote](final-scoped-hygiene-r1.result.json) passou com 19/19 arquivos vazios catalogados e zero erros. Um snapshot global anterior passou com 410/410; a [checagem global final](final-hygiene-r1.result.json) encontrou um novo log vazio sem registro na frente concorrente CODEX100. Esse arquivo pertence ao outro agente e não foi alterado nem classificado enquanto sua coleta pode estar ativa. O catálogo central recebeu os deltas já verificados e foi liberado para os donos. Metadados desconhecidos permanecem null, sem inferência de êxito. Os quatro links internos quebrados foram resolvidos por navegação adicional. Restam 48 links absolutos em cinco relatórios selados: o [check documental global](global-links-r2.result.json) continua reprovado por portabilidade. Checker, policy, selos e bytes desses relatórios não foram alterados.

## Continuidade do programa

O resultado permanece **REFERENCE_RECON_ONLY**; o relatório bruto conserva `reviewStatus=PENDING`. A revisão aceita é um julgamento separado, não uma reescrita da captura. Esta entrega não concede M1, fechamento de Q01, PASS_CURRENT, produção ou crédito às 117 funcionalidades e aos 17 controles.

A [conferência das dependências de M1](m1-dependency-recon-r1.json) encontrou Q03/Q04 concluídas e sete entregas ainda sem qualificação integrada nesta composição. A próxima ação é desenhar a captura funcional com os contratos desses donos e sua autoridade própria. A aprovação 0235, limitada ao endpoint 503, não autoriza esse BUILD. Nenhum commit no checkout compartilhado, push ou deploy foi realizado.
