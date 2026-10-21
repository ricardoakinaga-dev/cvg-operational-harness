<!-- Crítico independente do código do BUILD0249, rodada 1 (Agent general-purpose novo, sem fork, somente leitura, diferente do crítico da SPEC). Texto preservado. -->
# Crítica do BUILD da SPEC0249 (r2), rodada 1

**Veredito: APPROVE. Não há itens obrigatórios.** Diff completo revisado contra a base `6c9fc6517` e a SPEC r2 (sha `f88732dd…`), além das evidências em `build/`. Nenhum arquivo alterado.

## Conferências feitas (sem defeito)

- Escopo: `git diff --stat` vazio em `postgres.ts`, `packages/harness`, `apps/api`, `apps/web`, `products`, `package.json`, lockfile e migrações. Testes existentes mudaram só nos três arquivos da §3.7; nos demais só entraram blocos novos.
- Token de claim no PG: `INSERT … RETURNING id::text` validado pela regex, fail-closed; `requireOutboxClaimToken` antes de qualquer transação; a cerca combina `lockOutboxEvent` (FOR UPDATE, `tenant_id = $1`), `isLiveLease` e `isCurrentClaimAttempt` (tenant explícito, `event_id`, `id`, `worker_id`, `attempt = attempts`, outcome e ausência de tentativa mais nova); helper nas duas transações do `ack`; ramo `processed` exige outcome `processed`; takeover relê com lock antes de `suppressOutboxForTakeover`; UPDATE finais com `attempts = $a`; tentativas fechadas por `id = token`; todos os escritores de `outbox_attempts` sob o lock do evento, sem janela.
- `renewClaim`: `null` sem escrita para lease vencido, outro dono, token velho ou fora de `processing`; token ausente/inválido lança; `GREATEST` e CAS completo; sem BEGIN aninhado.
- Exaustão no `claimNext`: limite 25, CAS sobre status e tentativas lidos, fechamento `lease_expired`, audit `dead_letter`; paridade com o dublê; AC09 com role mínimo.
- Chamadores: `completeClaimedOutboxEvent` (quatro chamadas), duas liberações de shutdown, prova `rem21-010` e testes passam o token; nenhum outro chamador PG sem token em `apps`, `packages`, `products`, `scripts`, `tests` e `legacy`.
- Execution spine: ramo idêntico ao da exaustão do claim, compatível com 0016/0018; a lista devolvida exclui a execução terminal.
- Preflight: o inventário canônico produz as mesmas expressões que a base para todas as tabelas críticas; mensagens preservadas; tabela fora do inventário falha fechado; o kernel confere RLS/FORCE/política sem checar dono e mantém `kernel_runtime_prerequisites_missing`; `migrate-job` concede todo o inventário.
- Trilha de auditoria: cursor só avança depois do COMMIT; reconciliação pelo maior `sequence` correta (ledger começa em 1); flush serializado; rotação só descarta o ledger mais antigo persistido e sem turno ativo; erro do turno tem precedência; linha gravada igual à base; sem espera circular no pool.
- Oracle F26: `observedAt` do banco, cabeçalho ISO, `timingSafeEqual`; baseline só depois do último start da API; guard de entrypoint igual ao do `production-target-smoke`; ajustes `?? ''` sem mudança de comportamento; histórico do teste confere com o raw de 20/10.
- Testes: os 30 novos falham na base pelo motivo certo e passam no candidato; falhas da primeira rodada verde (AC06/AC08) vinham do sanitizador e foram corrigidas só no teste; timeout do hook do AAA-21 é instabilidade preexistente (passou na reexecução); M2 morre na AC05; fixtures PG com role sem SUPERUSER/BYPASSRLS e só SELECT/INSERT/UPDATE.

## P3 (opcionais)

1. `kernel-audit-trail.test.ts`, último teste: `expect(trail.pendingLedgers()).toBe(1)` consulta um `trail` não usado (asserção vazia); trocar por `ordered.pendingLedgers()`.
2. `outbox.ts` `heartbeatClaim` (dublê): devolve `null` com token divergente; a §3.2 item 7 diz "recusam com conflict", mas a §3.3 itens 3 e 5 pede `null` com a mesma semântica; `null` é o correto (senão o worker não marcaria `lease_lost`). Registrar a interpretação.
3. AC07: verificar "sem escrita" também nas recusas por outro dono e por token velho.
4. Nenhum teste isola a checagem `newer`; na AC05 ela e a de outcome se cobrem. Defesa em profundidade.
5. Paridade: `heartbeatClaim` do dublê aceita qualquer `leaseMs` positivo; o PG exige 1.000–3.600.000.
6. `outbox_error:lease_expired_exhausted` volta como `[redacted-outbox-error]` pelo `mapDurableOutboxRow`; dá para tratá-lo como o erro de takeover em `postgres-outbox.ts`.
7. Dublê: `findById`/`pending` expõem `claimToken` (previsto na SPEC); só dev.
8. AC15: faltam logs de `prettier --check` e `npm run -s lint` em `build/`.
9. Custo do flush: `ledger.records()` copia o ledger a cada lote; aceitável, registrar.
