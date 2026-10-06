# I12 — nova crítica independente requerida antes do BUILD da SPEC 0162

- **Data:** 29/09/2026.
- **Candidato verificado antes e depois da leitura:** `docs/02_spec/0162_webhook_clock_highwater_marker.md`, SHA-256 `c33410876ef204faa655e41c663630bed127a9d9df274c50fd9427f86a07e53e`.
- **Veredito:** `REVISE`; sem P0, 1 P1 e 1 P2. A revisão ocorreu em contexto independente, somente leitura. Não houve BUILD, teste, banco ou edição.

## Achados

### P1 — reserva usa amostra anterior às confirmações externas

**Referência:** SPEC 0162, “Avanço e decisão” e “Precisão, assinatura e saúde temporal”; SPEC 0160, §A.2.

A SPEC valida a janela contra `sampled_at`, que antecede os receipts observer/witness. A amostra, os receipts e o update podem atravessar a expiração; a A2 permite uma captura→attest/update limitada a 100 ms. O timestamp assinado pode deixar de ser válido antes da reserva e ainda ser aceito contra a amostra anterior. A reserva precisa reavaliar a janela com `clock_timestamp()` no ponto da mutação atômica e cobrir explicitamente essa corrida nos testes.

### P2 — upgrade de instalação 0027 sem ledger completo

**Referência:** SPEC 0162, “Atomicidade da migration e bootstrap”, regra de bootstrap sem histórico.

O bootstrap define baseline novo e impede o caminho sem histórico quando não se prova que o ingress nunca abriu. Falta o procedimento para uma instalação 0027 que já serviu webhooks, mas não tem ledger SAMPLE completo: como fechar e drenar todas as instâncias, preservar os eventos existentes e estabelecer uma baseline segura sem confundir esse caso com genesis.

## Riscos residuais

O protocolo depende de witness/WORM, controller, verifier/HSM, sink, registry de identidade e autoridade de fencing independentes. Testes sintéticos não provam sua independência operacional ou durabilidade em produção. O claim de BUILD da SPEC 0162 aparecia `ATIVO`; a revisão não inspecionou o worktree desse claim.
