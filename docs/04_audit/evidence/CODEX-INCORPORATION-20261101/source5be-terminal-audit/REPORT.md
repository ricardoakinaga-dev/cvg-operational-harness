# Certificação da fonte5be — auditoria final

A execução nativa da revisão `5be0ca7078ceda425a7335eca3c36243dd146ee1` terminou exit0 em7087,269s. Os dezesseis gates passaram. A auditoria de schemas, evidências brutas, hashes e decisão confirmou `AAA_CONTROLLED / CONDITIONAL_GO`, sem release de produção e sem transferir o resultado à branch publicada f2c.

CandidateId `e22cd0bd6ed27b6327dc9d52f1fd92c8278e84946f960e3a1ab0f6ddf51319c1`, run `run-e22cd0bd6ed2-mvz3r9ih`. Os2744inputs foram relidos e re-hasheados: nenhum drift. Os38artefatos do manifesto foram validados, incluindo vínculo de gate, run, candidato e conteúdo. O verificador também exigiu PostgreSQL como gate obrigatório nesta auditoria, além dos quinze gates locais. Não houve nova execução de teste ou aplicação.

## Resultados conferidos

| Recorte           | Resultado atual                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| Unitários core    | 10490PASS,690arquivos, zero falhas ou pendências                                                   |
| PostgreSQL        | 482PASS,47arquivos canônicos completos, zero falhas ou pendências                                  |
| E2E Chromium      | 12casos,12tentativas, zero retry/flaky/skip; JSON/JUnit/log/UUID concordam                         |
| Cobertura geral   | 95,06% statements;92,22% branches;96,06% functions;95,92% lines                                    |
| Núcleo neutro     | 81arquivos de contracts/harness/orchestrator/agent-runtime,100% nos quatro indicadores por arquivo |
| Cobertura crítica | PASS, conforme manifesto e resultado hash-bound do gate                                            |
| Mutation guard    | 10selecionados,10eliminados, zero sobreviventes/erros/timeouts                                     |
| Evals sintéticos  | 48cenários PASS                                                                                    |
| Caos              | 16cenários executados e aprovados                                                                  |
| Carga sintética   | 10000eventos processados, zero perda ou duplicação                                                 |
| Restore sintético | Digest/outbox/isolamento/restauração conferidos; infraestrutura de produção não validada           |

Os counts foram recontados a partir dos assertionResults e comparados aos reports. A lista de arquivos PostgreSQL foi comparada ao script canônico do próprio candidato. O validator E2E exige uma tentativa efetiva por caso; retries configuradas não foram convertidas em aceite de flaky. Os81arquivos de cobertura neutra foram examinados individualmente. Detalhes em [certificate-audit.json](certificate-audit.json) e [execução do inspetor](inspector-execution.json).

## Evidências e recursos

Quarenta e cinco arquivos foram arquivados antes de qualquer limpeza de temporários: manifesto, resultado, relatórios, logs, cobertura e controles de execução. Ver [manifesto do arquivo](archive-manifest.json). O arquivo opcional candidate-qualification.json não foi produzido por este fluxo; a auditoria usou o manifesto efetivo, sem inventá-lo como pré-requisito.

PID1120744, runner1120066 e o grupo nativo não existem mais. Não há processo com cwd na candidata. O CID próprio9d4f foi removido depois de zero clientes; nova consulta confirmou sua ausência. As portas32776/35733/45733 aceitaram bind. A credencial de PostgreSQL já havia sido removida pelo controlador. O TMP exato da task foi removido após arquivo das provas, validação de UID/modo e zero descriptors abertos. Nenhum recurso de outro agente foi limpo. [Auditoria de recursos](resource-audit.json).

## Limite do aceite

Provider, canal e identidade externa permanecem NOT_VALIDATED; humanSignoff permanece PENDING. Os blockers externos A21-F05/A21-F06 continuam restringindo o resultado. Os testes usam fixtures sintéticas e não concedem produção, autorização clínica, execução financeira ou uma decisão humana ausente.

O certificado pertence à fonte5be e ao candidato acima. O port publicado deriva da basea2f e tem outros inputs; precisa de qualificação própria depois da reconciliação documental. O objetivo integral18KR/12CLI/CQ01–14 permanece aberto. A sessão96143 é terminal: não repollar, reiniciar ou repetir por observação expirada.

Foi recuperado um limite relevante para a próxima implementação: o recibo humano36 já aprova a SPEC0302 e seu hash foi conferido, mas proíbe as fatias2/3 de K06 antes do aceite PAR-K01. O backlog canônico observado mantém PAR-K01 IN_PROGRESS, com conformidade I1–I12 nos três hosts e restart ainda como aceite. A certificação aqui não concede esse aceite funcional. Assim, CLI/F5 precisa dessa disposição de dependência, além do wire202; não se inicia S2/S3 nem se pede novamente a mesma aprovação0302. [Disposição e fontes preservadas](dependency-disposition.json).
