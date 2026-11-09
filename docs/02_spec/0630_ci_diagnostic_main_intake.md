# SPEC0630 — intake dos diagnósticos de CI sobre main

Status: DONE_LOCAL; qualificação T2 atual e limpeza verificadas. Task: AUD0627-FOLLOWUP/INT001.
Trilha T2: observabilidade interna de CI; sem mudança de contrato público,
schema, identidade, política de aprovação ou efeito externo real.

## Reconhecimento

A main foi consultada pelo conector GitHub em 02/11/2026:
a2f345a3b7fac79f8a1506d369b9371f92e187c8. A candidata física separada está em
/mnt/dados/cvg-work/aud0627-followup-codex-20261101/main-intake-candidate,
com Git próprio e sem remote configurado. O checkout compartilhado não muda.

CI002 foi qualificada na fonte feeda7e8; CI006, em e98e1d3c0. O commit
CI002 contém 113 caminhos: três de código e 110 documentais. O intake
inclui somente os cinco caminhos de código abaixo, sem importar documentos,
ledgers antigos ou a recuperação CI003 reprovada em531c8d27.

O patch bruto do doador não aplica em scripts/ci-bar.mjs: a base c8be3a516
tem uma captura separada de diagnóstico de segurança da certificação que
não existe nessa main. Esse contexto pertence a outra unidade. O port
adaptará somente a projeção dos resultados nativos ao driver do alvo,
preservando sua semântica existente. O preflight de aplicabilidade falhou
antes de qualquer alteração de fonte e permanece registrado.

Os lockfiles diferem na declaração de desenvolvimento do workspace sandbox:
o doador declara o orchestrator, enquanto a main conserva sua declaração
anterior. O conjunto de entradas, versões, resolved, integrity e links é
idêntico. A cópia física de dependências deve ser validada contra o lock
exato do alvo; nenhum manifest ou lock do doador será importado.

## WHAT e HOW congelados antes do BUILD

| Caminho                                  | Alteração autorizada                                                                                                    |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| scripts/lib/ci-process-diagnostics.mjs   | Copiar bytes qualificados de CI002: status, signal e erro nativo; mensagem limitada a8192caracteres                     |
| tests/ci-bar-process-diagnostics.test.js | Copiar testes qualificados de CI002; CLI real com npm sintético e controles de saída/sinal/ENOENT/timeout               |
| scripts/ci-bar.mjs                       | Importar o helper, projetar resultado após spawnSync e acrescentar campos no log/entry; adaptar ao código exato da main |
| playwright.config.ts                     | Copiar configuração qualificada de CI006: trace retain-on-failure; demais opções iguais à base                          |
| .github/workflows/verify.yml             | Copiar upload diagnóstico separado de CI006, mantendo todos os bytes anteriores e o artefato selado                     |

O driver mantém comando, argumentos, timeout, validações, catálogos,
thresholds, seals, tratamento de saída e decisão de PASS/FAIL do alvo.
O novo diagnóstico não concede sucesso. O upload usa o SHA já fixado,
always() com existência de trace, nome por run/attempt, 90 dias,
if-no-files-found error e arquivos ocultos excluídos.

Nenhuma fonte além dos cinco caminhos poderá ser alterada sem replanejar
o contrato. Não atualizar dependências, lock, snapshots, oráculos ou regras
para obter aprovação. A candidata nova exige resultados atuais; os PASS
das candidatas doadoras são evidência histórica, sem transferência.

## Critérios e verificação

1. Reprodução nativa na base exata: CLI sintético com filho terminado por
   SIGTERM continua FAIL/exit1 e evidencia os metadados hoje ausentes.
   Depois do port, os campos/log preservam SIGTERM e o resultado segue FAIL.
   A closure do CLI copiada para a fixture deve ser byteidêntica à fonte.
2. Os controles existentes de sucesso, saída7, SIGTERM, ENOENT, timeout real
   curto e mensagem limitada passam sem alterar suas asserções.
3. Helper e testes, Playwright e workflow são byteidênticos aos doadores
   qualificados. Só ci-bar.mjs admite adaptação contextual; seu diff deve
   corresponder estritamente a importação, projeção, log e entry.
4. Verificar YAML, artefato separado e invariância do bloco selado.
   Os 12 E2E originais mantêm timeouts, workers, retries configurados e
   binding; o aceite requer uma única tentativa observada por caso.
5. Node22: typecheck, lint, build, suíte core completa, PostgreSQL completo
   e E2E canônico atuais, sem filtros adicionais, skips ou repetição para
   buscar verde. Preservar prazos nativos; recursos sintéticos próprios,
   claim antes de uso, relatórios vinculados à fonte e limpeza conferida.
6. Revisão independente do port antes da qualificação integral, fonte
   congelada e diff limitado aos cinco arquivos. Qualquer falha atual
   permanece registrada e exige diagnóstico antes de outra execução.

Orçamento desta unidade de intake: no máximo duas revisões HOW e duas
CODE, com um retrabalho coerente por atividade. Não reabre CI003/R3 nem
substitui a certificação global ou a autorização de produção.
Push, PR, merge no checkout compartilhado e deploy não fazem parte desta
autorização local; um eventual pedido de push terá fonte e delta concretos.

## Evidências

- [Task e escopo](../04_audit/evidence/AUD0627-FOLLOWUP-CODEX-20261101/ci-diagnostic-main-intake/task.json).
- [Main consultada](../04_audit/evidence/AUD0627-FOLLOWUP-CODEX-20261101/ci-diagnostic-main-intake/remote-main.json).
- [Resultado do reconhecimento](../04_audit/evidence/AUD0627-FOLLOWUP-CODEX-20261101/ci-diagnostic-main-intake/discovery-result.json).
- [Extração somente de código](../04_audit/evidence/AUD0627-FOLLOWUP-CODEX-20261101/ci-diagnostic-main-intake/extraction.json).
- [Qualificação doadora CI006](../04_audit/evidence/AUD0627-FOLLOWUP-CODEX-20261101/ci006-trace/result.json).

## Resultados de 02/11/2026

Fonte privada827212394839205c6ff86588eb9d23a7822a7941, diretamente sobre
maina2f345a3b7fac79f8a1506d369b9371f92e187c8, somente cinco arquivos.
HOWR2FINAL eCODER1 independentes aprovaram sem achados obrigatórios.
Prova RED/GREEN nativa e50testes focais/7arquivos PASS.

| Verificação atual     | Resultado                                                          | Duração  |
| --------------------- | ------------------------------------------------------------------ | -------- |
| Typecheck             | PASS                                                               | 18,88s   |
| Lint                  | PASS                                                               | 17,74s   |
| Build                 | PASS                                                               | 21,64s   |
| Unidade core completa | 9957testes/654arquivos;0falhas, pendências ou todo                 | 2932,56s |
| PostgreSQL completo   | 482testes/47arquivos;0falhas ou pendências                         | 299,35s  |
| E2E canônico          | 12casos/12tentativas;0retry, flaky ou skip; JSON/JUnit/UUID iguais | 42,11s   |

Relatórios, snapshots e hashes do log conferidos na fonte atual; nenhum
resultado de doador foi transferido. O banco próprio foi removido após
zero clientes/produtores; portas32777/29631/29632 livres, TMP e credencial
descartável removidos. O primeiro observador de limpeza saiu1 porque
29631 ainda recusava bind após30s; a falha e a causa desconhecida foram
preservadas. Uma conferência posterior encontrou as portas livres e
concluiu somente a limpeza restante, sem repetir testes ou remover outro
container. Portanto, nem todos os controladores passaram.

[Resultado e evidências](../04_audit/evidence/AUD0627-FOLLOWUP-CODEX-20261101/ci-diagnostic-main-intake/result.json).
Integração canônica, upload hospedado e certificação global continuam
separados. Nenhum push, PR, deploy ou liberação de produção.
