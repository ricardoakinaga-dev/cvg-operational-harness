# Plano executivo de remediação abrangente — AUD21

## Propósito e resultado esperado

Este plano transforma os 26 achados da [auditoria
0566](../04_audit/0566_comprehensive_repository_audit_2026-09-21.md) em uma
execução recuperável por um agente Codex. O objetivo é produzir um candidato
controlado cuja decisão de qualidade seja derivada de evidência atual,
reproduzível e vinculada ao mesmo código, runtime e imagem.

Resultado-alvo interno: **GO técnico controlado**, sem P0/P1 alto aberto e com
revisão independente. Resultado-alvo externo: apenas um pacote pronto para
decisão humana. Este plano não autoriza dados reais, providers, canais, IdP,
piloto, deploy ou produção.

## Situação atual

- baseline Git: `05d1f33322a5b75e65ee3b6f0fa1a737c300d7bb`, branch `main`;
- worktree: 202 entradas modificadas/não rastreadas na observação da
  auditoria; preservar todo trabalho preexistente;
- qualidade local: typecheck/lint/readiness/diff `PASS`; 2.030 testes `PASS`,
  144 skipped; `npm audit` sem vulnerabilidade alta;
- candidato corrente: `579d2100...`, mecanicamente
  `CONDITIONAL_GO / AAA_CONTROLLED`, mas insuficiente para a nova barra;
- `AUD20-008`: implementada e testada, `PASS_LOCAL / I1_PENDING`; os registros
  mestres ainda não refletem essa realidade;
- parecer atual: **REJECT / NO-GO**;
- estado deste plano: `IN_PROGRESS / REM21-008`; `REM21-007` está em
  `VERIFIED_LOCAL / FINAL_CERT_DEFERRED` após BUILD/AUDIT; `REM21-006` está
  `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`; `REM21-005` está
  `VERIFIED_LOCAL / FINAL_CERT_DEFERRED` após BUILD/AUDIT local; `G21-1` foi concedido apenas
  para execução local, sintética e descartável pelo envio humano do prompt
  `0338`.

## Autoridade e relação com AUD20

O programa `AUD21-COMPREHENSIVE-REMEDIATION` supersede apenas o roteamento
corrente; não reabre nem renumera silenciosamente evidências históricas.
Tarefas `REM21` reutilizam resultados `AUD20` quando o contrato e o candidato
forem equivalentes e a prova continuar atual. Caso contrário, a evidência é
marcada `STALE` e reexecutada.

| Gate    | Decisão              | Condição de saída                                                            | Autoridade                    |
| ------- | -------------------- | ---------------------------------------------------------------------------- | ----------------------------- |
| `G21-0` | Planejamento         | relatório, plano, roadmap, backlog e prompt publicados                       | concluído documentalmente     |
| `G21-1` | BUILD local          | autoriza somente mudança local, sintética e descartável de `REM21-001`–`019` | humano                        |
| `G21-2` | Verdade dos gates    | estado reconciliado e certificador falha com P0/P1 atual                     | auditoria técnica             |
| `G21-3` | Segurança/composição | replay, egress, auth, rate e worker sem achado alto                          | auditoria técnica + humano    |
| `G21-4` | Operação/qualidade   | CI integral, PostgreSQL, restore, observabilidade e UX passam                | release/audit                 |
| `G21-5` | Validação externa    | ambiente, credenciais, dados, owners, privacy e rollback aprovados           | humano + owners externos      |
| `G21-6` | Freeze e decisão     | candidato selado, crítica I1, sentinel e decisão humana                      | auditor independente + humano |

`G21-1` não concede `G21-5` nem `G21-6`. O [prompt de execução
0338](0338_codex_full_remediation_prompt.md) pode registrar `G21-1` quando for
deliberadamente enviado ao agente, mas preserva os bloqueios externos.

## Princípios de execução

1. Executar `DISCOVERY -> PRD -> SPEC -> BUILD -> AUDIT` por task; quando PRD
   ou SPEC corrente for suficiente, citar e validar em vez de duplicar.
2. Começar por teste negativo/critério executável e provar que a falha existia.
3. Trabalhar em Node 22 e somente com fixtures sintéticas descartáveis.
4. Tratar migração como roll-forward/rollback ensaiado; nunca alterar banco
   real.
5. Uma task sai de BUILD para VERIFY e apenas vira concluída com evidência
   fresca e critérios satisfeitos.
6. Atualizar backlog, execution log e runtime state ao fim de cada rodada,
   preservando eventos anteriores.
7. Nenhum score, finding, skip, parecer ou autoridade pode ser editado
   manualmente para obter `GO`.
8. Qualquer mudança depois do freeze invalida o candidato e os gates afetados.

## Arquitetura atual e arquitetura-alvo

Fluxo atual de decisão e operação:

```text
source/worktree -> scripts de gates -> reports/JSON editáveis
                -> findings manuais -> certificador -> CONDITIONAL_GO

web simulado -> API -> PostgreSQL
webhook/token -> replay claim parcialmente pré-auth
adapter -> valida DNS -> fetch resolve novamente
worker homolog -> loop -> evento ready tardio
```

Fluxo-alvo:

```text
fonte congelada + Node 22 + imagem por digest
  -> gates obrigatórios e negativos
  -> resultados imutáveis vinculados ao candidate/run
  -> findings computados + exceções com autoridade explícita
  -> certificador fail-closed
  -> crítica I1 + sentinel
  -> decisão humana separada

IdP confiável -> web session -> API
token verificado -> claim JTI atômico -> handler
egress policy -> IP/socket ou proxy controlado -> HTTPS
worker -> preflight -> readiness -> consumo -> drain
PostgreSQL -> backup -> restore -> leitura/integração verificada
```

## Marcos executivos

### M21-0 — Controle recuperado

- tasks: `REM21-001` e `REM21-002`;
- entrega: `AUD20-008` reconciliada sem falsa conclusão, estado corrente
  coerente e certificador derivando blockers da fonte oficial;
- demonstração: fixture com P0 aberto faz a certificação falhar;
- saída: `G21-2` aprovado.

### M21-1 — Fronteiras de segurança fechadas

- tasks: `REM21-003`, `004`, `005`, `006` e `007`;
- entrega: auth antes de replay, egress connection-bound, sessão confiável,
  worker com semântica correta e rate keys privadas/duráveis;
- demonstração: ataques negativos de token forjado, DNS rebinding, HTTP com
  credencial, authority injection, shutdown/readiness e churn do limiter;
- saída: `G21-3` aprovado.

### M21-2 — Qualidade e supply chain vinculadas

- tasks: `REM21-008`, `012`, `013`, `016` e `018`;
- entrega: CI executa a barra completa em Node 22, controla skips/mutation e
  liga source, imagem, SBOM, reports e candidato ao mesmo run;
- demonstração: self-tests negativos e verificação offline do manifesto.

### M21-3 — Operação durável demonstrada

- tasks: `REM21-010` e `011`;
- entrega: load/restore/rollback PostgreSQL, exporters, alertas, SLOs e
  degradação segura;
- demonstração: backup restaurado em instância descartável produz checksums,
  grants/RLS e leituras equivalentes; queda do exporter não viola safety.

### M21-4 — Produto e base mantíveis

- tasks: `REM21-014`, `015` e `017`;
- entrega: matriz de browser/acessibilidade, redução incremental de hotspots
  e higiene documental/evidencial;
- demonstração: E2E suportado, testes de caracterização e checker de docs
  sem falso positivo conhecido.

### M21-5 — Candidato final controlado

- task: `REM21-019`;
- entrega: worktree/composição congelada, todos os gates aplicáveis no mesmo
  run, pacote integral, revisão I1 e sentinel;
- saída: `G21-6`, com decisão técnica e humana distintas.

### M21-6 — Externo e piloto

- tasks: `REM21-009` e `REM21-020`;
- status: `BLOCKED_BY_G21-5`;
- entrega permitida antes do gate: somente contratos, runbooks, fixtures,
  plano de rollback, matriz de owners e pacote de decisão;
- execução real: proibida até autoridade humana e externa específica.

## Sequência de implementação

1. Recuperar a verdade documental e a evidência de `AUD20-008`.
2. Tornar findings, scores e decisão computados e fail-closed.
3. Corrigir as quatro fronteiras de segurança: replay, egress, auth e limiter.
4. Corrigir lifecycle/readiness do worker sem habilitar produção.
5. Ligar a barra completa ao CI e fixar Node 22.
6. Ampliar skip/mutation e construir a imagem reproduzível.
7. Provar load, restore, rollback, exporter e alertas em ambiente descartável.
8. Completar UX/browser, decompor hotspots e sanear docs/evidências.
9. Executar regressão integral, congelar, revisar independentemente e decidir.
10. Preparar, mas não executar, validação externa/piloto sem `G21-5`.

A decomposição executável, dependências e critérios de pronto estão no
[backlog 0337](0337_comprehensive_remediation_backlog.md). As janelas e gates
estão no [roadmap 0336](0336_comprehensive_remediation_roadmap.md).

## Estratégia de validação

Barra mínima para toda task:

- testes focados RED/GREEN e regressão do pacote afetado;
- typecheck, lint, format apenas nos arquivos da rodada e `git diff --check`;
- testes negativos para controle de segurança ou gate;
- PostgreSQL descartável quando houver persistência/concurrency/migration;
- inventário de skips sem item desconhecido;
- evidence manifest com comando, Node, exit code, timestamp, candidate/run,
  hashes e limitações;
- reauditoria do achado original e superfície de regressão.

Barra do candidato final:

- full test, typecheck, lint, format, docs e diff;
- coverage global e crítica, mutation guard e skip governance;
- PostgreSQL, chaos, evals, load, restore, rollback e E2E suportado;
- build/smoke da imagem non-root, SBOM, licenses e vulnerability policy;
- certificação e verifier offline no mesmo candidate/run;
- crítica independente `I1` sem reparo durante a janela;
- sentinel final `MATCH` e decisão humana registrada.

## Riscos, controles e rollback

| Risco                                    | Controle                                                                        | Recuperação                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| sobrescrever trabalho alheio na worktree | inventário antes de cada task; diffs por arquivo; sem reset/checkout destrutivo | parar, preservar artefato e reconciliar ownership                   |
| obter GO alterando o oráculo             | fixtures negativas, findings computados, crítica independente                   | reabrir gate e invalidar candidato                                  |
| migration quebrar dados                  | DB descartável, backup, idempotência, roll-forward ensaiado                     | restaurar fixture e documentar forward-fix                          |
| refactor amplo gerar regressão           | caracterização e slices pequenos                                                | reverter somente o slice recuperável com patch explícito            |
| segredos ou dados reais em evidência     | fixtures sintéticas, redaction e scan                                           | revogar/rotacionar somente com autoridade; remover artefato exposto |
| dependência externa indisponível         | `BLOCKED_BY_G21-5`, mocks e contratos locais                                    | não simular aprovação; entregar pacote de handoff                   |

## Recuperação entre sessões

O agente seguinte deve ler, nesta ordem: `AGENTS.md`,
`docs/07_agents/AGENTS.md`, `docs/99_runtime_state.md`, este plano, o backlog
`0337`, a última entrada de `docs/20_master_execution_log.md`, a task ativa e
sua evidência. Em seguida deve inspecionar `git status`, confirmar a última
ação realmente concluída e executar uma única próxima ação segura. Efeitos
externos nunca são repetidos por ausência de log.

## Progresso inicial e próxima ação

- 2026-09-21: auditoria, plano, roadmap, backlog e prompt preparados;
- concluído: `G21-0`, somente documental;
- ativo: nenhum BUILD `REM21`;
- bloqueio: `G21-1` ainda precisa ser deliberadamente concedido;
- próxima ação: humano revisa o pacote e, se concordar, usa o prompt `0338`
  para autorizar `G21-1`; o executor inicia `REM21-001`.
