# SPEC — AUD19-013 — UX e acessibilidade operacional

- programa: `AUD-20260919-REMEDIATION`; onda: `W3`; dependência: `AUD19-010` ✅.
- aprovação técnica: prompt humano de 2026-09-19; escopo local/sintético.
  Browsers declarados: **Chromium** (único instalado/declarado no projeto;
  Firefox/WebKit = residual explícito, sem alegação).

## Desenho

Novo `tests/e2e/ux-accessibility.spec.ts` (Chromium, viewport matrix
mobile/tablet/desktop herdada do padrão existente):

1. **axe** (`axe-core` + `@axe-core/playwright`, devDeps novos): scan das
   vistas identidade/console sem violações `serious`/`critical`.
2. **Teclado**: Tab alcança controles-chave (skip link, identidade, ações);
   Enter ativa; foco visível; `Esc`/ação fecha sem travar.
3. **Estados**: vazio (sem conversas), erro (API interceptada → 500/offline →
   mensagem compreensível, sem branco), overflow (sem scroll horizontal),
   loading (indicador presente durante fetch lento).
4. **Tenant switch**: identidade A com dados → troca para B → dados de A
   ausentes (sem vazamento).
5. **Autorização**: 401/403/429/5xx interceptados → UI compreensível.
6. **Screenshots**: capturas estáveis em `docs/04_audit/evidence/AUD-20260919/AUD19-013/`
   (sem comparação de snapshot — sem flakiness entre ambientes).
7. **Reduced motion**: `emulateMedia(reduced)` sem quebrar journeys.

## Critérios de aceite (congelados)

1. Journeys críticas passam em Chromium; axe 0 serious/critical.
2. Sem vazamento entre identidades; falhas compreensíveis.
3. `npm run test:e2e` verde no relatório desta task.

## Arquivos (congelados)

- novos: `tests/e2e/ux-accessibility.spec.ts`;
- editados: `package.json`/`package-lock.json` (axe devDeps).

## Evidência

- `docs/04_audit/evidence/AUD-20260919/AUD19-013/`
