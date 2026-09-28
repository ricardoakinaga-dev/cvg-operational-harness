# SPEC-PR301-RLS-001 — negativos reais do preflight RLS

- Trilha: **T2**, teste de um contrato já aprovado; não altera produção,
  schema, policy, papel, configuração de cobertura ou contrato público.
- Task: [PR-301-RLS-NEGATIVE-COVERAGE](../03_build/0356_production_backlog_2026-09-26.md).
- Base: [SPEC 0144](0144_trusted_operator_session_production.md) aprovada,
  [SPEC 0148](0148_coverage_denominator_and_typed_lint.md) preserva o piso
  crítico de 95% sem exclusões nem testes artificiais.
- Estado: `ISOLATED_T2_BUILD_PASS / ROOT_INTEGRATION_PENDING / PRODUCTION_NO_GO`.

## Recon

No branch isolado `ed012a4`, `npm run test:coverage` passou 340 arquivos e
2.578 testes sem skips, com 92,14% de statements globais. O guard
`coverage:critical` falhou porque o grupo RLS tem 165/197 branches
(83,76%) contra piso 95%. O arquivo `tenant-preflight.ts` não foi alterado
na correção OIDC. Há testes de catálogo completo, tabela removida, versão
de migration ausente e role sem grants; faltam negativos específicos para
policy, RLS forçado, colunas e privilégios. [Medição](../04_audit/evidence/PR301-CORP-I1-20260928/critical-coverage.json).

## Contrato de teste

1. Acrescentar ao teste PostgreSQL existente casos que partem de schema
   migrado descartável e o deixam em estado inválido observável: policy
   removida ou relaxada, `FORCE ROW LEVEL SECURITY` desabilitado, coluna
   obrigatória ou índice/constraint ausente, role de serving com privilégio
   de DDL/DML indevido e owner de migração inválido segundo o catálogo.
   O preflight deve falhar fechado com a mensagem
   pública apropriada antes de qualquer serving; o caso íntegro deve passar.
2. A prova de owner usa role de migração separada, role de serving com login
   real e tabela criada pelo owner sintético; tenta depois grants de `CREATE`,
   membership e troca de owner. Cada caso deve provar qual mutação de
   catálogo/role foi aplicada e limpar schema e roles mesmo após falha.
   Não usar dados reais, banco compartilhado
   ou credencial de produção. Evitar asserts internos que apenas espelhem
   expressões do código; usar SQL e o resultado público do preflight.
3. Medir cobertura no mesmo branch, Node 22/PostgreSQL 16, mantendo os
   mesmos arquivos no denominador e o piso 95%. Se testes significativos
   não bastarem, registrar o déficit; não excluir fonte, alterar guard ou
   forçar PASS. `npm test`, `test:postgres`, `typecheck`, lint, formato,
   E2E e crítica independente são gates antes de integrar.

## Limites

Esta fatia não inicia o BUILD amplo da PR-007, que segue dependente da
baseline integrada PR-003 e do claim PR-L04 em `vitest.config.mts`. Nenhum
resultado isolado certifica o candidato de produção. Integração root,
staging corporativo, IAM, CI/atestação e certificado seguem `NO_GO`.

## Resultado local — 28/09/2026

- Commit isolado `42e69f4` acrescenta negativos PostgreSQL reais para drift
  de owner, role, policy, RLS forçado, colunas, constraints e índices; verifica
  rollback e limpa as fixtures. Não modifica código de produto nem o guard.
- Node 22/PostgreSQL 16: `npm test` e cobertura 340 arquivos/2.581 testes,
  sem skips; `test:postgres` 35/261; Chromium 12/12; typecheck, lint e
  formato PASS. A crítica independente fechou os P2 de limpeza e aceitou o
  diff. Zero roles e schemas sintéticos residuais.
- `coverage:critical` PASS: grupo RLS 191/197 branches (96,95%) contra piso
  95%; o denominador permanece 197. [Prova e logs](../04_audit/evidence/PR301-RLS-20260928/proof.json).
- `skip:governance` FAIL por dois hashes vencidos: `SKIP-PG-004` já estava
  divergente sob PR-L04; `SKIP-PG-006` precisa ser reconciliado com este
  teste e sua contagem nova. A integração root, CI, staging e certificação
  do candidato seguem pendentes; produção `NO_GO`.
