# 0389 — Frente única: prova positiva de isolamento HISO-005/B6

Task de preparação `HISO005-PROOF-PLAN-20261017`. Pedido do usuário: seguir uma frente de cada vez. A frente desta sessão é HISO-005/B6; CI, produção e paridades não são executados por esta unidade. Claims concorrentes de outros responsáveis não são cancelados.

## Estado confirmado

A candidata `f11f762f6a176417a40d2d53bdb67c633d7e1cef` contém a SPEC0228 verificada. O principal conserva seu código anterior; não há integração automática. A fronteira da candidata tem471diagnósticos:303instalados,95execuções dinâmicas,69escapes de loader e4propriedades de loader. Todos os instalados permanecem não verificados; nenhuma exceção é aplicada. [Baseline e recon atual](../04_audit/evidence/HISO005-PROOF-PLAN-20261017/recon.json).

Recon readonly: os303artefatos de cache comprimidos existem e correspondem ao SHA-512 do lock,60.775.410bytes examinados, usando a convenção do cacache instalado no npm10.9.8/Node22.23.2. Isso demonstra disponibilidade de entrada offline, não identidade dos arquivos instalados ou semântica segura. Nenhum arquivo foi extraído ou instalado.

## Resultado da frente inteira

HISO-005 só termina quando o gate e a reauditoria demonstrarem fronteira real, incluindo os controles negativos conhecidos, instalados/transitivos, loaders e receptores, sem desconhecidos ocultos ou supressões nominais. Comparação de bytes isolada não concede PASS. HISO-014/produção têm aceites próprios e não são concluídos por esta frente.

| Marco | Entrega necessária                                                                                                                                                          | Estado e gate                                                                      |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| H5-P0 | Baseline congelada, classes de incerteza e plano integral; primeiro contrato concreto revisado                                                                              | T1 em execução nesta unidade                                                       |
| H5-P1 | Identidade de conteúdo instalado contra referência offline construída independentemente da árvore avaliada                                                                  | SPEC0234 proposta; BUILD T3 depende de revisão explícita do usuário                |
| H5-P2 | Resolver a fronteira semântica dos instalados e168diagnósticos de primeira parte; provar receptores/implementações/configuração e espelhos; manter desconhecidos explícitos | Contrato posterior, não aprovado pela0234; nenhuma tabela reativada por associação |
| H5-P3 | Integrar os mecanismos aprovados em candidata própria, executar controles e gates completos, consumidor sem produto/aliases, crítica independente e nova B6                 | Pendente de P1/P2; aceite de isolamento só com a prova completa                    |

P1 pode revelar arquivos extras/mismatch e referências opacas antes não vinculadas. P2 deve incorporar essas evidências, não trocar o denominador303/168 ou ignorar casos para fabricar verde. Estagnação ou incompatibilidade exige replanejamento explícito da mesma frente.

## Primeiro passo concreto e autoridade

A [SPEC0234](../02_spec/0234_b6_installed_content_identity.md) propõe referência offline via npm fixado, scripts desativados e cache próprio, seguida de comparação física completa. Sua saída de identidade é separada de `verified`; mesmo MATCH continua INCOMPLETE enquanto faltar prova semântica. Sem implementação antes da revisão humanaT3. A autorização da0228 excluiu explicitamente esse mecanismo futuro.

A preparação registra claim, hashes, disponibilidade de cache, revisão técnica, pacote de decisão e continuidade. Apenas HISO-005 recebe subtask própria; os ledgers preservam seus corpos anteriores. Nenhuma fonte de checker/runtime/lock/workflow, candidata ou evidência anterior é alterada nesta preparação.

## Critério de continuidade

Depois da SPEC concreta e da crítica: apresentar ao usuário o hash, as decisões de confiança e os aceites. Com aprovação, executar P1 e seus gates em recursos próprios, mantendo a frente inteira aberta atéP3. Sem aprovação, aguardar o gate legítimo; não iniciar outra frente nem interpretar silêncio como autorização.
