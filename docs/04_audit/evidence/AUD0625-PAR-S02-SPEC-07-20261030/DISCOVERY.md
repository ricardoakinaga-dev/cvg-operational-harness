# DISCOVERY — PAR-S02, projeções de sessão com cache

Task `AUD0625-PAR-S02-SPEC-07-20261030` (Claude Sonnet 5.5, sessão 07), 30/10/2026, sobre `claude/aud0625-par-s04-07` @ `5f08742c6` (S01 e S04 construídos; S04 fatias 2-3 aprovadas). Só leitura de código e uma sonda de custo; nenhum código de produção alterado. Cartão: [0380](../../../03_build/0380_backlog_paridade_100_deepseek.md) PAR-S02 (F2, P1, T3, depende do S01): "Projeções reconstruídas do log (estado atual, pendências, metas, todos) com cache de checkpoint. Aceite: projeção reconstruída do zero é igual à do cache; cada item cita o evento de origem."

## Capacidade PAR-CAP ligada

- **SESSION-04** (G1): "projeções por sessão (estado atual) com cache de checkpoint: todos, metas, estatísticas", `PAR-CAP` do [gap G1](../PARE100-GAP-20261016/G1-nucleo-modelo-sessao.md): estado **AUSENTE** ("nenhuma projeção de sessão em `packages/harness` ou `packages/persistence`"). Absorve P100-020.
- Consumidores já no backlog e que dependem do S02: S03 (estatísticas, esboço, título; SESSION-05/06), S07 (export/import: "reproduz as mesmas projeções"), PAR-O08 (goal durável por sessão), PAR-O09 (todos e planejamento). O G1 lista também "projeções de passagem de plantão" como terceiro item da ordem recomendada.

## Como as leituras reconstroem o estado hoje

| Fato | Onde | Consequência |
| --- | --- | --- |
| Não existe projeção: quem quer o "estado atual" lê o log e interpreta. O único derivador é a análise de turnos do S04 (`analyzeSessionLog`, pura, sem cache), usada por `fork` e `resumeSession`. | `harness/src/session/fork.ts` | A semente do S02 já existe e é pura; falta o resto (contadores, paradas, compactação), o cache e o contrato. |
| **Toda leitura valida o log inteiro.** `#readSlice` percorre todas as páginas do prefixo (`while (expected <= meta.head)`), valida cada evento (esquema, fingerprint, digest) e só então devolve a fatia pedida; o próprio comentário diz "the whole prefix is validated, also outside the returned slice". | `persistence/src/session-persistence.ts` (`#readSlice`) | Ler **1** evento custa o mesmo que ler todos. Não há leitura incremental. |
| O SDK `session.events` (`afterSequence`, `limit` 1..500) cai nesse caminho a cada chamada. | `sdk/src/server.ts:367` | Paginar uma sessão longa custa O(N) por página. |
| O catálogo v1 tem 9 tipos de evento: `message/user`, `message/assistant`, `turn/start`, `turn/end`, `model/request`, `model/result`, `tool/call`, `tool/result`, `context/compacted`. **Não há evento de meta (goal) nem de todo.** | `contracts/src/session-event-schemas.v1.json` | Metas e todos não podem ser projetados do log atual; exigem tipos novos (PAR-O08/O09) e portanto um catálogo novo. |
| `context/compacted` (`throughSequence`, `sourceDigest`, `summary`, `strategyVersion`) é gravado pelo gancho de compactação; a SPEC 0290 (PAR-C01, em revisão) o torna idempotente por `(throughSequence, sourceDigest, strategyVersion)` e diz "nunca reescreve nem apaga evento anterior; a visão é derivada". | `harness/src/compaction.ts`, SPEC 0290 (ainda fora desta branch) | O log nunca perde evento: uma projeção e seu cache continuam válidos depois de uma compactação. |
| Os eventos do log são imutáveis no banco (gatilhos `session_events_no_mutation`, `no_truncate`) e o cursor só avança. | `migrations/0034_session_writer_ownership.sql` | Um checkpoint no ponto `k` fica válido para sempre, desde que o evento `k` e a versão da projeção sejam os mesmos. |

## Custo medido por leitura (PG 16.15, `probe-read-cost.mts`)

Sessão sintética de turnos curtos (4 eventos por turno), leitor `open(id,'read')`:

| Eventos | `read(0)` (tudo) | `read(último, 1)` (um evento) |
| ---: | ---: | ---: |
| 100 | 14 ms | 11 ms |
| 1.000 | 98 ms | 89 ms |
| 5.000 | 409 ms | 449 ms |
| 20.000 | 1.689 ms | 1.724 ms |

Linear: ~85 µs por evento, independente do que se pede. Para uma passagem de plantão com sessão de dias isso é o custo de **cada** consulta de estado. Teste de controle verde no repositório: ler 1 evento de uma sessão de 200 busca 200 linhas.

## Relação com S04 e C01

- **S04.** O fork copia o prefixo sem renumerar e troca só o `sessionId`; como a projeção não carrega `sessionId`, a projeção do filho até o corte é **igual** à do pai até o mesmo corte (prova no RED). O cache **não** é copiado pelo fork: o filho reconstrói o seu na primeira leitura (o digest de entrada de cada evento inclui o `sessionId`). `resumeSession` devolve `analysis`; a análise vira parte da projeção `turns` e a retomada pode passar a ler do checkpoint.
- **C01.** O evento `context/compacted` é só mais um evento para o reducer: a projeção expõe a cobertura (`throughSequence`) e a referência do evento, e nunca descarta turno. A compactação não invalida checkpoint.

## Decisões de desenho que a evidência pede (levadas à SPEC 0292)

1. Metas e todos não cabem no catálogo v1: o S02 entrega o que o log atual sustenta (estado atual, paradas, compactação) e deixa um registro de reducers por tipo de evento para O08/O09.
2. "Pendência" não pode ser "aprovação em aberto": o log só sabe que o turno parou esperando (`stopReason`); se a aprovação foi decidida está no armazenamento de aprovações. A projeção reporta **paradas** (fatos do log), não resolução.
3. O cache precisa de uma leitura **incremental** (validar só a cauda); a validação do prefixo inteiro fica como operação explícita.
4. O estado projetado não deve copiar texto de mensagem (dado de paciente) para uma segunda tabela.

## Lacunas e o que não foi verificado

- Não medi concorrência de leitores nem o custo de escrita do checkpoint.
- Não li os consumidores futuros (S03, S07, O08, O09); só seus cartões.
- A medição usa turnos curtos; sessões com `model/request`/`tool/*` pesam mais por evento.
