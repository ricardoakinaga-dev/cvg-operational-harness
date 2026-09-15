# AAA-12 independent review — agent-3 (data/channel front)

- Verdict: `APPROVE` (scope: candidate files listed in `docs/04_audit/evidence/AAA/AAA-12/manifest.json`, all 12 file hashes matched at review time).
- Reviewer: `agent-3`; did not implement AAA-12; builder evidence not edited.
- Independent evidence: `focused-independent.log` (8 files/62 tests PASS), `focused-independent.exit` (0), `reproduce-recheck.txt` (F04 reproduction now `sends=1`), digest recheck below.

## Acceptance checks (independently observed)

| Critério                                                 | Resultado                                                                                                                           |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Promise.all` de dois dispatch idênticos gera um envio   | PASS: reprodução da auditoria agora retorna `channelRace.sends=1`                                                                   |
| Reuso de chave com payload diferente rejeitado           | PASS: testes `channel-effect-journal*` passam com `idempotency_key_reuse`, código reconciliado com AAA-03/AAA-05                    |
| Duas instâncias/restart preservam resultado (host único) | PASS no escopo controlado: `FileChannelEffectJournal` com criação exclusiva de arquivo + lock/rename; suíte de bordas/restart passa |
| Reserva antes do envio                                   | PASS por inspeção de `gateway.ts`: `reserve` (linha ~201) → `claimSend` (~249) → `adapter.send`; `lease_lost` nunca gera sucesso    |

## Findings

1. `AAA12-R3-F01` (P2, evidência) — o `candidateDigest` `33aa2807…` do manifesto **não é reproduzível** a partir da definição documentada ("sha256 of sorted path\0sha256 lines"). Todos os 12 hashes de arquivo conferem, mas a agregação não fecha em nenhuma variação testada. `closeWith`: publicar o comando/definição exatos e regerar o digest, ou substituí-lo pelo `candidateId` do AAA-13.
2. `AAA12-R3-F02` (P2, composição) — `ChannelGateway` usa `InMemoryChannelEffectJournal` por padrão; nenhum caminho não-teste compõe o journal durável. A garantia "reserva durável antes do efeito" só vale com injeção explícita. `closeWith`: AAA-21 deve injetar o journal durável e falhar fechado sem ele; registrar a limitação host-local (não cross-host) até adapter SQL (D05-1/D05-2).

## Limites

- Revisão host-local; não cobre PostgreSQL do journal de canal (pendente de D05-1/D05-2).
- APPROVE não é signoff humano e não fecha F04 em produção.
