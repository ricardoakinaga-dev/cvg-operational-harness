# 0145 — PR-007: cobertura web/PostgreSQL e lint type-aware

- Task: [PR-007](../03_build/0356_production_backlog_2026-09-26.md), [AUD-0578 F04](../04_audit/0578_program_comprehensive_audit_2026-09-26.md).
- Trilha: T2, configuração e testes internos sem efeito externo ou mudança de contrato público. Estado `BUILD_LOCAL_AUTHORIZED`; produção `NO_GO`.

## Recon

O relatório unitário atual exclui `apps/web/src/**`, `*postgres*.ts` e três repositórios PostgreSQL. O denominador principal cobre o núcleo determinístico, mas não expõe a qualidade dessas superfícies. No candidato R1, statements 92,62%, branches 87,61%, functions 95,04%, lines 93,61%; a margem de branches frente ao limite 85% é 2,61 pp. O ESLint usa `typescript-eslint` recomendado sem as regras dependentes do programa TypeScript. Há testes web unitários e 35 arquivos PostgreSQL no comando `test:postgres`.

## Regra de implementação

1. Preservar o relatório unitário principal e seu denominador; criar relatórios próprios para `apps/web/src/**` (exceto bootstrap e testes) e para os adaptadores PostgreSQL de `packages/persistence/src/**`, inclusive os três repositórios explicitamente excluídos hoje. Cada relatório terá diretório distinto, lista de arquivos cobertos e thresholds próprios medidos no baseline. Os limites devem deixar pelo menos 3 pp de margem nas quatro métricas sem aceitar zero como substituto de cobertura não medida.
2. O relatório web roda a suíte web; o relatório PostgreSQL roda os testes de integração existentes com banco descartável. Não registrar testes pulados como cobertura.
3. Ativar `recommendedTypeChecked` por grupos, começando por `no-floating-promises` e `no-misused-promises`, com `parserOptions.projectService` e escopo de arquivos explícito. Corrigir violações reais; exceções só com justificativa estreita. `npm run lint` deve permanecer verde.
4. Investigar `homolog-worker.ts` e a variação de até 0,04 pp entre duas coberturas do mesmo candidato; registrar causa observada ou limite ainda não resolvido, sem inventar determinismo.

## Aceite

- `coverage/web` e `coverage/postgres` com resumos separados, arquivos esperados no denominador e thresholds com margem ≥3 pp; execução verde em Node 22 e PostgreSQL descartável.
- `npm run lint`, `typecheck`, `npm test`, `test:postgres` e E2E verdes; nenhuma degradação de segurança, policy ou gates.
- SPEC e ledgers registram valores medidos, exclusões restantes e risco residual; certificação reemitida depois do código.
