# C1_PARAMETER_ENV_R3 — ambientes de parâmetro e corpo

T2 registrado, autorizado pelas correções contínuas e SPEC0180 aprovada. A revisão estática R2 válida recusou identidades mescladas de parâmetros com expressões e var do corpo, além de referência do corpo ligada ao parâmetro em vez de função local.

Separar identidades conforme ambiente efetivo, incluindo transferência inicial do parâmetro para var quando aplicável. Conservar parâmetros simples, shadow lexical, closure/default/outer e propagação conservadora nos dois fixed points. Apenas quatro arquivos próprios do scratch; originais253, roots, contratos e barras intactos. Novas provas neutras somente parseadas; sem payloads, evaluator, provider ou execução de fixture.

Pronto requer controles antes/depois, positivos simples/nested/block/destructuring, regressões completas da frente, tipos/lint/formato, installed explicitamente INCOMPLETE enquanto desconhecido e nova crítica estática independente válida. Gates integrados permanecem exigidos. Sem promoção/push/produção.
