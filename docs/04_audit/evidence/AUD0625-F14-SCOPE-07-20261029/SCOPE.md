# F14 da auditoria 0625 — escopo e caminho de fechamento

Task `AUD0625-F14-SCOPE-07-20261029` (Claude Sonnet, sessão 07), pedido do DF. Só leitura e
documento, sobre `claude/aud0625-wave3`. **Não cria carteira nova**: a auditoria manda seguir a
direção atual e as carteiras PAR/C100 já descrevem o trabalho. Nada aqui concede BUILD, release ou
produção; cada cartão T3/T4 mantém a SPEC e o gate próprios.

## 1. O achado

[F14 — P2](../../0625_repository_score_audit_2026-10-28.md): "RAG, sessões, streaming e MCP não estão
integralmente qualificados". FAQ com filtro não equivale a resposta institucional vinculada a conteúdo
aprovado/revogado; metadata do catálogo não é ingestão; eventos de sessão não demonstram continuidade
conversacional entre processos; um enum `origin:mcp` não prova adapter governado. Fechamento pedido:
seguir o núcleo e seus aceites de conteúdo, retomada, streaming e MCP em candidatas identificadas, sem
tomar presença de tipos, captura de fonte ou teste de parser como aceite funcional.

## 2. Resumo para o Ricardo

| Subitem | Hoje (verificado no código da wave3) | Cartões que fecham | Estado dos cartões | Quem está fazendo |
|---|---|---|---|---|
| RAG | Catálogo de fontes só com metadados (`0005`, sem conteúdo); `VersionedKnowledgeCatalog` em memória; `StaticKnowledgeProvider` filtra uma lista com `approved === true` na construção | UP91-015 → UP91-010 → UP91-040 | `PROPOSED` (backlog 0367) | sem claim ativo |
| Sessões | Log de eventos append-only com RLS (`0028`, esquema dedicado, fora da execução padrão); sem dono entre processos, sem flush, sem fork, sem listagem | PAR-S01 → PAR-S04/S05 (→ C100-S01) | `TODO` (0380); SPEC 0221 aprovada com ajustes, entrada de BUILD `false` | sem claim ativo; o claim de recomposição da 0221 está `CONCLUÍDO T1` |
| Streaming | `stream: false` fixo nos dois provedores; nenhum SSE/WebSocket na API | PAR-M01 → PAR-A01 (→ C100-S02) | `TODO` | sem claim ativo |
| MCP | Só o literal `'mcp'` em `CapabilityOrigin`; nenhum cliente | PAR-P01 (→ C100-P01/P02) | `TODO` | sem claim ativo |

**Recomendação em uma linha:** abrir primeiro **PAR-S01** (sessões entre processos) e **PAR-M01**
(streaming) em paralelo, ambos atrás do PAR-K03; depois **PAR-A01**; tocar o **RAG** como trilha
independente de contrato (UP91-015-C, depois 010 e 015-I) e deixar **PAR-P01 (MCP)** por último, porque
depende de contenção de processo (PAR-X) ainda aberta. Corpus institucional real (UP91-040) só com
decisão humana T4.

## 3. Método e limites da evidência

- **Estado dos cartões** = o que está escrito nas carteiras: PAR em
  [0380](../../../03_build/0380_backlog_paridade_100_deepseek.md) (snapshot de 16–18/10/2026), C100 em
  [0383](../../../03_build/0383_backlog_paridade_claude_code.md), DX100 em
  [0386](../../../03_build/0386_backlog_paridade_codex.md), UP91 em
  [0367](../../../03_build/0367_program_backlog_reaudit_2026-09-30.md). Os ledgers 99/20/30 foram
  rotacionados e **não** repetem o estado desses cartões; onde o ledger tem algo a mais (SPEC 0221,
  claims), está citado. Os estados `TODO` não foram reconfirmados por execução.
- **"Hoje"** foi reconferido por leitura de código em `claude/aud0625-wave3` (arquivos citados).
- **Donos/claims:** busca em `agent_coordination.md` por cada cartão e por MCP, streaming, conhecimento
  e sessões: não há claim `ATIVO` sobre nenhum dos cartões abaixo. Consulta ao GBrain (recall só por
  palavra-chave, semântica desligada) não achou atribuição ativa para eles; o que existe no GBrain sobre
  RAG/streaming/MCP está na trilha do cvg-claw (seção 8), que é outro repositório. "Dono proposto" abaixo
  é a lane do próprio cartão (L1/L2/L3 do 0383), não uma pessoa.
- Não rodei suíte, PG nem CI.

## 4. RAG — resposta institucional vinculada a conteúdo aprovado/revogado, e ingestão

**Hoje.**
- `packages/rag/src/institutional-rag.ts` (148 linhas): `VersionedKnowledgeCatalog` **em memória** com
  `draft/published/revoked`; `answerFromInstitutionalSource` devolve `handoff` se a fonte falta ou se a
  pergunta é médica. Usado em testes e como dependência de `apps/api`; não há adapter de persistência de
  conteúdo nem ligação ao worker.
- `packages/conversation/src/profiles.ts` (`StaticKnowledgeProvider`): filtra, **na construção**, os itens
  com `approved === true` e comprimentos limites; a busca é por palavras no título/texto. É o "FAQ com
  filtro" do achado: a aprovação é um booleano de fixture, sem revogação em tempo de consulta, sem
  vínculo de tenant e sem hash do conteúdo.
- `packages/persistence/migrations/0005_knowledge_source_catalog.sql`: "metadata only... stores no content,
  ingestion state, embeddings" — confirma o "metadata do catálogo não é ingestão".
- Existem **dois** contratos `KnowledgeProvider` diferentes (`packages/contracts/src/contracts.ts:541` e
  `packages/conversation/src/contracts.ts:537`) e um terceiro, `AgenticKnowledgeProvider`
  (`packages/contracts/src/execution-v2.ts:679`, com `sourceId/sourceVersion`).

| Cartão | O que cobre | Estado (fonte) | Dono / claim | Depende de | O que falta para o aceite funcional |
|---|---|---|---|---|---|
| UP91-015 | Binding de tenant no `KnowledgeSearchRequest` ou no adapter, `claimExtractor` obrigatório no uso institucional, proveniência e revogação (etapas **015-C** contratual e **015-I** integração) | `PROPOSED`, P1, M2, T3 (0367 §UP91-015) | "Conhecimento/contratos" (lane); sem claim | UP91-010, UP91-013 (a 013 virou a SPEC 0267, mesclada) | SPEC T3 e gate; 015-C (tipos/parser/renderer), depois 015-I ligando tenant/fonte/cobertura/revogação ao caminho público; prova "tenant errado nunca lê fonte; claim sem suporte não passa por falta de extractor; agente sem RAG segue válido" |
| UP91-010 | Compor a resposta com observações do run (insumo da 015) | `PROPOSED`, P1, M2, T3 | "Runtime/conhecimento"; sem claim | — | SPEC e gate; permitir que a resposta cite observações do run (pré-requisito da 015-I) |
| UP91-040 | Publicar conhecimento institucional **aprovado e revogável**: versão/hash/revisão/validade, adapter ligado ao worker e ao tenant, negar fonte revogada ou ausente, minimização | `PROPOSED`, P1, M6, **T4**, L | "Conhecimento + dono das fontes"; sem claim | UP91-008, 015, 016, 030, 039 | Tudo acima mais corpus versionado por tenant, eval de cobertura e citação; fonte real só com decisão humana T4; "ausência vira handoff, revogação efetiva" |
| UP91-016 | Redigir segredos antes do sink de auditoria (precede a publicação) | `PROPOSED` | sem claim | — | fora do núcleo do F14; só como dependência |
| UP91-030 / UP91-008 | Inventário de dados DP01–06 e decisões de consumidor/ambiente | `PROPOSED` | humano/consumidor | — | decisões humanas, não código |
| CC100-05-04, CC100-06 (C100-C01) | Conhecimento reconciliado com grants nas skills; memória aprendida **não** vira fonte institucional | `TODO` (0383) | L1 | — | só garantem a fronteira "memória ≠ fonte"; não substituem a 040 |

**Lacuna de carteira (ingestão).** Nenhum cartão PAR/C100/UP91 nomeia o **pipeline de ingestão**
(extração, fragmentação, armazenamento versionado do conteúdo, embeddings se houver). A UP91-040 diz
"publicar... com versão/hash/revisão/validade" e liga um adapter; o que fica implícito é *onde o conteúdo
vive*. Recomendação: **ampliar a SPEC da UP91-040** com esse recorte (mesmo cartão), em vez de abrir um
cartão novo; se o Ricardo quiser RAG vetorial, é decisão separada (T3) dentro da mesma SPEC.

## 5. Sessões — continuidade conversacional entre processos

**Hoje.** `packages/persistence/src/session-events.ts` (236 linhas) e `0028_session_events` (esquema
dedicado, opt-in, "not in the default run" em `postgres-migrations.ts:49`): `openSession/append/read` com
sequência e digest. **Não há** dono/lease entre processos, `flush`, `close`, listagem, fork nem busca
(grep sem ocorrência); `packages/harness/src/session` tem `kernel-log`, `memory` e `format-migration`.

| Cartão | O que cobre | Estado (fonte) | Dono / claim | Depende de | O que falta para o aceite funcional |
|---|---|---|---|---|---|
| **PAR-S01** | Persistência pública de sessão **entre processos**: dono exclusivo (create/open/read/append/flush/close), recusa de writer antigo, sobre o mesmo log v1 | `TODO`, P0, G (0380); **SPEC 0221** `1f9490cc…` aprovada com ajustes em 16/10; recomposição `f64a1b89` aprovada (Codex, `CONCLUÍDO T1`), **`BUILD_ENTRY_READY=false`** | lane L1; ex-claim Codex fechado; sem claim ativo | PAR-K03 (`IN_PROGRESS`) | BUILD da 1ª fatia; provas: dois processos escrevem/leem sem lacuna nem duplicata, writer antigo recusado, tenant isolado, kill e reabertura. **A migration planejada (`0031`) já foi tomada** (`0031_channel_effect_retry_not_before`; 0029 e 0030 também): a SPEC precisa de nova numeração (≥ 0032) por nota adjacente. Declarar `maxOpenWriters` e a proibição de PgBouncer em transaction mode (ajustes aprovados) |
| PAR-S04 | Fork e **retomada** de sessão (fork sem herdar aprovação pendente) | `TODO`, P1 | L1 | PAR-S01 | SPEC e BUILD; "aprovação pendente do original não vale no fork" |
| PAR-S05 | Listagem/filtro com cursor e rastreio aprovação → efeito → evento | `TODO`, P1 | L1 | PAR-S01 | SPEC e BUILD; consulta de outro tenant volta vazia |
| PAR-S02 / S03 / S06 / S07 | Projeções, estatísticas/título, busca textual, export/import | `TODO`, P1–P2 | L1 | S01/S02/S05 | **fora do mínimo do F14** (paridade, não continuidade) |
| C100-S01 | Seleção por identidade/nome, vínculo com contexto, retenção e opt-out, sobre o store PAR | `TODO`, P1, F2 | L1 | C100-Q01 (`DONE`), PAR-K03/S01–S05/S07/H01 | só depois do PAR; a SPEC reconcilia com os donos PAR |
| DX100-S01 / S02 | Threads (catálogo, metadata, anexos) e resume/fork/revert/migração (paridade Codex) | `TODO`, P1 | L1 | DX100-K01, PAR-S* | paridade, não F14 |
| PAR-K03 | Checkpoint durável antes do modelo e do efeito (pré-requisito de S01, M01 e C01) | `IN_PROGRESS`, P0, G (0380) | frente PARE100 do Codex (SPEC 0225 aprovada com ajustes, 0226 adiada; ownership não reconfirmado hoje) | PAR-K01 (`IN_PROGRESS`) | fechar o BUILD de 0225 antes de S01/M01 entrarem; a migration planejada (`0030`) também foi tomada (`0030_api_creation_receipts`) |

**Mínimo para fechar a parte "sessões" do F14:** PAR-S01 + PAR-S04 (retomada), com o teste de dois
processos e de writer antigo. S02, S03, S05, S06, S07 e C100-S01 são paridade.

## 6. Streaming

**Hoje.** `packages/model-gateway/src/providers/ollama.ts:125` e `openai-compatible.ts:150` fixam
`stream: false`. Na API não há `text/event-stream`, `EventSource` nem WebSocket (grep sem ocorrência);
só leitura paginada por `afterSequence`. O servidor de falhas e o replay de stream sintético existem
(PAR-Q04 `DONE`), então há apoio de teste.

| Cartão | O que cobre | Estado (fonte) | Dono / claim | Depende de | O que falta para o aceite funcional |
|---|---|---|---|---|---|
| **PAR-M01** | Streaming por provedor com cancelamento, uso parcial e **exatamente um resultado terminal** | `TODO`, P0, M (0380); absorve P100-014 | lane do gateway (L1/L2); sem claim | PAR-K03 | SPEC T3 e BUILD; "todo stream termina em sucesso, falha ou cancelamento; corte de conexão não grava resposta parcial como final". Usar o servidor de falhas PAR-Q04 |
| **PAR-A01** | Canal de eventos da API (SSE ou WebSocket) com cursor de retomada, cancelamento, backpressure e RLS | `TODO`, P0, G | L2 (API/SDK); sem claim | PAR-S01, PAR-M01 | SPEC e BUILD; "dois tenants não veem eventos um do outro; queda e reconexão não perdem nem duplicam evento" |
| PAR-A02 | Controle ao vivo de turno e sessão (pausa, retoma, troca de modo) | `TODO`, P1 | L2 | PAR-K06, PAR-A01 | fora do mínimo |
| PAR-A05 / A07 | Notificações push e pedidos do servidor ao cliente no SDK | `TODO`, P1–P2 | L2 | A01, T11 | necessários só para elicitação/MCP e C100-S02 |
| C100-S02 | Contrato headless text/json/stream-json, schema, parciais, replay de mensagem, erro final e EOF explícitos | `TODO`, P1, F2 | L2 | C100-Q01 (`DONE`), PAR-M01/A01/A02/A05/A07/H01 | paridade com o cliente de referência; "JSON inválido e corte de stream nunca viram sucesso" |
| DX100-A01 | Envelopes app-server (105 requests, 10 server requests, 85 notificações) | `TODO`, P1, F3 | L2 | DX100-S02, DX100-M01 | paridade Codex, fora do F14 |

**Mínimo para o F14:** PAR-M01 (gateway) e PAR-A01 (API). C100-S02 e DX100-A01 são paridade.

## 7. MCP — adapter governado

**Hoje.** O único traço é o literal `'mcp'` em `CapabilityOrigin`
(`packages/contracts/src/contracts.ts:407` e `packages/harness/src/capability-boundary.ts:38`). Não há
cliente nem servidor MCP. O catálogo de skills/plugins (SPEC 0255/0256, PAR-T07) é vizinho, não MCP.

| Cartão | O que cobre | Estado (fonte) | Dono / claim | Depende de | O que falta para o aceite funcional |
|---|---|---|---|---|---|
| **PAR-P01** | Cliente MCP como adaptador de capabilities: allowlist de servidores por tenant, credencial por servidor, classificação de efeito obrigatória, validação de schema, limites; só executa **pelo pipeline** (policy, aprovação, journal) | `TODO`, P1, G, hospitalar média (0380) | L3 (MCP/hooks/skills); sem claim | PAR-X02, PAR-T12 | SPEC T3 e BUILD; "servidor desconhecido, schema hostil e timeout são recusados; processo stdio morre no dispose" |
| PAR-X01 / X02 / X03 | Subprocesso único e ambiente do filho; contenção real; testes nativos | `TODO`, P0 (0380) | Codex (frente de sandbox); a onda 2 entregou F01/F02/F05 (`e6a701ca`, `f4e799b8`, `3e1602f4`) **mas F05 global, K08 e X01 seguem abertos** | PAR-G01 (`DONE`) | pré-requisito do stdio; sem isso o PAR-P01 não pode lançar servidor local |
| PAR-T12 | Web fetch e search com proteção SSRF | `TODO`, P2 | — | PAR-X01 | pré-requisito do transporte HTTP |
| PAR-H03 | Credenciais por referência e autorização humana | `TODO`, P1 | — | PAR-H02 | pré-requisito da "credencial por servidor" |
| C100-P01 | Transportes (stdio/HTTP/SSE/WebSocket), escopos e configuração estrita (sem autodiscovery), OAuth por referência | `TODO`, P1, F3 | L3 | PAR-P01/X01–X03/T12/H03 | só depois do PAR-P01 |
| C100-P02 | Recursos, prompts, elicitação e **servidor MCP do host** com identidade | `TODO`, P1, F3 | L2 | C100-P01, C100-S02, PAR-A07, T11 | paridade; "cliente sem grant não ganha ferramentas por conectar" |
| DX100-P01 / P02 | MCP completo, autenticação, recursos, apps e conectores (Codex) | `TODO`, P1 | L3 | DX100-A01/X02/H01 | paridade Codex |

**Mínimo para o F14:** PAR-P01 com seus pré-requisitos (X01–X03, T12, H03). C100-P01/P02 e DX100-P01/P02
são paridade.

## 8. Fora da carteira do harness (registrado, sem tocar)

- **cvg-claw** (produto corporativo sobre OpenClaw, outro repositório, backlog próprio): CLAW-C32
  "Evoluir memória e RAG institucional com escopo" (U07), CLAW-EVO-R07 "Provar proveniência, RAG
  aprovado e retenção por escopo" (aceite: só fonte publicada, aprovada e não revogada sustenta RAG;
  ausência vira esclarecimento/handoff) e a nota de streaming do plano 0368. Fecham o equivalente
  **no cvg-claw**, não o F14 do harness; vale citá-los porque o critério de aceite é o mesmo.
- **Assistente de Plantão** (`products/shift-assistant`): não usa RAG (NO_MODEL e a regra "não responder
  RAG sem fonte institucional aprovada"); não entra no F14.

## 9. Recomendação: qual cartão fecha o quê, e em que ordem

| Ordem | Cartão(ões) | Fecha no F14 | Gate | Por que nessa posição |
|---|---|---|---|---|
| 0 | PAR-K01/K03/K04 (`IN_PROGRESS`), renumeração das migrations de 0221 e 0225 | pré-requisito | já em curso | S01 e M01 dependem do K03; a numeração planejada (0029–0031) colidiu com o que foi publicado |
| 1a | **PAR-S01** (SPEC 0221 recomposta) | sessões entre processos | T3: BUILD aprovado com ajustes; falta confirmar a numeração | é a fundação de sessões **e** da API de eventos |
| 1b | **PAR-M01** | streaming no gateway | T3: SPEC nova | independe de S01; pode andar junto |
| 2 | **PAR-S04** (+ S05 se o rastreio for exigido) | retomada | T3 | só depois de S01 |
| 3 | **PAR-A01** | streaming na API | T3 | exige S01 e M01 |
| R | UP91-015-C → UP91-010 → UP91-015-I | RAG: contrato, tenant, revogação, claim | T3 | trilha independente; começa pelo contrato (015-C não depende da 010/013 integradas) |
| 4 | **PAR-X01–X03, T12, H03 → PAR-P01** | MCP governado | T3 | depende de contenção ainda aberta (F05 global, K08, X01); por último |
| 5 | **UP91-040** | RAG: publicação e ingestão com fonte real | **T4** | depende de 008/015/016/030/039 e de decisão humana sobre o corpus |
| — | C100-S01/S02/P01/P02, DX100-* | paridade, depois do F14 | T3 | não fazem parte do mínimo |

**Decisões que só o Ricardo toma:** (1) se o RAG vetorial entra na SPEC da UP91-040 ou fica fora;
(2) a fonte real do corpus institucional e quem a aprova (T4); (3) se o F14 se considera fechado com o
"mínimo" por subitem (S01+S04, M01+A01, P01, 015+010+040) ou só com a paridade C100/DX100.

## 10. Lacunas e achados desta leitura

1. **Numeração de migrations.** O plano de 16/10 reservava `0029` (PAR-G01), `0030` (SPEC 0225) e `0031`
   (SPEC 0221). Hoje `0029` é `case_assignment_authorization`, `0030` é `api_creation_receipts` e `0031`
   é `channel_effect_retry_not_before`. As SPECs 0221 e 0225 são hash-bound: a renumeração entra por nota
   adjacente ou no BUILD, nunca editando o corpo.
2. **RAG sem cartão de ingestão** (seção 4).
3. **Contratos de conhecimento duplicados** (três interfaces); a UP91-015-C é o lugar de unificar ou de
   documentar a fronteira.
4. **Estado dos cartões PAR desatualizado na carteira.** Nenhum ledger posterior a 18/10 atualiza os
   `TODO`/`IN_PROGRESS`; antes de abrir qualquer um, o dono deve reler o código (o "Hoje" desta página
   ajuda) e atualizar o cartão.
5. **SPEC 0221** ainda traz no cabeçalho `PROPOSED_FOR_TECHNICAL_REVIEW R2`; o estado vigente está no
   registro de 16/10 (aprovada com ajustes) e na recomposição `f64a1b89`
   ([REPORT](../CLAUDE100-EXEC-20261017/foundation0221-recomposition/REPORT.md)).
