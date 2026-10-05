# C1_BINDING_OWNERSHIP_R4

T2 registrado dentro da SPEC0180 aprovada e correções contínuas. Crítica estática R3 válida recusou quatro invariantes: BindingElement do corpo mesclado com parâmetro; catch tratado como var; precedência da função em parâmetro simples; expressão fictícia em tipo apagado.

Corrigir ownership pela declaração/ambiente efetivos, excluir catch do ambiente var, preservar binding compartilhado simples e inicialização da função, detectar ContainsExpression só na gramática emitida. Transfers devem ter células diferentes apenas quando exigido e direção inicial correta nos dois fixed points. Conservar erased/runtime nodes e shadow lexical, listas complexas e defaults/closures. Não alterar originais, roots, barras, contratos, nem mascarar unknowns.

Novos controles apenas texto neutro parseado e propagação simbólica; não avaliar/importar fixtures nem gerar payloads. Pronto: repros antes/depois, controles de array/object/computed/catch/type simples/nested, regressões253 anteriores e132 próprias preservadas, tipos/lint/formato e installed explícito; revisão estática independente nova antes integração. Sem provider/env/PG/push/produção.
