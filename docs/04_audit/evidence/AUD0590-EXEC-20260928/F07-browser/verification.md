# F07 — verificações finais da entrega documental

**Data:** 29/09/2026. Resultados observados pelo líder em chamadas nativas
separadas. A execução agrupada anterior foi bloqueada pela plataforma com
“não foi possível determinar o status de segurança da solicitação”; ela
não executou nem criou `verification.json`.

| Verificação executada                                                                                       | Resultado                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Prettier `--check --ignore-path /dev/null` no relatório, parecer, integridade, status v5, handoff e runbook | Saída 0; documentos formatados.                                                                                                      |
| `npm run docs:check-links` em Node 22.23.2                                                                  | Saída 0; `DOC_LINKS_OK`, `EVIDENCE_HYGIENE_OK`, 683 JSON parseados, 231 vazios históricos catalogados, zero erros e links quebrados. |
| SHA-256 dos 15 artefatos vinculados em `proof.json`                                                         | 15/15 iguais aos hashes registrados.                                                                                                 |
| Integridade após o revisor                                                                                  | 22 inputs e três suplementos conferidos pelo líder; escopo exato em `review-integrity.json`.                                         |
| `git diff --cached --check` em todos os 22 arquivos então staged                                            | Saída 2 por 32 linhas com espaços finais em `matrix.log`, produzidas pelo Playwright. Esse check integral **não é PASS**.            |
| `git diff --cached --check --` nos seis documentos/metadados editados                                       | Saída 0.                                                                                                                             |

O log bruto foi mantido byte a byte para preservar a primeira falha e seu
hash. `matrix-r2.log` não tem linhas com espaços finais. Não foram alterados
regras de whitespace, controles, thresholds ou testes para converter o
check integral em verde. A ressalva é de formatação do recibo bruto; não
modifica o resultado dos testes ou o parecer independente.

Nenhum novo teste de produto, PostgreSQL ou certificado foi executado
nestas verificações finais. Os dois ensaios de navegador anteriores estão
registrados separadamente. F07 integrado e produção permanecem `NO_GO`.
