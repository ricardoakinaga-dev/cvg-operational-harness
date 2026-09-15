# AAA-12 — Gap de canonicalização e política de hashes persistidos

- Task: `AAA-12`. Autor: agent-2. Data: 2026-09-12.
- Origem: finding `AAA05-C2-F01` do parecer `docs/04_audit/evidence/AAA/AAA-05/review-coordinator-v2/REVIEW.md`; contrato alvo em `docs/02_spec/aaa_data_api_contract.md` v3 §1.1.
- Natureza: **handoff documental**. Nenhum código foi alterado; os 12 hashes de código do `manifest.json` permanecem intactos.

## Contraexemplo reproduzido

- Probe: `docs/04_audit/evidence/AAA/AAA-05/v3/canonical-probe-repro.log` (reexecução do probe do coordenador, exit 0).
- Entrada válida pelo schema (`CanonicalOutboundMessageSchema.shape.metadata`): `{"2":"two","10":"ten"}`.
- Runtime (`canonicalizeJson`, `@cvg/shared`): `{"10":"ten","2":"two"}` → sha256 `b71e124675fc80e7314688bffdb68e83515851fb51474125db9a0c4c8aca3808`.
- Canal (`canonicalizePayload`, candidato): `{"2":"two","10":"ten"}` → sha256 `d7d8369c8035a81d2664403842012bcbcf7165d2f980b78a645f5b6a15fa8a60`.
- Consequência: a afirmação de equivalência dos canonicalizadores no domínio válido é **falsa**.

## Causa raiz

`canonicalizePayload` monta um objeto e delega a serialização a `JSON.stringify`. Em JavaScript, `JSON.stringify` ordena chaves integer-like em ordem numérica crescente, ignorando a ordenação por code units UTF-16 feita antes — `"2"` sai antes de `"10"`, enquanto o canonicalizador compartilhado serializa manualmente e mantém `"10"` antes de `"2"`. A ordenação explícita é anulada por esse comportamento.

## Divergências conhecidas (domínio do payload)

| Entrada                                           | `canonicalizeJson` (alvo)         | `canonicalizePayload` (candidato)                   |
| ------------------------------------------------- | --------------------------------- | --------------------------------------------------- |
| chaves integer-like (`"2"`, `"10"`)               | UTF-16 manual (`10` antes de `2`) | numérico via `JSON.stringify` (`2` antes de `10`)   |
| número não finito                                 | rejeita                           | serializa como `null`                               |
| `Date`                                            | rejeita (objeto não plano)        | vira `{}` (sem propriedades enumeráveis)            |
| `undefined` de topo                               | rejeita                           | `JSON.stringify` devolve `undefined` → erro de hash |
| `bigint` / ciclo                                  | rejeita                           | TypeError / estouro de pilha                        |
| membros `undefined`, arrays, `-0`, budgets, plain | regras definidas                  | parcialmente equivalentes                           |

Observação: no fluxo atual o canal calcula o hash apenas para o próprio journal (consistente consigo mesmo), mas o vínculo cross-boundary só é verificável quando ambos usam o mesmo algoritmo.

## Mudança de algoritmo ainda pendente

1. Substituir `canonicalizePayload` por `canonicalizeJson` de `@cvg/shared` no pacote `channel-gateway` (fonte única canônica).
2. Adicionar `hashVersion` ao registro e à porta `ChannelEffectJournal` (`shared-rfc8785-subset-v1` como alvo; `legacy-local-v1` no candidato).
3. Atualizar o gateway/dispatch para propagar `hashVersion` na reserva.
4. Emitir novo digest de candidato e submeter à revisão independente; nenhuma alteração entra sem task/escopo e gate aplicável.
5. Teste de binding da projeção completa especificado no contrato v3 §1.1 (chaves integer-like/Unicode, permutações, aninhamento, metadata vazia, falha fechada por versão divergente).

## Política de hashes persistidos (proposta normativa)

- Nunca apagar o journal, nunca reescrever hashes antigos e **nunca permitir reenvio para contornar conflito** de hash.
- `hash_version` aditiva com default `legacy-local-v1`; registros novos usam a versão do algoritmo vigente no momento da reserva.
- Reuso de chave com versão de hash diferente: **não** comparar hashes; resolver por versão + estado/reconciliação explícita; falha fechada `hash_algorithm_mismatch`.
- `idempotency_key_reuse` só pode decorrer de hashes comparáveis (mesma versão e mesmo algoritmo).

## Confirmação de integridade

- 12/12 hashes de código conferidos contra `docs/04_audit/evidence/AAA/AAA-12/manifest.json`; candidato `33aa2807…` (legado) / `ae9c2b60…` (canônico) inalterados.
- Este documento não fecha `AAA12-R3-F02` (composição do journal durável), que segue rastreado em AAA-21.
