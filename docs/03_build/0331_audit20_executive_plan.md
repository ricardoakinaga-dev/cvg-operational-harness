# Plano executivo — AUD-20260920-REAUDIT

## Objetivo

Remediar os achados da auditoria `0565`, alinhar gates executáveis ao contrato
de qualidade e produzir um novo candidato controlado, reproduzível e
independentemente auditado. `G20-1` foi autorizado somente para BUILD local,
sintético e descartável; este plano não autoriza integração externa, piloto ou
produção.

## Situação executiva

- `AUD19-016`: encerrada como artefato histórico `CONDITIONAL_GO /
AAA_CONTROLLED` para `d7f5…`;
- nova auditoria: `REJECT` sob a barra QAUD20;
- programa: `IN_PROGRESS / G20-1_AUTHORIZED`;
- engine corrente: `EVOLUTION / BUILD`;
- produção: `NO_GO`;
- risco dominante: gates que podem aprovar um candidato abaixo do contrato;
- primeira decisão humana: `G20-1` foi autorizada no prompt corrente para a
  remediação interna local/sintética/descartável, sem serviços externos e sem
  dados reais. `G20-5` continua separado e não autorizado.

## Resultados esperados

1. Uma única autoridade de qualidade: requisitos, runner, verificador e decisão
   usam os mesmos thresholds e denominadores.
2. Composição PostgreSQL executável por papel least-privilege, com preflight
   semântico e migrações fail-closed.
3. Console e worker homologados exercitando identidade, RLS, readiness e
   recuperação reais no escopo sintético.
4. Egress, replay, approvals e leases com invariantes resistentes a corrida e
   crash.
5. Carga, restore e rollback PostgreSQL com integridade verificável.
6. Novo candidato congelado, pacote integral de evidência, crítica I1 e
   sentinel pós-crítica.

## Frentes executivas

| Frente                  | Resultado                                                 | Tasks               |
| ----------------------- | --------------------------------------------------------- | ------------------- |
| Autoridade de qualidade | 97%, cobertura, skips e Phase 4A tornam-se bloqueantes    | `AUD20-001` a `004` |
| Integridade de runtime  | least privilege, approvals, fencing e egress fechados     | `AUD20-005` a `010` |
| Composição operacional  | auth confiável, worker/health e observabilidade compostos | `AUD20-011` a `013` |
| Recuperação e UX        | load/restore/rollback e UX/browser qualificados           | `AUD20-014` e `015` |
| Evidência e decisão     | CI/candidato/evidência/crítica ligados ao mesmo digest    | `AUD20-016` a `018` |
| Externo/piloto          | validações externas e piloto sob nova autoridade          | `AUD20-019` e `020` |

## Gates e direitos de decisão

| Gate    | Condição                                                        | Autoridade                        |
| ------- | --------------------------------------------------------------- | --------------------------------- |
| `G20-0` | auditoria, plano, roadmap e backlog publicados                  | concluído nesta rodada documental |
| `G20-1` | autorização explícita para BUILD interno W0                     | humano                            |
| `G20-2` | contratos de qualidade executáveis e testes negativos verdes    | auditoria técnica                 |
| `G20-3` | zero achado alto de integridade/composição no escopo controlado | auditoria técnica + humano        |
| `G20-4` | qualificação integral do novo candidato em Node 22              | release/audit                     |
| `G20-5` | autorização para IdP/provider/canal/RPO-RTO/piloto              | humano + owners externos          |
| `G20-6` | crítica I1, sentinel e decisão final                            | auditor independente + humano     |

`G20-1` não concede `G20-5`. Autorizar remediação local não autoriza
credenciais, dados reais, integração, efeito sensível, piloto ou produção.

## Sequenciamento e paralelismo seguro

- `AUD20-001` a `004` congelam primeiro a verdade dos gates.
- `AUD20-005` a `010` podem ser divididas por ownership depois das SPECS, mas
  suas provas PostgreSQL devem convergir no mesmo ambiente descartável.
- `AUD20-011` a `015` dependem das fronteiras de runtime estabilizadas.
- `AUD20-016` e `017` fecham a cadeia de qualificação; nenhuma correção é
  aceita durante a janela do crítico `AUD20-018`.
- `AUD20-019` e `020` permanecem bloqueadas até `G20-5`.

## Controles de escopo

- fixtures exclusivamente sintéticas e descartáveis;
- nenhuma confirmação, cancelação ou reagendamento real;
- nenhuma ação clínica, financeira ou de prontuário;
- RAG somente com fonte institucional aprovada, se futuramente autorizado;
- ação sensível sempre por approval ou handoff;
- sem commit, push, PR, deploy ou produção por inferência deste plano.

## Métricas de sucesso

- 100% dos gates obrigatórios executados, com inventário de skips auditável;
- eval integrado `>=97%` em holdout selado;
- coverage `>=90%` statements/lines/functions, `>=85%` branches e requisito
  crítico provado;
- zero achado P0/P1 aberto no escopo controlado;
- restore valida conteúdo, RLS, roles, grants, outbox e journals;
- candidato, runtime, imagem e evidência vinculados pelo mesmo manifesto;
- crítica final I1 com proveniência e sentinel `MATCH`.

## Estratégia de rollback

Cada task deve ter SPEC, RED/GREEN, migration forward-fix quando aplicável,
rollback ensaiado e registro de supersessão. Mudança que invalide o candidato
reinicia apenas os gates afetados antes do freeze; mudança após o freeze
invalida o candidato inteiro.
