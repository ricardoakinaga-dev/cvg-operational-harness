# Auditoria abrangente do repositório — 21/09/2026

## Decisão executiva

- programa de auditoria: `AUD-20260921-COMPREHENSIVE`;
- baseline observado: branch `main`, `HEAD`
  `05d1f33322a5b75e65ee3b6f0fa1a737c300d7bb`, worktree em evolução;
- nota geral ponderada: **67/100**;
- prontidão para escopo controlado local/sintético: **80/100**;
- prontidão operacional: **49/100**;
- prontidão para produção irrestrita: **28/100**;
- parecer: **REJECT / NO-GO** para produção;
- resultado positivo: base técnica forte, 2.030 testes aprovados, boa cobertura e
  controles importantes de persistência, approvals e certificação;
- motivo do bloqueio: a decisão de certificação ainda pode divergir dos
  achados reais, e existem lacunas altas em identidade, replay, egress,
  worker, CI, recuperação e validação externa.

Este documento registra o estado observado. Ele não apaga a auditoria
[`0565`](0565_code_reaudit_2026-09-20.md), o certificado histórico nem a
evidência de `AUD20-008`; quando houver divergência, o achado mais recente
reabre a decisão e exige nova verificação.

## Escopo, método e limitações

A auditoria comparou documentação, governança, arquitetura, código, testes,
segurança, dados, concorrência, observabilidade, frontend, CI, release e
operação. Foram usados inspeção estática, inventário do repositório,
execução de gates locais e leitura dos artefatos de certificação.

Procedimentos executados no ambiente local:

- Node `v22.23.2`: typecheck `PASS`, lint `PASS`;
- suíte completa: 286 arquivos aprovados, 20 skipped; 2.030 testes aprovados,
  144 skipped; duração de 427,21 s;
- `npm audit --audit-level=high`: zero vulnerabilidades altas;
- readiness: 4/4 `PASS`;
- `git diff --check`: `PASS`;
- identidade Phase 4A: `PASS`;
- verificação mecânica da certificação: `PASS` para o candidato
  `579d2100c172b5157ed42d1cf983988d3401a8c930353b52e50c589578ea55af`,
  run `run-579d2100c172-mub8591x`, com 35 hashes e decisão
  `CONDITIONAL_GO / AAA_CONTROLLED`;
- varredura documental: 43 links reportados, sendo 41 falsos positivos por
  sufixos `:linha` e 2 links relativos realmente incorretos; 12 referências
  absolutas não portáteis;
- 459 JSONs inspecionados em `docs`, `certification` e `.gauntlet`; um JSON
  histórico vazio e inválido;
- inventário documental: 2.792 arquivos, 30.258.817 bytes, 698 Markdown e
  425 JSON.

Limitações: não foram reexecutados Docker, PostgreSQL descartável ou E2E
nesta rodada; não houve acesso a IdP, providers, canais, credenciais, dados
reais ou produção; a worktree continha 202 entradas modificadas ou não
rastreadas e continuou pertencendo ao trabalho em curso. Portanto, a
auditoria não concede validade operacional externa.

## Modelo de pontuação

Cada dimensão foi avaliada de 0 a 100. A nota geral usa pesos de risco e
importância: documentação 8%, arquitetura 10%, código 8%, testes 12%,
segurança 14%, dados 10%, confiabilidade 10%, observabilidade 7%, frontend
6%, CI/release 6%, operação 5% e produção 4%. Resultado ponderado exato:
67,29, arredondado para **67/100**. A nota não substitui blockers: um P0
aberto mantém `NO-GO` mesmo com média superior.

|   # | Dimensão                      | Nota | Avaliação resumida                                                                                 |
| --: | ----------------------------- | ---: | -------------------------------------------------------------------------------------------------- |
|   1 | Documentação e governança     |   58 | Grande volume e boa disciplina, mas estado corrente divergente, links e evidências inconsistentes. |
|   2 | Arquitetura                   |   74 | Modularidade e limites razoáveis; composição real e hotspots ainda frágeis.                        |
|   3 | Qualidade de código           |   76 | Typecheck/lint verdes e bons contratos; arquivos centrais excessivamente grandes.                  |
|   4 | Testes                        |   82 | 2.030 testes aprovados e boa cobertura; 144 skips e mutation guard estreito.                       |
|   5 | Segurança e privacidade       |   57 | Fail-closed parcial; replay, SSRF, autoridade simulada e IP em claro são bloqueantes.              |
|   6 | Dados e migrations            |   84 | Forte evidência PostgreSQL e migrations recentes; resta qualificação real de restore/rollback.     |
|   7 | Confiabilidade e concorrência |   76 | Fencing e idempotência evoluíram; readiness e testes operacionais duráveis ainda incompletos.      |
|   8 | Observabilidade               |   62 | Logs/correlação existem; exportadores, alertas e prova operacional não estão qualificados.         |
|   9 | Frontend e UX                 |   68 | UI funcional e testes de acessibilidade; auth confiável e matriz multibrowser incompletas.         |
|  10 | CI e release                  |   56 | Workflow consistente em Node 22, porém não vincula toda a barra nem a imagem ao candidato.         |
|  11 | Prontidão operacional         |   49 | Runbooks e health existem, mas worker, restore, rollback, alertas e SLOs não foram provados.       |
|  12 | Prontidão para produção       |   28 | IdP, canais, providers, RPO/RTO e signoffs externos continuam ausentes.                            |

## Ranking por impacto e prioridade

| Faixa                         | IDs                 | Quantidade | Regra de tratamento                                                                |
| ----------------------------- | ------------------- | ---------: | ---------------------------------------------------------------------------------- |
| Alto impacto / P0–P1 imediato | `A21-F01`–`A21-F12` |         12 | Bloqueia certificação honesta, release ou operação; corrigir antes de novo freeze. |
| Médio impacto / P1–P2         | `A21-F13`–`A21-F22` |         10 | Corrigir antes de candidato final ou aceitar formalmente com owner e prazo.        |
| Baixo impacto / P2–P3         | `A21-F23`–`A21-F26` |          4 | Resolver na higienização, sem interromper contenção dos P0.                        |

Ordem executiva recomendada: verdade dos gates e do estado; replay/SSRF/rate
privacy; autenticação e worker; CI e release; operação durável; UX e
manutenibilidade; freeze, crítica independente e decisão humana.

## Lista completa e enumerada de problemas

### Alto impacto

1. **A21-F01 — P0 — certificador não incorpora os achados correntes.**
   `certification/findings.json` fornece contagens e scores manuais consumidos
   por `scripts/lib/certification-rules.mjs` e `scripts/phase10-certify.mjs`.
   O mecanismo pode emitir `CONDITIONAL_GO` mesmo quando a auditoria oficial
   conhece P0/P1 abertos. Corrigir com fonte única, computada e fail-closed;
   provar por teste negativo que um P0 atual impede promoção.

2. **A21-F02 — P0 — claim de `jti` ocorre antes da autenticação completa.**
   O fluxo em `apps/api/src/server.ts` e
   `apps/api/src/operator-identity.ts` pode permitir que um token forjado
   reserve previamente o `jti` de um token legítimo. Validar assinatura,
   issuer, audience e tempo antes do claim atômico distribuído.

3. **A21-F03 — P0 — proteção SSRF não vincula o DNS validado ao socket.**
   `packages/shared/src/ssrf.ts` valida endereços e depois entrega o hostname
   a um novo `fetch`; adapters ainda aceitam HTTP com API key. Fixar IP/proxy
   de egress preservando SNI/Host, revalidar redirects e exigir HTTPS fora de
   loopback explicitamente controlado.

4. **A21-F04 — P0 — frontend usa autoridade simulada por padrão.**
   `apps/web/src/api/client.ts` e `apps/web/src/main.tsx` não compõem um
   bootstrap público de identidade confiável. O perfil qualificado deve obter
   tenant, roles e expiração de sessão assinada, nunca de campos digitados.

5. **A21-F05 — P0 — não existe worker qualificado para produção.**
   `apps/worker/src/worker.ts` rejeita produção por desenho e não há caminho
   alternativo certificado. Preservar o fail-closed e implementar um perfil
   operacional somente após SPEC, preflight, credenciais e gate próprios.

6. **A21-F06 — P0 — integrações e decisões humanas externas não foram
   validadas.** IdP, providers, canais, signoff de negócio, privacy/security e
   operação real continuam fora da evidência. Devem permanecer bloqueados
   por autoridade separada, ambiente aprovado e rollback.

7. **A21-F07 — P0 — load, restore e rollback não provam o caminho durável.**
   Os relatórios principais exercitam memória ou estrutura, não conteúdo,
   RLS, grants, outbox, journals e leituras da aplicação restaurada. Criar
   testes PostgreSQL descartáveis e, separadamente, medir RPO/RTO autorizado.

8. **A21-F08 — P0 — CI não executa toda a barra de qualidade.**
   `.github/workflows/verify.yml` não torna obrigatórios coverage crítico,
   mutation, governança de skips, certificação, load, restore, docs completos
   e imagem vinculada. Um merge pode divergir do candidato certificado.

9. **A21-F09 — P0 — readiness/health do worker homologado têm semântica
   incorreta.** `apps/worker/src/homolog-worker.ts` emite ready após o loop e
   acopla health ao sweep. Readiness deve preceder consumo, cair no shutdown e
   health precisa observar dependências sem depender de sucesso do trabalho.

10. **A21-F10 — P0 — rate limiter persiste IP em claro e pode resetar budget.**
    A chave `ip:${request.ip}` expõe dado operacional, enquanto eviction sob
    churn pode remover bucket ativo. Usar pseudonimização/HMAC rotacionável e
    política de expiração que preserve a janela e o budget distribuído.

11. **A21-F11 — P0 — control plane documental está defasado.** A evidência
    `AUD20-008` está `PASS_LOCAL / I1_PENDING`, mas runtime, execution log,
    backlog e índices ainda apontam `AUD20-008` como não iniciada; o backlog
    também mantém `AUD20-001` em progresso. Reconciliar sem apagar histórico.

12. **A21-F12 — P1 alto — observabilidade não está qualificada para operação.**
    Faltam exporter composto, alertas testados, cardinalidade controlada,
    retenção, dashboards/SLOs e comportamento fail-safe diante da queda do
    observability backend.

### Médio impacto

13. **A21-F13 — candidato depende de uma worktree dirty.** Foram observadas
    202 entradas modificadas/não rastreadas. O digest é verificável, mas a
    reprodução e revisão ficam mais frágeis. Congelar uma composição limpa ou
    manifesto completo e imutável antes da decisão final.

14. **A21-F14 — 144 testes permanecem skipped.** O inventário existe, porém
    sua governança não é obrigatória em todo CI. Skip desconhecido, expirado
    ou requerido deve falhar o gate.

15. **A21-F15 — mutation guard cobre apenas três mutantes selecionados.** A
    prova é útil, mas estreita para claims amplos de robustez. Expandir por
    risco em identity, policy, SSRF, replay, approval e persistence.

16. **A21-F16 — UX qualificada apenas em Chromium e auth simulada.** Firefox,
    WebKit, sessão real, troca de tenant, recovery e violações axe moderadas
    não são todos bloqueantes.

17. **A21-F17 — hotspots elevam risco de mudança.** `server.ts` (~5.523 linhas),
    `postgres.ts` (~3.820), runtimes do harness (~2.603/~2.503) e platform web
    (~1.778) concentram responsabilidades. Decompor por comportamento com
    testes de caracterização, sem refatorar tudo de uma vez.

18. **A21-F18 — imagem não é construída e vinculada pelo CI.** O `Dockerfile`
    executa TypeScript via `npx` e copia fonte ampla; o pipeline não prova
    build reproduzível, imagem mínima, non-root, smoke e digest do mesmo run.

19. **A21-F19 — checker documental é incompleto e ruidoso.** Há 41 falsos
    positivos para `:linha`, dois links relativos realmente quebrados em
    `docs/04_audit/evidence/PROD-20260913/PROD-04/report.md` e 12 referências
    absolutas. Corrigir parser, cobertura e portabilidade.

20. **A21-F20 — `AUD20-008` não possui revisão independente I1.** A tarefa tem
    implementação, testes, candidato e manifesto, mas seu próprio resumo
    registra `I1_PENDING`. Não promovê-la a concluída sem parecer fresco e
    sentinel final.

21. **A21-F21 — shell padrão está em Node 24 fora do engine.** O projeto pede
    Node `>=22 <23`; Node 22 está disponível e foi usado nos gates. Fixar o
    runtime nos scripts, CI, imagem e instruções para evitar evidência acidental.

22. **A21-F22 — registros mestres são extensos e duplicam estado.** Runtime,
    log e backlog ultrapassam milhares de linhas e repetem snapshots, o que
    favorece drift. Preservar append-only onde exigido, introduzir índices e
    resumos derivados, e manter uma fonte mutável por tipo de verdade.

### Baixo impacto

23. **A21-F23 — existe JSON histórico vazio e inválido.**
    `docs/04_audit/evidence/AAA/AAA-07/rework-fencing-c6/probe-after.json`
    deve ser preservado com metadado de falha/captura ausente ou substituído
    por artefato JSON válido sem falsificar o evento histórico.

24. **A21-F24 — fallback de IDs usa `Math.random`.** Os fallbacks em
    `packages/harness/src/effect-journal.ts` e na execução operacional não são
    adequados para identidade forte. Usar `crypto.randomUUID()` ou injeção
    determinística controlada em teste.

25. **A21-F25 — `.env.example` não cobre a configuração corrente.** Faltam
    variáveis e descrições para identidade confiável, homolog worker, replay,
    health e telemetria, com valores seguros e sem secrets reais.

26. **A21-F26 — logs vazios não distinguem sucesso de captura ausente.** Vários
    artefatos de evidência têm zero bytes sem sidecar/status. Padronizar
    metadados com comando, exit code, timestamp, ambiente e razão de vazio.

## Evidências positivas e controles que devem ser preservados

- arquitetura modular em `apps`/`packages` e separação razoável de domínios;
- forte base de testes e thresholds globais atuais acima de 90/85/92/90;
- PostgreSQL, RLS, outbox, approvals, causalidade e fencing receberam
  melhorias concretas nas migrations 0021–0025;
- certificação possui identidade de candidato, manifests e hashes;
- comportamento fail-closed e `NO_GO` estão documentados para produção;
- boundaries sensíveis continuam exigindo approval/handoff;
- zero vulnerabilidades `high` relatadas pelo `npm audit` desta rodada.

## Rota de remediação

Os 26 achados são encaminhados pelo [plano executivo
0335](../03_build/0335_comprehensive_remediation_executive_plan.md), pelo
[roadmap 0336](../03_build/0336_comprehensive_remediation_roadmap.md) e pelo
[backlog 0337](../03_build/0337_comprehensive_remediation_backlog.md). O
[prompt 0338](../03_build/0338_codex_full_remediation_prompt.md) prepara uma
execução Codex local, sintética e auditável; ele não autoriza dados reais,
integrações externas, piloto ou produção.

Uma nova aceitação exige: zero P0/P1 alto aberto no escopo controlado; gates
negativos que impeçam regressão; estado, achados e certificador coerentes;
mesmo candidato em código, testes, imagem e evidência; revisão independente;
e decisão humana separada. Produção permanece `NO_GO` até validação externa
e autoridade expressa.
