# REM21-009 — Discovery

Data: 2026-09-22  
Escopo: `G21-1`, preparação documental local, sintética e descartável.  
Achado: `A21-F06` — validação externa e autoridade humana não qualificadas.

## Autorização e limites

- A fonte operacional é `docs/03_build/0338_codex_full_remediation_prompt.md`;
  o backlog classifica REM21-009 como `BLOCKED_BY_G21-5`.
- Antes de `G21-5` são permitidos somente contratos, mocks/fixtures sintéticos,
  testes de contrato offline, threat model, runbooks, rollback e pacote de
  decisão.
- Não é permitido acessar IdP, provider, canal, endpoint, credencial, secret
  manager, dado real, rede externa, piloto ou produção.
- Nenhum owner, fornecedor, protocolo, URL, orçamento, janela de homologação,
  SLA ou aprovação foi inventado. Campos que dependem de autoridade ficam
  `PENDING`.
- Produção permanece `NO_GO`; toda ação sensível continua exigindo approval ou
  handoff.

## Problema confirmado

O auditoria `docs/04_audit/0566_comprehensive_repository_audit_2026-09-21.md`
registra que IdP, providers, canais, fonte institucional, egress, privacy,
owners, ambiente, rollback e signoff não possuem validação externa. O sistema
tem controles locais úteis, mas eles não demonstram autoridade, contrato,
segredo, disponibilidade ou comportamento de um ambiente externo.

## Superfícies observadas

| Superfície | Evidência local | Estado observado |
|---|---|---|
| Identidade trusted | `apps/api/src/operator-identity.ts`, `apps/api/src/operator-session.ts` | Resolver e sessão sintéticos/inyetáveis existem; não há IdP real, custódia de chave ou tenant mapping externo qualificado. |
| Provider/modelo | `packages/model-gateway/src/contracts.ts`, `packages/model-gateway/src/providers/deterministic.ts` | `ModelProvider` registra `id`, `location`, modelos, correlação e `externalCall`; o provider determinístico é local e não substitui qualificação externa. |
| Canal | `packages/channel-gateway/src/contracts.ts`, `packages/channel-gateway/src/gateway.ts`, `packages/adapters/src/fake/fake-whatsapp-adapter.ts` | Envelopes, idempotência, correlação e adapters fake existem; não há credencial, limite ou janela de canal real validada. |
| RAG/fonte | `packages/rag/src/institutional-rag.ts`, `packages/rag/src/noop-rag-source.ts` | Catálogo local usa publicação/revogação e handoff quando a fonte falta; owner, acervo, hash e ciclo de vida institucionais permanecem pendentes. |
| Egress | `packages/shared/src/ssrf.ts`, `packages/model-gateway/src/providers/ssrf-node.ts` | Guardas locais validam allowlist/DNS/redirect por contrato; isso não autoriza rede ou prova a política do ambiente externo. |
| Handoff | `docs/platform/handoff-engine.md`, `packages/workflows` | Destinos são bounded identifiers sem dispatch; destinos reais exigem contrato e decisão humana. |
| Segurança/rollback | `docs/10_phase10/PHASE10_THREAT_MODEL.md`, `docs/10_phase10/PHASE10_RUNBOOKS.md`, `docs/08_runtime/rollback_playbook.md` | Há controles e runbooks controlados; falta um pacote específico de qualificação externa, abort e owners. |

## Lacunas que REM21-009 deve fechar offline

1. Contrato versionado para IdP, provider, canal, fonte institucional e
   egress, com classificação de dados e limites explícitos.
2. Matriz de autoridade com papel requerido, decisão, escopo, validade,
   revogação, evidência e campos `PENDING` até a autoridade ser identificada.
3. Fixtures sintéticas positivas e negativas para autenticação, tenant,
   correlação, idempotência, redaction, retry, rate limit, source approval,
   egress e approval/handoff.
4. Critérios objetivos de abort/rollback: qualquer segredo, destino não
   allowlisted, ação sensível, fonte sem aprovação, drift, resposta insegura,
   owner ausente ou evidência stale interrompe a qualificação.
5. Runbook de execução futura que não possa ser interpretado como autorização
   de integração; o primeiro passo deve ser confirmar `G21-5` e a autoridade.

## RED documental

O RED desta task é a ausência deliberada de autoridade externa: o pacote não
deve conseguir representar uma qualificação como aprovada quando owner,
ambiente, credencial, endpoint, fonte ou rollback estão ausentes. A prova
offline deve rejeitar fixtures incompletas e aceitar somente um contrato
explicitamente sintético com estado `PENDING`, sem produzir `GO`.

## Gate de Discovery

`DISCOVERY_COMPLETE / EXTERNAL_EXECUTION_BLOCKED_BY_G21-5`.

Os limites, superfícies e lacunas estão confirmados; a documentação pode
seguir para PRD e SPEC. Nenhuma chamada externa foi feita.
