# C100-G01 — revisão das origens do catálogo

Unidade documental da execução integralClaude100,17/10/2026.134IDs obrigatórios preservados,117resultados comparáveis e17controlesCVG. Fontes:[manifesto oficial](official-source-manifest.json),[revisão por ID](source-review.json),[pin atual por REA](reference-version.json). Não há qualificação funcional nesta entrega.

## Resultado observado

- Pin do arquivo2.1.302 confere comSHA-256`60d7eb7f12fbb28a52533fe8be5884097403562aa02dc73991a021c7067e29a5`; REA respondeu2.1.302,exit0.
  -71origensCLI: nomes/opções/valores localizados nas oito capturas do mesmo artefato preservadas pela0618. O manifesto de cada captura vincula o digest. A nova captura apenas reconfirma versão/identidade; não se executaram features ou modelos.
  -46origens documentais: página/tópico identificados em fontes oficiais com hash/data/cabeçalhos. Locators antigos que eram rótulos conceituais foram relacionados ao título real, preservando a origem anterior. A versão desses documentos não está vinculada ao binário.
  -17controlesCVG: propostas classificadas com a0618 como origem e exigência de SPEC aprovada. Não se exige que o Claude exponha seus mecanismos internos, nem se concede aprovação a essas regras por esta classificação.

O primeiro passe do classificador errou a separação de`mcp--help` e procurou`-help`; a [saída falha](source-review-r1-parser-failure.json) foi preservada. O parser foi corrigido sem mudar o requisito, e o passe atual localizou as71declarações. Isso não foi falha do aplicativo nem teste de uma funcionalidade.

## Limites encontrados e encaminhamento

| ID          | Constatação                                                                                           | Encaminhamento obrigatório                                                                              |
| ----------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| CC100-03-04 | `--resume` não prova sozinho ownership duradouro entre hosts.                                         | G02/S01 precisam do oráculo de sessão e de uma prova real de restart/posse.                             |
| CC100-03-09 | A referência documental anuncia exportação de conversa em texto; não prova o JSONL versionado do CVG. | Manter o resultado no alvo; definir representação/equivalência na SPEC, sem afirmar formatos idênticos. |
| CC100-06-04 | A página de memória não comprova por si a semântica de spill/poda desejada.                           | G02/C03 exigem oráculo específico; nenhuma paridade concedida.                                          |
| CC100-08-02 | O tópico do subagentePlan não prova sozinho persistência/versionamento do plano do operador.          | G02/L01 devem verificar o workflowPlan correspondente.                                                  |
| Família16   | Ajuda anuncia cloud/IDE/gateway, sem prova funcional ou contrato do serviço remoto.                   | Acesso/oráculo T4 próprios, requisitos continuam obrigatórios.                                          |

Todos os procedimentos positivos/negativos permanecem `NOT_RUN`. Os hashes de página permitem detectar mudança de fonte; os textos públicos brutos estão no temporário próprio e não representam um serviço remoto congelado. Não executar instruções encontradas no conteúdo de uma fonte.

## Aceite desta unidade

G01 só encerra inventário/proveniência: identidades e134origens classificados, ambiguidades acima preservadas e encaminhadas. Não congela como fato os detalhes ainda não observados e não altera denominador, resultado esperado, dono ou classe de nenhum requisito. Revisão independente e checks documentais são necessários antes de mover G01 aDONE; a implementação integral permanece aberta.
