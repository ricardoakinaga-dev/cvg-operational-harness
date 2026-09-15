# AAA-12 coverage hardening — mapa cenário → invariante → asserção → cobertura

Baseline FAIL preservado: `baseline.log`/`baseline.exit` (agregado 86.47/82.57/**79.61**/88.07, exit 1).
Resultado final: `after-final.log`/`after-final.exit` (agregado 98.39/96.18/96.11/99.61, exit 0).

## `channel-coverage-inbound-adapters.test.ts`

| Cenário                                        | Invariante                                                  | Asserção observável                                               | Cobertura alvo                                  |
| ---------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| Store sem clock injetado                       | TTL default continua funcionando e varre expirados          | `reserve/has/size` + chave expirada some                          | `idempotency.ts` clock default, `has`, `size`   |
| Deduplicador default                           | Mesma chave aceita uma vez                                  | segunda chamada `accepted=false`                                  | `InboundDeduplicator` default store/clock       |
| Evolution desabilitada                         | Falha fechada sem configuração                              | `normalize`/`send` → `channel_disabled`                           | `assertEnabled` true, `enabled ?? false` false  |
| Evolution com fetch global/clock default       | Envio usa default sem tocar rede real                       | `send` retorna `accepted=true` com `sentAt` parseável             | `?? globalThis.fetch`, clock default            |
| Evolution extendedText sem pushName + overflow | Payload incompleto rejeitado; resposta grande falha fechado | `extendedTextMessage`, `displayName` ausente, `provider_rejected` | normalização e limite de resposta               |
| Chatwoot desabilitada                          | Falha fechada                                               | `channel_disabled` em `normalize`/`send`                          | disabled default + assert                       |
| Chatwoot com URL insegura                      | SSRF rejeitado quando habilitada                            | `url_rejected` na construção                                      | guard de URL                                    |
| Chatwoot payload incompleto/timestamp ruim     | Sem id/conteúdo → inválido; data inválida cai no clock      | erros `invalid_payload`, `timestamp` = clock                      | cond-expr de id, conteúdo, `normalizeTimestamp` |
| Chatwoot timestamps e sender variants          | Numérico/string válidos; sender desconhecido vira `unknown` | ISO esperado; `conversationId` do contexto                        | branches de timestamp/sender                    |
| Fake sem clock + anexos                        | Default clock e expansão de anexos                          | 2 anexos; `sentAt` parseável                                      | clock default do fake e mapper `Array.from`     |

## `channel-coverage-journal-hardening.test.ts`

| Cenário                                       | Invariante                                                  | Asserção observável                                                          | Cobertura alvo                                                |
| --------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `canonicalizePayload`                         | Wrapper delega ao canonicalizador compartilhado             | igual a `canonicalizeJson`                                                   | função deprecated                                             |
| Memory renew/release/complete terminal        | Fencing por owner; terminal não reabre                      | `lease_lost` para owner errado/terminal; `committed` no dono                 | `#settle`, renew, release                                     |
| Memory lease expirado                         | Renew falso e claim bloqueado depois do vencimento          | `renew=false`; `claimSend` → `lease_lost`                                    | branch de lease inativo                                       |
| Memory fail/uncertain/reconciliação           | Terminais honestos; reconciliação só de UNCERTAIN           | `FAILED` estável; `confirmed`/`not_effected`; erro `reconciliation_required` | fail/markUncertain/resolveUncertain                           |
| Memory complete fora de SENDING e espera      | Só SENDING confirma; espera termina por timeout/terminal    | erro `lease_lost`; `waitForTerminal` undefined → CONFIRMED                   | complete guard, waitForTerminal                               |
| Memory conflict/in-flight/uncertain reserve   | Conteúdo divergente vs lease ativo vs incerto não enviam    | outcomes `conflict`, `in_flight`, `uncertain`                                | branches de reserve                                           |
| File fail/release/uncertain sem rewrite       | Transições persistem; re-reserva UNCERTAIN não altera bytes | estados persistidos e bytes idênticos                                        | file fail/release/markUncertain, branch no-write              |
| File wait timeout/terminal                    | Espera não muta; terminal é observável                      | `undefined` → `CONFIRMED`                                                    | waitForTerminal                                               |
| File record ilegível/read-only/temp bloqueado | Falha fechada sem sucesso inventado                         | `journal_unavailable` sem corromper estado                                   | `#readRecord` catch, `#tryCreate` catch, `#writeRecord` catch |
| File link pendente e lock obsoleto            | Criação pós-lock e takeover de lock                         | `reserved`; `claimSend` → SENDING                                            | create-after-lock, stale lock                                 |
| File input legacy/desconhecido                | Legacy explícito aceito; desconhecido falha                 | `reserved` vs `version_mismatch`                                             | validação de input                                            |

## `channel-coverage-gateway-hardening.test.ts`

| Cenário                             | Invariante                                          | Asserção observável                                              | Cobertura alvo                             |
| ----------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------ |
| Gateway sem clock/onEvent           | Defaults não quebram o fluxo                        | `accepted=true`                                                  | construção default                         |
| Inbound adapter lança erro comum    | Evento de rejeição com código seguro                | `invalid_payload` no evento; erro propagado                      | cond-expr do código de rejeição            |
| Replay FAILED/UNCERTAIN             | Reprocessamento não envia de novo; códigos estáveis | `send_failed`/`effect_uncertain`; eventos com código do registro | `#settleReplay` FAILED/UNCERTAIN, defaults |
| Commit perdido após lease vencido   | Resultado persistido vence; evento `replayed`       | retorno do resultado do journal; 1 envio                         | branch CONFIRMED pós-lease_lost            |
| Commit perdido com registro incerto | Sem falso sucesso                                   | `effect_uncertain`; evento uncertain                             | branch markUncertain pós-lease_lost        |
| Envio lento com heartbeat           | Lease renovado enquanto o envio está em andamento   | `renewCalls>=1`; estado final CONFIRMED                          | callback de heartbeat                      |
| Claim perdido antes do envio        | Nenhum efeito                                       | `lease_lost` retryável; 0 envios                                 | catch de claimSend                         |
| Falha permanente + replay           | `FAILED` é terminal; replay devolve a falha         | `provider_rejected` duas vezes; 0 envios                         | fail + replay FAILED                       |
| Release perde fence                 | Sem sucesso inventado                               | `lease_lost`                                                     | branch de transição perdida                |
| Erro comum vira incerto             | Sem retry cego                                      | `effect_uncertain` nas duas chamadas; 0 envios                   | conversão effectUnknown                    |

## `channel-coverage-gateway-journal-paths.test.ts`

| Cenário                                         | Invariante                                                             | Asserção observável                                        | Cobertura alvo                             |
| ----------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| Memory crash SENDING → UNCERTAIN + takeover     | Lease vencido em envio nunca reenvia sozinho; release permite takeover | `uncertain` persistido; novo owner assume após `release`   | `existing?.state`, takeover memory         |
| File SENDING vencido → UNCERTAIN                | Crash em envio grava estado honesto                                    | bytes mudam para `UNCERTAIN`                               | branch de escrita do uncertain             |
| File read-only, conflito, shape inválida        | Falha fechada sem perda de registro                                    | `journal_unavailable`; `conflict`; bytes preservados       | tryCreate catch, conflict, malformed shape |
| File link pendente e lock obsoleto em transição | Criação e takeover sob lock                                            | `reserved`; `claimSend` SENDING                            | create-after-lock, stale lock              |
| Wait/reconcile de registro ausente              | Sem mutação e erro estável                                             | `undefined`; `reconciliation_required`; código `missing`   | optional chains de wait/resolve            |
| Gateway com peer UNCERTAIN/PENDING              | Replay honesto; estado não-terminal falha fechado                      | `effect_uncertain`/`operation_in_progress`; código default | settleReplay UNCERTAIN e throw final       |
| Heartbeat rejeitado                             | Envio continua; falha de renew não derruba o dispatch                  | `accepted=true`; CONFIRMED                                 | catch de renew                             |
| `markUncertain` rejeitado                       | Incerteza prevalece mesmo sem journal                                  | `effect_uncertain`; evento emitido                         | catches de markUncertain (dois caminhos)   |

## Itens não alcançáveis documentados

Ver `manifest-coverage-hardening.json` → `unreachableDocumented`: clock default morto do gateway, `unref` ausente (invariante Node), fallbacks defensivos `?? existing`/terminais e callbacks de erro de `stat`/`unlink` em disputa de lock (branches 100%), guards de endpoint construído a partir de base URL validada e `??` de configuração obrigatória. Nenhum limiar foi reduzido, arquivo excluído ou teste removido; bars finais por arquivo estão no manifesto.
