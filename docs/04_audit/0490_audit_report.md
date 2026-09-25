# 0490 — Audit Report

## Parecer vigente — AUD-DOC-001 — 2026-09-05T00:54:31-03:00

Parecer consolidado: Nota geral 69/100; RF 61,4/100; plataforma controlada 85/100; operação real 25/100. AUDIT_COMPLETED_WITH_OPEN_FINDINGS; produção NO-GO. Testes verdes não encerram os achados.

Fonte atual: [relatório integral](0539_documentation_implementation_review.md), [inventário](0540_documentation_review_inventory.json) e [evidências](0541_documentation_review_evidence.json). Auditoria solicitada concluída; correções futuras ainda abertas.

AUD-F07 (P2) adicional: repositório de approval de atendimento aceita escrita de snapshot obsoleto; consumo único de capability approval não prova CAS nessa fila. Reprodução e limites no relatório 0539; remediação futura por gate próprio.

## Registro histórico anterior a esta auditoria

## Status geral

```txt
SCORE: 95/100 PARA CONSTRUCAO CONTROLADA
STATUS: READY_FOR_CONTROLLED_CONSTRUCTION
MOTIVO: runtime MVP executavel, rastreabilidade RF completa, CI definido, migration SQL real, readiness gate automatizado, audit sem vulnerabilidades e rollout sensivel bloqueado por decisao conservadora
```

## Resumo executivo

A auditoria critica reclassifica o projeto como baseline enterprise controlado verificado. O sistema possui runtime executavel, testes unitarios/integracao/E2E, coverage global acima de 80%, audit de dependencias sem vulnerabilidades e decisoes conservadoras para bloquear automacoes sensiveis.

Evidencia executavel: `docs/04_audit/0491_runtime_evidence.md`.
Gate de entrada na construcao: `docs/03_build/0310_construction_readiness_95.md`.

## Riscos

- Confirmar agenda sem regra humana.
- Usar RAG institucional sem fonte versionada e aprovada.
- Usar dado real antes de politica de retencao assinada.
- Mapear cargos reais do hospital sem validacao de RBAC.
- Tratar baseline de piloto como producao irrestrita.

## Pontos fracos atuais

- O baseline usa persistencia em memoria para evidenciar contratos; banco real e migracoes devem ser ativados em fase controlada.
- Papeis genericos ainda nao foram mapeados para cargos reais do hospital.
- Automacoes reais de agenda, RAG, financeiro, prontuario e clinica continuam bloqueadas.

## Pontos fortes

- Blueprint, Discovery, PRD e SPEC criados.
- Gaps conhecidos registrados.
- Audit plan definido antes do build.
- Safety e approvals estao no centro da arquitetura.
- Baseline documental possui teste automatizado com `npm test`.
- RFs do PRD estao mapeados na matriz machine-readable.
- Runtime API/worker/web esta implementado e testado.
- Gate `npm run readiness` valida readiness 95/100.
- CI localizavel em `.github/workflows/verify.yml`.
- Migration inicial PostgreSQL real substituiu placeholder.
- E2E critico cobre inbound, approval, task e audit.
- Coverage global: statements 87.42%, branches 84.88%, functions 87.38%, lines 87.75%.
- `npm audit --audit-level=high` reporta 0 vulnerabilidades.

## Recomendacoes

- Executar piloto controlado com dados ficticios, anonimizados ou aprovados.
- Manter execution log e runtime state atualizados.
- Nao liberar agenda, RAG institucional, financeiro, prontuario ou fluxos clinicos sem novas decisoes PRD/SPEC.
- Preparar banco real, secrets manager, CI e observabilidade externa antes de producao irrestrita.

## Proximo passo

Entrar na fase de construcao controlada: cada sprint deve executar `npm run verify`, `npm run test:e2e` e `npm run readiness`, mantendo dados reais e automacoes sensiveis bloqueados ate nova decisao documentada.

## Nota AUD19-012 — 2026-09-20 (aditiva; original preservado)

A recomendação acima que menciona "dados ... anonimizados ou aprovados" é
lida, por supersessão explícita, como fixtures sintéticas aprovadas em gate.
Dados reais — inclusive anonimizados — são proibidos pela regra do
repositório (`AGENTS.md`). "Aprovado" nunca autoriza dado real.
