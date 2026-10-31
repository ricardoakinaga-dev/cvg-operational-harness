# Resposta à conferência Codex da SPEC 0295 R1 (`44de8e510`) — R2

Autor: Claude D9. Só documentos; sem BUILD.

| Achado | Resposta | Onde |
|---|---|---|
| P2 — o teto de 4 MiB contava `JSON.stringify(record).length` (UTF-16) | Troca para `Buffer.byteLength(JSON.stringify(record), 'utf8')`. Regra da primeira entrada grande demais: o primeiro evento que faria a soma passar de 4 MiB não é examinado nem vira elo; a dimensão para, `truncated: true` e `budget_exhausted(bytes)`; um evento maior que o orçamento inteiro dá o mesmo sem elo. Resíduo declarado: a página lida (até 100 eventos) já está em memória; o teto de 1 MiB por evento limita o pico. Testes da BUILD listados: ASCII na fronteira, multibyte (`漢`, `😀`) onde `.length` passa e os bytes não, oversized, e o mutante que volta para `.length`. | §5.3 |
| P3 — exemplo errado da janela | Com 2001 candidatos e o match no 1500º: uma página vazia com cursor, depois a página com o item (janela 1001 a 2000), depois uma página final vazia com `nextCursor: null` (janela curta de 1 candidato). | §7, linha F03 |
