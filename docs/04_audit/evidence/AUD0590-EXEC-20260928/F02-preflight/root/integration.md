# F02 — integração sintética no root

As três fontes do commit isolado `b73fc47` foram copiadas para o root após
[I2 `ACCEPT_LOCAL`](../I2-review.md). Os SHA-256 dessas fontes coincidem
byte a byte com o [manifesto revisado](../revision/.evidence/i1-proof.json).
O arquivo de matriz PostgreSQL que existiu na primeira versão foi removido
na revisão; seus testes estão em `postgres-persistence-mode.test.ts`, incluído
no comando padrão `test:postgres`.

No root, Node 22.23.2 e PostgreSQL 16.15 descartável em loopback 55594:
typecheck e lint passaram; 48/48 unitários passaram;
`test:postgres` passou 35 arquivos/288 testes; `npm test` passou 328
arquivos/2.481 testes. Os [logs e hashes](proof.json) preservam a execução.
Após os testes, a consulta retornou zero schemas/roles F02 residuais; o
contêiner próprio foi removido. A diferença em relação aos 284 testes PG do
checkout isolado inclui testes de F01 presentes no root.

O root ainda tinha alterações concorrentes fora de F02 durante os gates.
Esta prova confirma a fatia sintética com as três fontes hash-bound; não
constitui certificado de um candidato limpo nem valida CI, E2E, staging ou
release. A59-02/F02 continua aberta para qualificação no SHA definitivo.
`git diff --check` do commit de código passou; a checagem do pacote de
evidência aponta apenas linhas em branco finais dos logs brutos preservados
byte a byte conforme os hashes, sem erro em fonte ou Markdown.
