# Qualificação T2 da composição bc863ac91

Task `CODEX-INCORPORATION:GLOBAL-QUALIFICATION`. A fonte é o commit privado já revisado `bc863ac9147e80b30f38a0614c8a8eb35e9447f4`, com cinco arquivos de componente congelados. A etapa não altera código, contratos, lock ou os artefatos anteriores. O objetivo completo de 18 recortes e 12 comandos permanece aberto.

Materializar a árvore tracked completa na worktree própria, preservando os cinco hashes; usar dependências físicas já existentes e Node 22. TMPDIR curto e privado, outputs `.global-qa/` e evidências desta pasta. Cada execução registra argumentos, ambiente não secreto, PID/grupo próprio, limite, duração, exit, brutos e hashes PRE/POST. Timeout encerra somente o grupo próprio e permanece falha, sem restart automático.

Executar typecheck, lint e `npm test` sem filtros adicionais ou `CVG_TEST_SCOPE=core`. O inventário deve registrar a coleta efetiva, distinguindo skips do resultado executado. Executar os comandos versionados `test:postgres` e `test:e2e` em recursos sintéticos exclusivos. Limites e nomes/portas estão no [registro da task](task.json); apenas um gate longo desta task por vez. A campanha CI003 está ativa e seus caminhos, processos, PG e portas permanecem intocados; a observação atual encontrou 16 CPUs e load de 3,40, sem claim exclusivo da CPU do host.

PG usa a imagem local pinada, loopback efêmero, tmpfs e limites; sem dados ou volumes existentes. Conferir identidade/labels e zero clientes antes da remoção. E2E usa portas 35731/45731 previamente verificadas, configuração canônica, CI sem reaproveitar servidor e resultados vinculados à execução. Não usar endpoints, providers ou credenciais reais.

Uma falha requer classificação por fonte e registro antes de qualquer correção ou repetição. A fonte revisada fica congelada: falhas não autorizam consertar partes reservadas a outros agentes, alterar assertions ou aumentar prazos. Certificação, coverage global, SBOM e licenças permanecem etapas separadas, com seus claims e requisitos.

Condição de saída: resultados reais dos gates disponíveis com identidade e limpeza verificadas, ou falha concreta preservada e próxima ação fundamentada. T2 completo, integração canônica e critérios de paridade só recebem aceite quando todas as suas provas existirem. `originalReturns` continua sem adoção; a pergunta já apresentada não será repetida nesta etapa.
