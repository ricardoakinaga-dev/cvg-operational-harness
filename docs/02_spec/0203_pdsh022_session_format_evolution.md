# 0203 — PDSH-022: evolução de formato de sessão (registry adjacente, geração conservada)

- Task `PARE-DSH-20261011`, cartão PDSH-022, Onda 3 do [plano 0375](../03_build/0375_plano_pareamento_motor_dsh.md), trilha T3.
- Dependência `DONE_LOCAL`: PDSH-021 (store append-only, SPEC [0202](0202_pdsh020_session_event_format.md)). Regras de evolução herdadas da §6 da 0202.
- Invariantes: ADR-010/011 (núcleo neutro, sem spine paralelo), fail-closed, sem dado real/provider, `products/**` intacto, push/deploy/release não autorizados, produção `NO_GO`.

## 1. Recon

- A geração v1 está congelada em `packages/contracts/src/session-event-schemas.v1.json` (9 tipos, fingerprint SHA-256 de `{formatVersion, type, payload, definitions}`) e validada em `packages/harness/src/session/events.ts`.
- O store append-only (PDSH-021) nunca atualiza eventos: `session_events` tem triggers que recusam UPDATE/DELETE/TRUNCATE e o cursor do stream é a única escrita mutável (avanço monotônico).
- A regra §6 da 0202 exige: geração vN nunca renomeada/sobrescrita; registros com versão/fingerprint desconhecidos são erro explícito; migrações vN→vN+1 são funções puras e determinísticas que produzem **nova visão/geração**, conservando os eventos vN; sem pular versões; ausência de transform bloqueia o consumidor.
- O critério S09 da 0202 pede prova de "transform adjacente determinístico mantendo v1" e falha em "pular geração, schema/fingerprint errado, mutação da origem".

**Decisão de escopo:** o mecanismo é um registry neutro em `packages/harness/src/session/format-migration.ts`. A v2 usada nos testes é **sintética** (fixture de teste), não um catálogo de produto: nenhum schema v2 real é publicado nesta fatia, evitando inventar formato futuro. O registry é genérico sobre definições fornecidas pela composição; a definição v1 é um adaptador pronto sobre o catálogo real.

## 2. Contrato

```ts
export interface SessionFormatEvent {
  readonly formatVersion: number
  readonly eventId: string
  readonly tenantId: string
  readonly sessionId: string
  readonly sequence: number
  readonly type: string
  readonly schemaFingerprint: string
  readonly timestamp: string
  readonly correlationId: string
  readonly traceId: string
  readonly payload: SessionJson
}

export interface SessionFormatDefinition {
  readonly version: number
  readonly validate: (event: unknown) => SessionFormatEvent
  readonly fingerprint: (type: string) => string
}

export interface SessionFormatStep {
  readonly from: number
  readonly to: number
  readonly transform: (event: SessionFormatEvent) => SessionJson
}

export function createSessionFormatRegistry(input: {
  readonly definitions: readonly SessionFormatDefinition[]
  readonly steps: readonly SessionFormatStep[]
}): SessionFormatRegistry

export interface SessionFormatRegistry {
  readonly versions: readonly number[]
  migrate(event: unknown, targetVersion: number): SessionFormatEvent
}

export function sessionFormatDefinitionV1(): SessionFormatDefinition
```

Erros estáveis em `SessionFormatMigrationError`:

| Código                    | Quando                                                                                                                     |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `format_registry_invalid` | boot: versões/definições inválidas, passo não adjacente ou duplicado, referência a versão sem definição, transform ausente |
| `unknown_format_version`  | origem ou destino sem definição                                                                                            |
| `missing_format_step`     | cadeia sem passo adjacente para a próxima geração                                                                          |
| `downgrade_not_supported` | destino menor que a origem                                                                                                 |
| `invalid_step_output`     | transform lançou, mutou entrada congelada ou produziu evento inválido no destino                                           |

## 3. Semântica

- **Boot fail-closed:** `to === from + 1` é obrigatório (adjacência); `from`/`to` precisam de definição; `from` único; definições com versão única e funções presentes; pelo menos uma definição. Cadeias parciais são válidas no boot; a ausência de passo bloqueia no `migrate`.
- **Migração:** valida a origem com a definição da versão do evento (clone destacado) → enquanto `atual < destino`: pega o passo adjacente, congela profundamente o evento atual, chama `transform` puro, monta o candidato com `formatVersion` do destino e `fingerprint(type)` da definição do destino, valida com a definição do destino; repete. Devolve a visão final validada.
- **Origem nunca mutada:** a validação devolve objeto novo; o valor entregue ao transform é congelado; mutação por transform vira `invalid_step_output`. O evento de entrada permanece byte-idêntico.
- **Determinismo:** transforms puros + validação canônica ⇒ mesma entrada, mesma saída canônica, em qualquer instância equivalente do registry.
- **Sem downgrade e sem pulo:** destino menor → `downgrade_not_supported`; ausência de passo → `missing_format_step` (nunca aproximar/coagir).
- **Fingerprint/schema errados:** o candidato é validado pela definição do destino; payload/fingerprint que não batem com o schema catalogado daquela geração → `invalid_step_output`.
- **Geração vN conservada:** nada aqui escreve no store; a leitura existente continua validando cada linha na versão própria. Migração é uma **visão derivada**; nenhum UPDATE de payload histórico (triggers da 0028 permanecem a barreira de banco).

## 4. Runbook de release de formato (documentação)

1. Congelar a geração atual (arquivo de schemas + fingerprints) — nunca editar em linha.
2. Adicionar a definição `vN+1` (novo arquivo de schemas sintético ou real) e o passo adjacente `vN→vN+1` puro.
3. Registrar guardas: boot inválido, cadeia completa, falhas de schema/fingerprint, imutabilidade da origem (critérios S09).
4. Deploy: código antigo ignora `vN+1`; leitores que pedirem `vN+1` usam `migrate` sobre eventos `vN`; nenhum backfill.
5. Rollback: manter tabelas/gerações; reverter apenas o código consumidor. Nunca DROP/renomear geração; remoção exige decisão de retenção específica.
6. Sem pular versões: ausência de transform bloqueia o consumidor (erro explícito, nunca leitura parcial silenciosa).

## 5. Critérios de pronto

- [x] `packages/harness/src/session/format-migration.ts` com registry boot-validado, `migrate` sem mutação da origem e `sessionFormatDefinitionV1` sobre o catálogo real.
- [x] S09: teste feliz v1→v2 (fixture sintética), determinismo, cadeia v1→v2→v3, origem congelada intacta.
- [x] S09 negativos: passo não adjacente/duplicado/versão indefinida no boot; versão desconhecida; downgrade; passo ausente; transform que muta; output fora do schema/fingerprint do destino.
- [x] Export no barrel de sessão/harness + PUBLIC_API/PINNED.
- [x] Verdes: foco, suíte completa, `test:postgres`, E2E, typecheck, lint, prettier, catálogos, fronteira, `docs:check-links`.

## 6. Verificação

- `npx vitest run packages/harness/src/__tests__/pdsh-022-session-format-evolution.test.ts`.
- Gates padrão da rodada em Node 22.23.2 com PG descartável próprio; evidência em `docs/04_audit/evidence/PDSH-022-20261012/`.

## 7. Fora de escopo

PDSH-023..026 e W4; publicação de um schema v2 real (a fixture é de teste); backfill; retenção/deleção; `products/**`.

## 8. Fechamento — 12/10/2026

`DONE_LOCAL`, trilha T3 sob a autorização do plano. [Evidência](../04_audit/evidence/PDSH-022-20261012/summary.md).

- Registry + definição v1 + barrel de sessão/harness; PUBLIC_API/PINNED atualizados. Nenhum schema v2 real, backfill, UPDATE ou remoção: geração v1 conservada no store (triggers da 0028 intactos).
- Gates Node 22.23.2: foco 8/8; suíte completa 381 arquivos/3234 testes +1 skip; `test:postgres` 37/302 e +guarda de sessão 38/311, zero skips; E2E 12/12; fronteira PASS; typecheck/lint/catálogos/formato/diff PASS; `docs:check-links` no fechamento.
- Self-review separada cobriu determinismo, origem congelada, cadeia, downgrade, passo ausente e schema/fingerprint errados; falha intermediária de typecheck (cast inválido no teste) preservada e corrigida. Não é aceite independente de segurança/release.
- Limite: v2/v3 são fixtures de teste; determinismo é observado por re-execução; nenhum consumidor real de v2 existe ainda (PDSH-023+). Produção `NO_GO`; próximo PDSH-023.
