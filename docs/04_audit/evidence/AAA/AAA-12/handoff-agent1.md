# Handoff AAA-12 → coordenador (agent-1)

- Task: `AAA-12` — eliminar corrida de envio e persistir journal do canal (`AUD-20260912-F04`).
- Status: **IMPLEMENTED_PENDING_INDEPENDENT_REVIEW** (não é DONE; nenhuma autoaprovação).
- Contratos: `AAA-03` sha256 `db75899f6b730fa04b642da8cdc6d65e747a7c7e62e22673bf038a52163d66f8` (DRAFT_FOR_INDEPENDENT_REVIEW); `AAA-05` sha256 `8db1541f3f0428b64b47d5235c406cc4450b19ecc85eee75290837229dbf17e5`; reconciliação de identidade na §3.1 do contrato AAA-05.
- Candidato: base `512bc11e80fbf7c7b8baf6263aacc811ff829309`; digest dos arquivos alterados `33aa280785c149253dec5b42491ffea930d3424ee7a0095b8b8791b983122605` (hashes por arquivo no `manifest.json`).

## Reprodução anterior (preservada)

- `Promise.all` de dois `dispatch` iguais retornava **2 envios** no adapter falso; chave reutilizada com payload diferente enviava de novo.
- Logs: `red-concurrency.log` / `red-concurrency.exit` (exit 1, 2/2 falhas). A reprodução virou regressão permanente em `channel-effect-race.test.ts`.

## Correção aplicada

- Reserva atômica **antes** do envio (`reserve`), `claimSend` com fencing por lease token, heartbeat, e estados `PENDING/SENDING/CONFIRMED/FAILED/UNCERTAIN/EXPIRED`.
- Identidade `(tenantId, channel, operationKind, idempotencyKey)` + `payloadHash` canônico; divergência → `idempotency_key_reuse` sem envio.
- Journal durável local `FileChannelEffectJournal` (host único): criação exclusiva de arquivo, lock por operação, rename atômico, sobrevive a restart e a duas instâncias no mesmo host. `InMemoryChannelEffectJournal` documentado como não durável.
- Resultado incerto (`effectUnknown` de erro de rede) vira `UNCERTAIN`; retry cego bloqueado; reconciliação explícita via `resolveUncertain`. Nenhuma promessa de exactly-once sem idempotência/consulta do provider.
- Adapters Evolution/Chatwoot: erro de rede → `send_failed` com `effectUnknown=true`; resposta HTTP explícita continua `provider_rejected`.

## Comandos e resultados

| Comando | Exit | Resultado |
| --- | --- | --- |
| `npx vitest run packages/channel-gateway packages/chaos` (com PostgreSQL descartável) | 0 | 8 arquivos / 62 testes PASS |
| `npm test` | 0 | 175 arquivos PASS, 4 skipped; 886 testes PASS, 27 skipped (skips condicionais preexistentes de PostgreSQL sem URL) |
| `npm run typecheck` | 0 | — |
| `npm run lint` | 0 | — |
| `git diff --check` | 0 | — |
| coverage (`--coverage.reportsDirectory` próprio) | 0 | global 86.41/81.46/89.71/87.51; novos módulos declarados no manifest |

- 11 cenários obrigatórios mapeados nominalmente no `manifest.json`; estado durável e contagem de efeitos observados no adapter e no journal, não em mocks de retorno.
- Concorrência: `Promise.all` (1 envio), duas instâncias sobre o mesmo diretório durável (1 envio), restart após reserva (takeover, 1 envio), lease expirado com trabalhador atrasado (sem segundo envio nem falso sucesso).

## Recurso e isolamento

- Nenhum arquivo de `packages/persistence/` (incl. `outbox.ts`/`postgres.ts`), migration, export, `package.json`, workflow ou certificação foi tocado.
- Nenhum canal/provider real, segredo, dado real ou banco operacional; testes usam adapter falso e diretórios temporários.

## Bloqueios e pedidos ao coordenador

1. **Revisão independente** do candidato (agent-1 ou agent-3), com foco em: corrida real entre instâncias, fencing de lease, semântica de `UNCERTAIN`, reuso de chave.
2. **Reserva da migration 0012** (última existente: `0011_outbox_payload_redaction`) e definição do owner do adapter SQL (`packages/persistence/src/...` + migration). Sem isso, o caminho durável fica limitado a host único.
3. **Decisão de composição AAA-10**: consumir `idempotencyKey = operationKey` (AAA-03 §2/§8) para que runtime e canal compartilhem a mesma identidade lógica.
4. Gates `G_SPEC` (AAA-03/AAA-05 em revisão) e `AAA-04` pendentes; a implementação ocorreu no escopo controlado autorizado pelo brief e não substitui o gate.

## Limitações / riscos

- Cobertura de branches/functions dos módulos novos abaixo da barra proposta de 95% para módulos críticos (gateway 76.6/54.5; effect-journal 73.3/85.7); registrado para AAA-04/AAA-15.
- Adapter em arquivo não é multi-host; multi-host exige SQL/PostgreSQL.
- Reconciliação de efeito real depende de provider com idempotência/consulta (D05-4).
- Qualquer alteração posterior em `packages/channel-gateway/` invalida este candidato e sua revisão.

## Cleanup / recuperação

- Testes criam diretórios temporários e os removem no `afterEach`; nenhum recurso persistente do pacote permanece.
- Recuperação do journal: reiniciar sobre o mesmo diretório; operações `PENDING` com lease vencido são retomadas com fencing; `SENDING` vencido vira `UNCERTAIN` e exige `resolveUncertain`.
- Rollback do diff: reverter apenas os arquivos listados no `manifest.json`; sem migration aplicada não há rollback de dados.
