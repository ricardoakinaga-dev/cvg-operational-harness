# C1 — adjudicação do escopo da revisão GREEN-R1

A revisão fresh C1 é válida e REJECT: quatro contraexemplos de origem createRequire produziram falso PASS dentro da gramática existente. Fonte selada e160testes íntegros; esses defeitos serão corrigidos e novamente revisados.

O briefing do Lead incluiu proibição de todas as rotas para “legacy consumer”. Essa exigência foi introduzida no briefing; não foi vinculada a um critério aprovado do perfil SPEC0178, cujo root proibido é products e cuja extração é o Assistente de Plantão. Portanto, os dois fixtures legacy são observações verdadeiras de comportamento, mas o enquadramento como P1 do perfil aprovado exige adjudicação documental/novo perfil. Não remover a observação nem afirmar que legacy está isolado. Não ampliar silenciosamente o gate para quebrar hosts de compatibilidade ativos sob PR-L04. HISO-003 ownership legado e eventual isolamento continuam sujeitos aos respectivos critérios, sem aceitação inferida.

Também o briefing exigiu FAIL para qualquer aquisição dinâmica de namespace builtin. SPEC0178 §Fronteira explicitamente diz “Namespace dinâmico de node:module também reprova” e aceita diagnóstico/recusa da gramática não suportada. Reprovar INCOMPLETE/exit1 é seguro e atende essa recusa, sem afirmar grafo completo. Os testes originais desse contrato permanecerão íntegros. Não mudar INCOMPLETE para PASS nem aprovar a instalação incompleta.

M1 parênteses e M2 globais conhecidos têm correções de precisão planejadas. Função ordinária require só é reconhecida quando sua semântica escalar e ausência de rebind são prováveis; não dispensar parâmetros/expressões opacas por nome.

Próxima crítica recebe somente SPEC0178/qualidade congeladas e candidato exato; nenhuma história ou racional desta adjudicação. Exige rejeição de products nos casos resolvidos e recusa fail-closed de origem/capacidade desconhecida. Decisão de revisão técnica do checker permanece separada de isolamento instalado, dos24critérios e de produção.
