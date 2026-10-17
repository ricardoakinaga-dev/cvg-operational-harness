# 0616 — RESPONSE com contexto completo: aceite local restrito

Data: 16/10/2026. Estado: `APPROVE_SCOPED_NATIVE_MEMORY_R19`.

A candidata R19 recebeu revisão independente e aceite restrito da rota pública com componentes nativos em memória. A [SPEC0224](../02_spec/0224_pare100_complete_tool_result_context.md) permanece no BUILD local aprovado; PostgreSQL, critérios TR01–TR10 completos e gates globais continuam pendentes. O código está no worktree isolado, sem promoção para o diretório principal.

## Comportamento verificado

A composição RESPONSE recebe o resultado completo selecionado da ferramenta pelo pipeline nativo. O contexto é limitado e separado das instruções confiáveis. Decisões e respostas compartilham a contabilidade existente.

A intenção nativa e o saldo já reservado são persistidos antes da entrada no modelo. Uma falha posterior ou perda de confirmação não permite repetir uma tentativa incerta ao recriar a fábrica. A retomada preserva checkpoint, journal e o estado terminal realmente confirmado.

Quando o modelo falha e uma gravação ou auditoria também falha, a resposta conserva a causa original e identifica a falha secundária. O diagnóstico adicional é efêmero: não cria receipt, contador, gate ou schema. Uma reserva nativa pode existir sem entrada no provider; ausência de uso observado não comprova custo real zero.

## Evidências

| Verificação                 | Resultado e limite                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Testes focados              | 36 PASS, incluindo falhas combinadas de modelo/checkpoint/auditoria.                                                                              |
| Regressão de quatro pacotes | 1.012 PASS; 126 SKIP, perfil de memória.                                                                                                          |
| Tipagem e lint              | PASS na fonte congelada.                                                                                                                          |
| Revisão independente I1     | 119 observações válidas; 5.843 asserções recomputadas pelo Lead.                                                                                  |
| Integridade                 | 81 fontes, 383 inputs mais manifesto, 540 invocações de fontes e 125 dependências conferidas; 256 arquivos e 25 diretórios de saída autenticados. |
| Qualificação do verificador | Um positivo e 24 evidências adulteradas recusadas; isso não substitui execução nativa.                                                            |
| Documentação                | Formatação e links PASS no diretório principal e no worktree.                                                                                     |

Seis testes adicionais de referência foram bloqueados pelo guard de subprocessos e **não são PASS**. Um driver inicial de pausa era inválido e foi excluído; o controle corrigido de pausa/retomada passou. Falhas anteriores e correções de medição permanecem preservadas.

- [Aceite restrito e exclusões](evidence/PARE100-EXEC-20261014/spec0224-build/published-adapter-complete/response-repair/acceptance-r19.json).
- [Candidata e vínculos de fonte](evidence/PARE100-EXEC-20261014/spec0224-build/candidate-r19.json).
- [Parecer independente](evidence/PARE100-EXEC-20261014/spec0224-build/published-adapter-complete/response-repair/review-r6/REPORT.md.source.txt).
- [Verificação do Lead](evidence/PARE100-EXEC-20261014/spec0224-build/published-adapter-complete/response-repair/review-lead-verification-r6.json).
- [Checks pendentes e históricos](evidence/PARE100-EXEC-20261014/spec0224-build/published-adapter-complete/response-repair/checks-required.json).

## Continuidade

A proposta do consumidor publicado está em revisão documental separada. A próxima versão deve fechar o estado entre admissão confirmada e primeiro claim interno, sem inventar tentativa ou autoridade interna. Mudanças públicas/schema/segurança exigem seu próprio gate T3; a SPEC0225 continua pendente.

O programa mantém 2 cartões concluídos localmente e 34 abertos. Paridade integral, PostgreSQL da rota RESPONSE, suíte global, E2E, cobertura, certificação, adoção do consumidor, default e release não foram concedidos.
