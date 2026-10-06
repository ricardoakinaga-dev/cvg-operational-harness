# PR301-WEBHOOK-WINDOW-FIX-001 — verificação local

**Data:** 28/09/2026 (America/Sao_Paulo)  
**Baseline:** `eff8e0d8974f2c3222eb4602e4a37ff73c708245`  
**SPEC:** 0160, BUILD sintético aprovado pelo usuário.  
**Veredito:** correção local verificada; `NO_GO` para produção.

## Correção

A reserva de replay agora expira em `(timestamp assinado + tolerância)`, que é o último instante em que a assinatura ainda é aceita. Antes, a retenção começava no instante de recebimento; um evento carimbado 299 segundos no futuro voltava a ser aceito após 301 segundos, embora sua assinatura continuasse válida.

O teste de regressão reproduziu o comportamento anterior (`true, false, true`) e agora cobre armazenamento em memória e PostgreSQL. A prova PostgreSQL lê o `expires_at` efetivamente persistido e confirma replay recusado em `+301 s`, na fronteira da janela e após seu vencimento.

## Verificações

- Teste focal, Node 22 + PostgreSQL descartável: **18/18 PASS, zero skips**.
- `npm run test:postgres`, Node 22 + PostgreSQL 16.15 descartável: **35 arquivos, 260/260 PASS**.
- `npm test`, Node 22 + PostgreSQL descartável: **327 arquivos; 2.403 PASS, 1 skipped**. O skip é mantido como pendência de governança já registrada em AUD-0590.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS.
- Prettier nos dois arquivos alterados: PASS.
- `git diff --check` nos arquivos reivindicados: PASS.
- `npm run docs:check-links`: PASS; zero links quebrados e higiene com 231/231 artefatos vazios catalogados, 647 JSONs parseados.

O container `cvg-pr301-webhook-window-20260928`, PostgreSQL 16.15, ficou limitado a `127.0.0.1:55495` e foi removido após os testes; a porta ficou livre. Não foram usados dados reais.

## Limites

Este delta corrige a retenção ligada à janela HMAC. Não demonstra persistência de high-water após rollback/restart, divergência entre relógios, reconciliação de evento pendente, efeito externo idempotente, integração final de `server.ts`, CI/atestação ou staging. Esses gates continuam abertos; a migration 0028 da SPEC 0162 não foi iniciada nem autorizada neste trabalho. O finding F01 fica **parcialmente mitigado**, sem qualificação para produção.

## Artefatos

- `webhook-postgres-focused.log`
- `npm-test-node22-postgres.log`
- `test-postgres-node22.log`
- `typecheck-node22.log`
- `lint-node22.log`
- `docs-check.log`
- `ledger-handoff.md`
- `proof.json`
