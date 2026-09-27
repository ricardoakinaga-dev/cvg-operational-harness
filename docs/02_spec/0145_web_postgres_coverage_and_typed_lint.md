# 0145 — PR-007: cobertura web/PostgreSQL e lint type-aware

- Task: [PR-007](../03_build/0356_production_backlog_2026-09-26.md), [AUD-0578 F04](../04_audit/0578_program_comprehensive_audit_2026-09-26.md).
- Trilha: T2, configuração e testes internos sem efeito externo ou mudança de contrato público. Estado `BUILD_LOCAL_AUTHORIZED`; produção `NO_GO`.

## Recon

O relatório unitário atual exclui `apps/web/src/**`, `*postgres*.ts` e três repositórios PostgreSQL. O denominador principal cobre o núcleo determinístico, mas não expõe a qualidade dessas superfícies. No candidato R1, statements 92,62%, branches 87,61%, functions 95,04%, lines 93,61%; a margem de branches frente ao limite 85% é 2,61 pp. O ESLint usa `typescript-eslint` recomendado sem as regras dependentes do programa TypeScript. Há testes web unitários e 35 arquivos PostgreSQL no comando `test:postgres`.

## Regra de implementação

1. Preservar o relatório unitário principal e seu denominador; criar relatórios próprios para `apps/web/src/**` (exceto bootstrap e testes) e para os adaptadores PostgreSQL de `packages/persistence/src/**`, inclusive os três repositórios explicitamente excluídos hoje. Cada relatório terá diretório distinto, lista de arquivos cobertos e thresholds próprios medidos no baseline. Os limites devem deixar pelo menos 3 pp de margem nas quatro métricas sem aceitar zero como substituto de cobertura não medida.
2. O relatório web roda a suíte web; o relatório PostgreSQL roda os testes de integração existentes com banco descartável. Ambos são gates explícitos da barra CI, com resumos como artefatos. Não registrar testes pulados como cobertura.
3. Ativar `recommendedTypeChecked` por grupos, começando por `no-floating-promises` e `no-misused-promises`, com programa TypeScript explícito e escopo de arquivos definido. Corrigir violações reais; exceções só com justificativa estreita. `npm run lint` deve permanecer verde.
4. Investigar `homolog-worker.ts` e a variação de até 0,04 pp entre duas coberturas do mesmo candidato; registrar causa observada ou limite ainda não resolvido, sem inventar determinismo.

## Aceite

- `coverage/web` e `coverage/postgres` com resumos separados, arquivos esperados no denominador e thresholds com margem ≥3 pp; execução verde em Node 22 e PostgreSQL descartável, inclusive na barra CI.
- `npm run lint`, `typecheck`, `npm test`, `test:postgres` e E2E verdes; nenhuma degradação de segurança, policy ou gates.
- SPEC e ledgers registram valores medidos, exclusões restantes e risco residual; certificação reemitida depois do código.

## Medição e implementação em 27/09/2026

| Superfície | Arquivos fonte | Suíte                         | Statements | Branches | Functions |  Lines | Limites S/B/F/L |
| ---------- | -------------: | ----------------------------- | ---------: | -------: | --------: | -----: | --------------- |
| Web        |             13 | 25 arquivos / 87 testes PASS  |     78,39% |   75,51% |    75,97% | 81,34% | 75/72/72/78%    |
| PostgreSQL |             13 | 35 arquivos / 258 testes PASS |     79,92% |   69,33% |    85,52% | 80,76% | 76/65/81/77%    |

As margens mínimas são 3,34 pp em web e 3,76 pp em PostgreSQL. Os novos
denominadores incluem `App.tsx`, `auth/session.ts`, `postgres.ts`,
`platform-control-plane-repository.ts` e
`tenant-scoped-capability-approval-repository.ts`. `main.tsx` permanece fora
por ser bootstrap; os arquivos de teste e `dist` não contam como fonte.
O wrapper de aprovação por tenant tinha 11,11% de statements na primeira
medição; um teste de integração do fluxo real de `issue`, `get` e
`verifyAndConsume` elevou esse arquivo a 83,33% e confirmou isolamento entre
tenants e ausência de conexão nos casos inválidos.

A primeira tentativa de `projectService` não localizou 34 arquivos TS no
projeto raiz. O lint tipado passou a usar `tsconfig.typecheck.json` explícito,
sem ignorar esses arquivos. O primeiro grupo das regras de
`recommendedTypeChecked` ativa `no-floating-promises` e
`no-misused-promises`; oito achados em testes foram corrigidos com espera dos
efeitos assíncronos e propagação dos erros do servidor HTTP local. `lint`,
`typecheck`, testes focados (55/55 + 2/2 PostgreSQL) e contratos CI (6/6)
passaram. Os dois relatórios são gates bloqueantes do Verify remoto.

`homolog-worker.ts` mede 29,28% de statements no relatório unitário R1.

## Gate remoto de cobertura PostgreSQL — recuperação após SIGKILL

O Verify `36303152180` passou 257/258 testes do gate `coverage:postgres`;
o único erro foi o limite de 20 s da espera por `SUCCEEDED` no teste de
recuperação do worker homolog. O gate PostgreSQL sem instrumentação passou
no mesmo run, e uma reprodução isolada com cobertura passou 3/3 em 8,63 s.
Isto caracteriza instabilidade observada sob a carga do gate completo, sem
provar que o worker falhou. A fatia T2 mantém a asserção de sucesso e outcome
único, aumenta apenas a janela da segunda espera para 30 s e, se expirar,
registra estado/attempt do banco, saída resumida de eventos sintéticos e
estado do processo de recuperação. O timeout do teste continua em 60 s.
Aceite: gate completo `coverage:postgres` e Verify remoto verdes, sem retry
automático, skip ou redução de threshold.

Validação local após a mudança: 35/35 arquivos e 258/258 testes PASS; cobertura
79,92/69,33/85,52/80,76% (statements/branches/functions/lines). O Verify
remoto do novo SHA permanece pendente.

Após a certificação local do SHA `8779437`, a política de skips rejeitou o
hash antigo de `operational-harness-homolog.integration.test.ts`. O campo
`sourceSha256` da entrada `SKIP-PG-014` foi vinculado aos bytes atuais;
35 entradas e as regras de skip ficaram iguais. `skip:governance` passou com
zero skips e zero falhas em unitário, PostgreSQL, chaos e E2E.
Os testes unitários importam validação de configuração e preflight, enquanto
as jornadas do processo real usam `spawn`; é inferência que a cobertura V8 do
processo Vitest não contabilize as linhas executadas no processo filho. O
hotspot permanece sob gates de startup, PostgreSQL e homologação; não se
atribui cobertura fictícia a essas provas. A variação histórica de até 0,04
pp ainda exige duas medições do mesmo código para isolar causa; a comparação
com logs de candidato anterior tem denominadores diferentes e não prova
nondeterminismo.

O teste PostgreSQL ampliado alterou somente o source vinculado a
`SKIP-PG-030`. O catálogo atualiza seu `sourceSha256` de
`13e1dad2a070edf93b12e52ebf0ae220c325e6380600cb6f3e1024eb0974ad65`
para `56087ae982d525330cb6b89fcb48c147116ac3ccc5b05f0d06c9f22e51835a16`;
o motivo, a validade, o dono e `expectedSkippedTests=2` permanecem iguais.
O gate PostgreSQL executou os dois testes, com zero skips. A governança de
skips será verificada novamente sobre o certificado do candidato R2.
