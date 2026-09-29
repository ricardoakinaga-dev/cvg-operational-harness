# F02 — preflight de replay PostgreSQL, primeira rodada

**Fonte isolada:** `239442f877ba415919b1a36c1cb09f3219ef9b9e`, base
`3aa5330`. SPEC 0158 hash
`4d4ac269a0843a668e8db21d34f4d8dd7604a5d4d262dc222169756016650380`
aprovada pelo usuário para BUILD sintético. O [manifesto](.evidence/proof.json)
usa `F02-preflight/` como diretório base para os caminhos `.evidence/*` e
conserva hashes de fonte/execução. O arquivo `proof.sha256` foi verificado
após a cópia.

**Verificação do builder:** 98/98 focados, `npm test` 2.446/2.446,
`test:postgres` 258/258, typecheck, lint e formato PASS em Node 22 e
PostgreSQL 16 descartável. O container/porta 55592 foi removido.

**Crítica independente I1:** `REJECT` para o aceite local. O preflight
parece recusar constraint em tabela errada e `CHECK (true)`, mas a matriz
negativa precisa atravessar o boot público com RLS, os casos de
trigger/regra/FK precisam demonstrar a falha operacional antes da correção,
o gate padrão PostgreSQL precisa executar a matriz e campos booleanos
ausentes devem falhar fechado. O builder iniciou a revisão no mesmo
worktree; os hashes deste pacote pertencem **somente à primeira versão**.

Nenhum arquivo F02 foi integrado no root neste pacote. E2E/certificação,
SHA final e produção seguem abertos; `NO_GO`.
