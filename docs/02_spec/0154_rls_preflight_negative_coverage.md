# SPEC-PR301-RLS-001 — negativos reais do preflight RLS

- Trilha: **T2**, teste de um contrato já aprovado; não altera produção,
  schema, policy, papel, configuração de cobertura ou contrato público.
- Task: [PR-301-RLS-NEGATIVE-COVERAGE](../03_build/0356_production_backlog_2026-09-26.md).
- Base: [SPEC 0144](0144_trusted_operator_session_production.md) aprovada,
  [SPEC 0148](0148_coverage_denominator_and_typed_lint.md) preserva o piso
  crítico de 95% sem exclusões nem testes artificiais.
- Estado: `SPEC_READY / ISOLATED_T2_BUILD_PENDING / PRODUCTION_NO_GO`.

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
   obrigatória ou índice/constraint ausente e role de serving com privilégio
   de DDL/DML indevido. O preflight deve falhar fechado com a mensagem
   pública apropriada antes de qualquer serving; o caso íntegro deve passar.
2. Cada caso deve provar qual mutação de catálogo/role foi aplicada e limpar
   schema e role mesmo após falha. Não usar dados reais, banco compartilhado
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
