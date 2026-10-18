# Adendo de correção ER06 — R2 selada

**ACCEPT_SCOPED_HOW mantido para os siblings formatados; zero obrigatórios.** Este adendo corrige a evidência de formato e vincula os novos bytes à mesma semântica aprovada. Não é nova rodada, não reabre a R1 nem modifica o relatório/result/manifesto da R2 selada. O orçamento de preparação permanece2/2.

## Correção explícita

A avaliação anterior usou recibos de Prettier com exit0 sem comprovar que os arquivos tinham sido examinados. **Esse uso como evidência de formato foi inadequado.** Os caminhos de evidence eram ignorados; os recibos originais não satisfaziam o subcritério de formatação de ER06. Permanecem registros históricos de uma checagem ignorada, sem PASS retroativo para os originais.

Os [recibos corretivos](sources/00-format-correction.json.source.txt) identificam quatro arquivos não formatados e quatro siblings novos, com os originais preservados. Repeti somente o [check direcionado dos quatro siblings](forced-format-command.json), com `--ignore-path /dev/null --check`: exit0, stdout confirma formato, stderr vazio registrado no JSON. Esta é evidência de execução de formato nos novos arquivos, sem gate amplo ou teste de produto.

**ER06 fica corrigido para os inputs correntes formatados**, em conjunto com as demais condições já registradas emR1/R2; não se altera a autoridade humana, a SPECf26c, a interpretação de entrada ou o conteúdo do HOW.

## Identidade dos quatro pares

| Input corrente | SHA-256 |
| --- | --- |
| `foundation0225-entry-reconciliation/entry-reconciliation.formatted.md` | `50ff49d4503463b62406ed63d12b7a9cd53d0683820e418f104d321676cdda5f` |
| `foundation0225-entry-reconciliation/task.formatted.json` | `56662b0082f1c361b28d7f985d3facf4b6b40bf77d014b8b6aa3d89137d61701` |
| `journal0225-build/short-how.formatted.md` | `f33c7fbfeecdbd2252fa45af626fb8b0f04cc7d9df259cbb9abb7d7b8019b2d0` |
| `journal0225-build/task.formatted.json` | `40ac249d7d7600bf788af7d9d55ee9fab2051b0261c42297e3c9397ca820091d` |

[Hashes dos pares](pair-hash-inspection.json): todos os oito digests coincidem com o recibo; os originais continuam nos hashes congelados. A [inspeção semântica](semantic-inspection.json) confirma que cada sibling é exatamente a saída determinística do formatter sobre seu original.

Os dois JSONs têm igualdade estrutural. Os dois Markdown têm árvores sintáticas iguais após remover somente metadados de posição/raw e normalizar espaços/quebras suaves em nós de texto; estrutura, numeração de listas, código/inlineCode, destinos de links e valores são conservados. A [inspeção mais estrita](semantic-inspection-stronger-command.json) preserva também os atributos start/end de listas. Os quatro diffs foram lidos: no entry há redistribuição de espaços/quebras no parágrafo das condições; no HOW há uma indentação de continuação; nos JSONs há compactação de arrays. Nenhuma condição de0029→0030→0031, guarda, testeJ13/J16, aceite dependente ou dívidaP0 desapareceu.

Os destinos de links permanecem iguais e resolvem localmente: três no entry, nenhum linkMarkdown no HOW. Os recibos do Lead registram zero links quebrados para ambos. Os originais e seus seals não foram editados para obter esse resultado. Os bindings completos original→corrente constam do [resultado](result.json); o aceite do desenho passa a esses siblings por identidade semântica demonstrada, sem fingir que seus hashes são os mesmos.

## Candidata e alcance

O [recibo de preparação](sources/01-candidate-preparation.json.source.txt) foi lido como registro, não como autoridade. [Inspeção estática própria](candidate-static-inspection.json) confirma a candidata nova em2f0cc11f limpa,11pré-imagens/9proteções exatas, inventário0029 presente e0030/0031 ausentes. Um payloadTypeScript coincide por hash e difere por inode da base, apoiando a cópia física nessa amostra; não se afirma auditoria de toda a árvore de dependências.

O recibo declara `implementation_started=false` e `PG_created=false`; não inspecionei Docker/PG/processos para atestar ausência global. Nenhuma fonte, SQL ou teste foi executado/editado por esta correção. Node foi usado somente para formatter e análise de documentos. Não houve instalação, rede, provider, processo de aplicação, recurso de processo ou descendente.

Claims/checklists de fonte, manifestos runtime, recursos/identidades/roles/schema/portas/cleanup, readiness, provas e gates de encerramento continuam os daR2. Nenhum novo BUILD/PG ou crédito funcional é concedido por este adendo. A futura crítica de código permanece unidade distinta. A correção de formato, sem mudança semântica, não exige repetir decisão humana.

## Preservação e entrega

[Antes/depois dos inputs](beforeafter.json):16arquivos idênticos. [Seals preservados](sealed-beforeafter.json):139artefatosR1,77artefatosR2 e seus quatro arquivos de manifesto/digest idênticos. A R2 original continua vinculada ao manifesto `83502b94e581db610025f570c20c0b98dd3e01e8bebbe0a122ffcbd14537e291`; a R1 conserva seu manifesto anterior.

Este adendo tem [manifesto próprio](manifest.json), cobrindo somente os novos artefatos deste subdiretório, exceto seu próprio manifesto/digest. O manifesto anterior continua autenticando o conjunto histórico selado; não é reescrito para incluir o adendo posterior. Escrita exclusiva emformat-addendum dentro do how-review-r2 autorizado.

Próxima ação: Lead usar os quatro siblings correntes e este adendo no checklist antes de código, preservando todos os limites daR2. Nenhum retrabalho de conteúdo ou terceira revisão foi criado.
