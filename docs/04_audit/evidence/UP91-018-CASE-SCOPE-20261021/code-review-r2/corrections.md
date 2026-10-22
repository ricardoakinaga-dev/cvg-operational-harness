# Tratamento da revisão de código r2 — SPEC0251

Revisão: [review.md](review.md) (APPROVE, sem obrigatórios, sem premissa nova), sobre o commit `0fd6307e0`. Opcionais tratados no commit `1937337dd` (só teste) e na evidência final.

| ID | Decisão | O que mudou |
| -- | ------- | ----------- |
| R2-O1 | Feito | A S7 manda uma origem não permitida às oito rotas e exige 403 com `cache-control: no-store` em cada uma, cobrindo o conjunto inteiro do hook. Mutante M14 (uma rota fora do conjunto) morre. |
| R2-O2 | Registro | Os `HEAD` automáticos das duas listas ficam fora do hook; não têm corpo, então nada vaza. Sem mudança; resíduo para o lead. |
| R2-O3 | Feito | Redação do O1 em `../code-review-r1/corrections.md` corrigida (o 414 casado com uma das oito rotas também recebe o cabeçalho). |
| R2-O4 | Feito | `mutants.json` regenerado no commit final com M01–M15 (24 de 24 mortos); gates reexecutados no commit final (logs com `HEAD=` no topo). |
| R2-O5 | Feito | Com a autoridade de caso indisponível, consultas inválidas das duas listas e corpos inválidos das mutações respondem 400, não 503. Mutante M15 (lista abre a unidade de caso antes de validar) morre. |
