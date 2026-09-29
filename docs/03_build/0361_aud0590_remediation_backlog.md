# Backlog complementar de correção — AUD-0590

**Data-base:** 28/09/2026. **Estado:** proposta documental; produção `NO_GO`.
**Fontes:** [achados F01–F15 da auditoria](../04_audit/0590_deep_system_audit_2026-09-28.md#5-achados-prioritários-e-critérios-de-fechamento),
[roadmap 0360](0360_aud0590_remediation_roadmap.md),
[backlog canônico 0356](0356_production_backlog_2026-09-26.md) e
[13 condições de liberação](0354_production_executive_plan_2026-09-26.md#2-definição-de-pronto-para-produção).

Este arquivo é um **índice de execução e aceite** dos achados da AUD-0590.
Os IDs `A59-xx` identificam cartões de rastreio, sem substituir ou alterar o
status das tasks `PR-*` do 0356. Antes de BUILD, o executor deve conferir
status atual, claim, SPEC e decisão humana aplicável. `P0-R` significa
bloqueio de promoção, não incidente crítico demonstrado. As observações da
auditoria valem para sua baseline, não automaticamente para branches isolados
ou para o código que outros agentes estejam modificando agora.

## Ordem 1 — Segurança e composição básica

### A59-01 — Replay temporal do webhook · F01 · P1 · M1

- **Dono sugerido / task canônica:** backend e segurança;
  `PR-301-WEBHOOK-REPLAY` no [0356](0356_production_backlog_2026-09-26.md).
- **O quê/onde:** corrigir janela de retenção e relógio no verificador e no
  store de replay de `apps/api/src/webhook-security.ts`/PostgreSQL; incorporar
  high-water e reconciliação somente sob SPEC/gate próprios.
- **Como/dependência:** preservar prova F01 `[true,false,true]` como negativo;
  usar SPEC 0160 aprovada para a fatia autorizada e submeter a SPEC 0162 à
  revisão humana T3 antes de migration 0028. Respeitar o claim ativo do patch.
- **Pronto:** timestamp futuro válido é aceito uma vez e recusado durante toda
  a janela assinada, inclusive após reinício, concorrência, skew e expiração;
  estado incerto não dispara efeito duplicado. Testes HTTP + PostgreSQL
  descartável no SHA integrado; sem alegar deduplicação do destino externo.

### A59-02 — Preflight de constraint real · F02 · P1 · M1

- **Dono / task:** backend/segurança; `PR-301-FENCING-CONSTRAINT-PREFLIGHT`.
- **O quê/onde:** `apps/api/src/tenant-preflight.ts`, migrations 0002/0025 e
  negativos PostgreSQL.
- **Como/dependência:** SPEC 0158 pronta para revisão humana T3; validar OID
  da tabela, tipo, expressão, `convalidated`, colunas/índices e privilégio,
  além de uma operação negativa na relação correta.
- **Pronto:** boot recusa constraint homônima em tabela-isca, `CHECK(true)`,
  constraint não validada ou semântica divergente; aceita a migration íntegra
  com role de serving sem DDL. Prova em PostgreSQL descartável, integrada ao
  candidato, sem baixar o preflight.

### A59-03 — Redação antes de todos os sinks · F03 · P1 antes de exportação · M1

- **Dono / tasks:** observabilidade e privacidade; `PR-403` e `PR-604`.
- **O quê/onde:** `packages/observability/src/otel.ts` e adapters de métricas,
  traces e logs; contrato único de minimização por chave/valor.
- **Como/dependência:** SPEC T3 para alteração da fronteira de dados; usar
  marcadores sintéticos sob `authorization`, `api_key` e variantes, inclusive
  atributos definidos depois de `startSpan` e em spans filhos.
- **Pronto:** tracer/exporter falso não recebe o marcador bruto em nenhum
  caminho; logs e buffer seguem a mesma regra; teste de regressão inspeciona
  a entrada do SDK e a saída dos sinks. Falha da redação bloqueia exportação.

### A59-04 — Sessão confiável no entrypoint publicado · F04 · P1 · M2

- **Dono / tasks:** identidade/API/web; `PR-301`, `PR-302`, `PR-204`.
- **O quê/onde:** `apps/api/src/main.ts`, composição em `server.ts`, store
  PostgreSQL de sessão e `apps/web/src/auth/session.ts`.
- **Como/dependência:** integrar fatias locais já existentes após liberação de
  PR-L04; exigir IdP/MFA e contexto tenant/RBAC; preservar falha fechada sem
  store. Não contar teste com store injetado como prova do entrypoint.
- **Pronto:** processo publicado inicia com store durável; login e recarga só
  por cookie funcionam entre duas instâncias; logout, revogação, expiração,
  tenant errado e indisponibilidade são testados por API e navegador com
  PostgreSQL. Sem sessão válida, rotas protegidas recusam acesso.

### A59-05 — Dependências auditadas · F05 · P1/P2 · M1

- **Dono / task:** supply chain; `PR-205`, com claim exclusivo do lockfile.
- **O quê/onde:** resolução de `fast-uri` produtivo e `undici` via `jsdom`,
  `package-lock.json` e testes de validação/URI afetados.
- **Como/dependência:** confirmar advisories e árvore no momento da execução;
  atualizar a menor resolução compatível; não inferir exploração do produto
  somente pela presença do pacote.
- **Pronto:** auditoria do lockfile e `npm ls` não mostram advisories
  aplicáveis sem adjudicação; build, tipos, testes de regressão e E2E passam
  em Node 22 no candidato integrado. `fast-uri` é prioridade produtiva;
  `undici` de teste é P2 salvo prova nova.

### A59-06 — Serving sem credencial DDL · F10 · P1 · M2

- **Dono / tasks:** dados/plataforma; `PR-405` e `PR-603`.
- **O quê/onde:** `buildServerFromEnv`, pools, job de migration e deployment.
- **Como/dependência:** SPEC T3 e rollout compatível; migração roda em job
  controlado antes do serving; a API recebe apenas role de runtime.
- **Pronto:** boot produtivo sobe sem `DATABASE_MIGRATION_URL`; role da API
  falha ao tentar DDL; upgrade, falha de migration e rollback/roll-forward
  possuem prova em staging com dados fictícios e RLS obrigatório.

## Ordem 2 — Candidato e qualidade reproduzível

### A59-07 — Baseline, certificado e proveniência · F06 · P0-R · M0/M3

- **Dono / tasks:** release e qualidade; `PR-003`, `PR-009-PROV`, `PR-010`,
  `PR-011-CODEQL` e `PR-305`.
- **O quê/onde:** integrar os commits corretos no root, inventário de fontes,
  CI, certificado e verificador; não alterar controle para aceitar drift.
- **Como/dependência:** PR-L04 e fatias M1/M2 integradas; autorização de push
  quando necessária; CodeQL e secret scan adjudicados; um único SHA/digest.
- **Pronto:** `certification:verify` sai 0 em checkout limpo do candidato;
  Verify/Security/CodeQL e atestação externa referem o mesmo SHA/digest;
  closures, relatórios e hashes internos batem. Worktree isolada não é prova
  suficiente do root publicado.

### A59-08 — Matriz confiável de navegadores · F07 · P1 · M3

- **Dono / task:** frontend/qualidade; `PR-009`.
- **O quê/onde:** montagem do console e `tests/e2e/rem21-014-qualification.spec.ts`.
- **Como/dependência:** investigar screenshot/timing/console/network do caso
  Chromium que mostrou tela branca; separar defeito do app de flake do teste.
- **Pronto:** causa registrada; matriz inteira Chromium/Firefox/WebKit passa
  sem skips ou retries que escondam a primeira falha, em candidato integrado
  com sessão confiável. Reteste focal 1/1 não encerra este item.

### A59-09 — Catálogo de skips coerente · F08 · P2 bloqueante · M3

- **Dono / task:** qualidade/release; `PR-003` e SPEC 0143.
- **O quê/onde:** `scripts/skip-catalog.json` e teste de homologação do worker.
- **Como/dependência:** aguardar claim PR-L04 e estabilização da fonte; gerar
  hash do teste efetivamente integrado, preservando justificativas do catálogo.
- **Pronto:** `npm run skip:governance` passa no SHA do candidato; nenhum skip
  obrigatório é ocultado; suíte Node 22/PostgreSQL sem skips aplicáveis.

### A59-10 — Denominador de cobertura e negativos · F09 · P2 · M3

- **Dono / task:** qualidade; `PR-007`.
- **O quê/onde:** configuração Vitest e relatórios de web, entrypoints e
  módulos PostgreSQL hoje fora da cobertura global.
- **Como/dependência:** SPEC 0148/claim da configuração; publicar denominador
  por camada e acrescentar negativos onde comprovam invariantes, sem baixar
  thresholds para fabricar verde.
- **Pronto:** relatórios deixam claras inclusões/exclusões, pisos críticos
  continuam verdes, cobertura web/PG tem gate próprio e a variação entre runs
  é explicada. Testes novos exercitam replay, preflight e sinks reais.

## Ordem 3 — Produto, dados e operação

### A59-11 — Arquitetura atual e isolamento do legado · F11/F12 · P2 · M2/M3

- **Dono / tasks:** arquitetura e frente FL; `PR-L04`, `PR-L06`–`PR-L10`,
  `PR-L12`, `PR-201`, `PR-202`, `PR-207`.
- **O quê/onde:** composição de API/worker, build, proxy, documentos de
  arquitetura e índice para consumidores.
- **Como/dependência:** executar fatias FL com claims próprios e regressão;
  publicar uma entrada canônica da arquitetura vigente com SHA e marcar
  textos históricos como superados, preservando links.
- **Pronto:** fluxo neutro de referência funciona; build/serving não precisam
  de domínio Secretary; guarda de CI detecta regressão; guia atual descreve
  factory, runtime iterativo, sessão, responsabilidades e limites do candidato.

### A59-12 — Conhecimento e integrações controladas · F13 · P1 antes de ativação · M4

- **Dono / tasks:** produto/integrações; `PR-103`–`PR-106`, `PR-501`–`PR-505`,
  `PR-506` e `PR-507`.
- **O quê/onde:** provider, canal, catálogo RAG, gateway de modelos, destino
  externo e handoff operacional.
- **Como/dependência:** decisões de consumidor/fornecedor/fonte e SPECs
  T3/T4; vincular hash, versão, validade e aprovador da fonte; contrato de
  deduplicação no destino e minimização antes do provider.
- **Pronto:** staging sintético demonstra revogação, ausência de fonte,
  prompt injection, quota, kill switch, handoff e reconciliação; resposta sem
  fonte aprovada não sai, efeito sensível não executa sem approval. Ativação
  real exige pacote T4 hash-bound e autorização do escopo.

### A59-13 — Retenção e direitos operacionais · F14 · P1 antes de dados reais · M4

- **Dono / tasks:** responsável por dados/DPO e engenharia; `PR-401`–`PR-404`,
  `PR-407`.
- **O quê/onde:** inventário pessoal, purge de autenticação e dados,
  backups, exceções de preservação e fluxo de direitos do titular.
- **Como/dependência:** finalidade/prazo por categoria aprovados; SPEC T3
  para purge e propagação; provar com dados fictícios e registros auditáveis.
- **Pronto:** eliminação física e nas réplicas/destinos demonstrada, exceções
  e backups tratados, recuperação não reintroduz dado expirado sem política;
  responsável valida o fluxo. Isso não constitui parecer jurídico por si só.

### A59-14 — Recuperação e operação observável · F15 · P0-R · M4

- **Dono / tasks:** operações/plataforma; `PR-303`, `PR-406`, `PR-601`–`PR-607`.
- **O quê/onde:** cofre/rotação, PITR, restore, SLOs, alertas, on-call,
  runbooks, capacidade e ensaio de falhas em staging.
- **Como/dependência:** nuvem/região/owner decididos; ambiente controlado e
  candidato integrado; definir RPO/RTO e métricas de jornada com provider
  representativo antes de avaliar carga.
- **Pronto:** restore cronometrado dentro de RPO/RTO definidos, alerta com
  responsável e escalonamento, rotação e pausa testadas; carga/soak e drill
  geram evidência ligada ao candidato. Benchmark em memória sem modelo não
  serve como latência de produto.

### A59-15 — Validação externa, piloto e GO/NO_GO · F15 · P0-R · M5

- **Dono / tasks:** segurança, dono do consumidor e release; `PR-307`,
  `PR-701`–`PR-707`.
- **O quê/onde:** pentest, E2E/UAT, piloto limitado e decisão final.
- **Como/dependência:** M3/M4 fechados; consumidor, tenant, volume, SLA e
  critérios de saída decididos; 13 gates G01–G13 no mesmo digest/configuração.
- **Pronto:** pentest externo sem crítico/alto aberto, piloto medido contra
  critérios acordados, zero P0/P1 aberto e autorização humana registrada com
  hash e escopo. Se qualquer condição falhar, manter `NO_GO` e registrar ação.

## Regra de rastreabilidade e fechamento

Para cada cartão: **achado → task PR existente → SPEC/gate → commit/candidato →
teste negativo ou prova operacional → auditoria de fechamento**. Atualizar o
0356 e os ledgers canônicos quando os caminhos compartilhados estiverem
livres. Um `PASS` isolado fecha somente a fatia isolada; o cartão permanece
aberto para promoção até a prova no candidato integrado. Nenhuma nota da
AUD-0590 deve ser aumentada por planejamento, apenas por nova evidência.
