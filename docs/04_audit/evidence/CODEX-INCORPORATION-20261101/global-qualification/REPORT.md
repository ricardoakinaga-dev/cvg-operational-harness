# Qualificação da composição — gates executados em 02/11/2026

Candidata privada `bc863ac9147e80b30f38a0614c8a8eb35e9447f4`, fonte previamente revisada. Esta etapa materializou a árvore tracked completa e manteve os cinco hashes de componente. A qualificação T2 ainda não está concluída.

| Gate                    | Evidência atual                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Inventário              | 720 arquivos no escopo padrão: tests154, apps180, products30, packages346, legacy10 |
| Typecheck completo      | PASS, 22,321 s                                                                      |
| Lint completo           | PASS, 21,411 s                                                                      |
| PostgreSQL canônico     | 482 testes em 47 arquivos, PASS, 300,740 s, sem skips                               |
| E2E canônico            | 12 testes Chromium, PASS, 33,145 s; uma tentativa por teste, sem skips ou flaky     |
| npm test completo       | Exit0: 10.136 PASS, 740 skips; 720 arquivos coletados, 2.616,685 s                  |
| PostgreSQL complementar | 392 PASS em 29 arquivos, 120,801 s, sem skips; precondições da fixture corrigidas   |
| Cobertura/certificação  | Não executadas nesta etapa                                                          |

O inventário usa o escopo padrão, incluindo os consumidores de `products/`. O `npm test` mantém `--no-file-parallelism --maxWorkers=2`; os únicos argumentos adicionais são os reporters e o destino JSON. Não herda `CVG_TEST_SCOPE=core`, filtros ou credenciais de banco/provider. Um resultado parcial dessa campanha não fecha o gate.

O [banco próprio](pg-ready.json) usou imagem local pinada, loopback efêmero, tmpfs, memória de2GB, duas CPUs e `fsync=on`. Após os testes, a identidade/labels foram reconferidas, havia zero clientes e zero processos da candidata, e somente esse CID foi removido. A [limpeza](pg-cleanup.json) confirmou remoção, porta livre e exclusão do arquivo de credencial sintética. Bancos e processos dos outros agentes permaneceram intocados.

O [E2E verificado](e2e-verified.json) liga o JSON ao mesmo run/candidate/executionID; cada um dos12casos teve exatamente uma tentativa aprovada. O JSON original e o JUnit foram preservados. Após o gate, os servidores próprios estavam encerrados e as portas35731/45731 livres. Os hashes PRE/POST dos nove inputs de código/configuração/lock coincidem nos dois gates.

Os pares JSON/log em `checks/` guardam comandos, ambiente não secreto, limites, duração, exit e hashes. O [resultado terminal unitário](checks/unit.json) comprova exit0 e ausência de processos residuais. O checkpoint de processo anterior permanece histórico; a sessão69187 terminou e não deve ser reiniciada.

A [reconciliação das pendências](unit-pending-coverage-verified.json) distingue os 740 skips: 355 pertencem aos arquivos completos do PG canônico, com a mesma contagem de casos e nenhum skip; 385 foram correlacionados por arquivo/nome, preservando multiplicidade, ao JSON do complemento aprovado. As contagens reconciliam as 10.876 instâncias de caso declaradas pela coleta unitária entre campanhas distintas. Não é uma execução unitária única sem skips nem soma de todos os contadores como testes distintos. Para os 355 casos, a evidência é por arquivo inteiro com contagem e fonte iguais; não foi fabricado JSON por caso para o primeiro PG.

A primeira campanha complementar registrou 389 PASS, dois FAIL por ausência da role padrão postgres e um skip por falta do optin descartável Phase4A. As [precondições verificadas](remaining-pg-fixture-disposition.json) levaram a uma única correção da fixture: banco novo com bootstrap/owner postgres e os dois flags Phase4A documentados. Os 29 arquivos e seus timeouts/assertions ficaram iguais; a segunda campanha passou392/392. A falha original e seu JSON foram preservados. Ambos os CIDs complementares foram removidos após zero clientes e confirmação de identidade: [limpezaR1](pg-remaining-cleanup-r1.json), [limpezaR2](pg-remaining-cleanup-r2.json).

O primeiro mapper auxiliar esperava o status pending, enquanto o JSON Vitest emitia skipped; a assert rejeitou a contagem antes de aceitá-la. A [errata](pending-mapping-verifier-erratum.json) registra a correção para os mesmos estados usados pela governança existente e a conferência das740ocorrências. Os relatórios originais e os testes de aplicação não foram alterados.

Esta prova qualifica regressões disponíveis da composição, não o owner gerenciado completo, a jornada nativaCQ01–14 ou a CLI. Os18recortes e12comandos permanecem no objetivo integral. `originalReturns` continua sem adoção e aguardando a decisão já solicitada. Não há promoção canônica, push ou liberação de produção.
