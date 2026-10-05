# C1 — atribuição de diagnósticos à closure do harness — R8

Task `C1_REACHABLE_DIAGNOSTICS_R8`, T2 local corretivo sob ADR-010/SPEC0180 e autorização contínua.

Recon: core literal sem dependência de produto e produto com acesso escalar desconhecido retornam INCOMPLETE por diagnóstico apenas no produto. Isso confunde barras do harness e consumidor. Atribuir cada diagnóstico de análise/resolução à fonte física; após traversal core, manter todos os diagnósticos alcançáveis e globais. Nada de excluir vendor, testes ou paths por nome. Imports diretos/transitivos/deps de produto continuam FAIL e desconhecidos alcançáveis INCOMPLETE. Inputs inválidos/symlinks e inventário core vazio continuam bloqueados.

Escopo: cópia própria, checker e novos controles estáticos append-only. Originais253/prefixo276 preservados; testes inertes antes/depois, instalado explícito, tipos/lint e crítica independente no freeze. Não concede aceite installed por zero violações, produção ou promoção.

Expansão: a crítica R7 válida reproduziu dois P1 em assignment-pattern wrappers e chamadas de método envoltas, além de P2 em BindingElement var CJS. Corrigir assignedValues/estabilidade/wrapperVar preservando identidades e controles positivos, no mesmo scratch, antes da revisão final R8. Casos novos também cobrem tagged method calls e catch bindings para impedir regressões adjacentes.
