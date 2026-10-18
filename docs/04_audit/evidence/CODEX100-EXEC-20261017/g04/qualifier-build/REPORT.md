# Qualificador Codex — BUILD local concluído

A subtask **DX100-Q01-QUALIFIER-001 está concluída no escopo do mecanismo local**, com a [aprovação humana](authority.json) da SPEC0231/e3af, [12 critérios aceitos](acceptance-status.json) e [nove arquivos integrados](integration-result.json) ao repositório principal. O qualificador compartilha o motor Claude100 e preserva seu comportamento padrão. A jornada nativa completa e a paridade das funções continuam pendentes.

A implementação acrescenta a CLI `scripts/codex100-qualify.mjs`, o perfil de catálogo CODEX-CAP-v1 e a baseline obrigatória de 509 bindings. O perfil Codex recusa arredondamentos de inteiros e perda decimal antes da comparação JSON; `EXACT_BYTES` conserva as distinções fora desse domínio. Catálogo, capturas e decisões são dados validados, sem escolher módulos ou callbacks executáveis.

A [revisão independente final](code-review-r2/review.json) aprovou o código com zero achados obrigatórios e 86 controles próprios. O P1 da primeira revisão foi corrigido por uma varredura linear, com contraprovas pelo parser e pela CLI. Os nove originais R1 e as falhas iniciais permanecem preservados. Os dois reviews e o único retrabalho desta unidade foram consumidos.

| Verificação                       | Resultado                                                                     | Evidência                                                                   |
| --------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Certificação da candidata         | 16 gates PASS; CONDITIONAL_GO / AAA_CONTROLLED                                | [Cópia autenticada](certificate-copy-verification.json)                     |
| Verificador corrente              | Exit0; 38 hashes conferidos, candidata atual reconhecida                      | [Execução](certification-verify-r1.execution.json)                          |
| Suíte completa                    | 4.801 PASS, zero falhas/skips                                                 | [Resultado certificado](certification-r1/certification/phase10-result.json) |
| PostgreSQL                        | 302 PASS, zero falhas/skips                                                   | Mesmo certificado                                                           |
| E2E                               | 12 PASS, zero falhas/skips/flaky                                              | Mesmo certificado                                                           |
| Regressão no Root após integração | 539 PASS, incluindo 399 casos Claude preservados                              | [Relatório](Root-focused.report.json)                                       |
| Reuso documental existente        | 58 PASS; três arquivos iguais ao componente0233 já revisado                   | [Reuso](reuse-doc-baseline-task.json)                                       |
| Integração e isolamento           | 9 pós-imagens iguais; 37 fontes C100 protegidas; índice Root intacto          | [Integração](integration-result.json)                                       |
| Limpeza                           | PG próprio removido por ID/label, zero conexões; portas56331/3431/4431 livres | [Recibo](owned-postgres-cleanup.json)                                       |

A cobertura certificada foi 93,43% em statements, 90,17% em branches, 95,57% em functions e 94,35% em lines. O certificado pertence à candidata `f220420075a10d59a7a4f5aa8a9cb79579900eec`, ID `bc502f2180d9555aeff0aa15024008427d32c884080c0fb34bb3b296b82d1c10`. O checkout compartilhado recebe somente o delta e sua prova por fechamento de fontes; não herda uma certificação global.

A primeira suíte ampla falhou por 94 condições de preparação. As falhas originais foram preservadas: 92 foram resolvidas pelo build existente dos20workspaces, uma pela confirmação do PostgreSQL realmente descartável e a última pelo reuso byte-exato do componente documental0233 já revisado. Nenhum checker, política, pin, fixture de runtime ou limiar foi alterado para obter o resultado.

O resultado `CONDITIONAL_GO / AAA_CONTROLLED` mantém as condições externas de provider/canal/identidade e signoff, sem release produtivo. Não houve push, deploy, dado real ou nova aprovação institucional. Os 509 registros do catálogo continuam NOT_RUN/receipt null; esta ferramenta não concede paridade por si mesma. O cartão DX100-Q01 integral permanece aberto até CQ01–14 e seus demais aceites.

Próxima unidade: resolver as interfaces canônicas de persistência, ownership/fence e ACK de0221/0225 para a SPEC da jornada nativa completa, usando o [mapa de cinco portas e14CQ](../native-journey-contract-recon/source-recon.json). O recorte de fonte não comprova execução e não autoriza novo BUILD de runtime ou adoção default0226.
