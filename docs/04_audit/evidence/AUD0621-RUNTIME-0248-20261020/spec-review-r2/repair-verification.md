# Verificação restrita do reparo da r2 — SPEC0248 r3

- SPEC: `materialized/0248_runtime_budget_cancel_limits.md.txt`, sha256 `d4392f0b056d469db74f819b7ec746c59d0847e41d12eb2f9a763fcdcd9ec39e` (r3).
- Escopo: só a aplicação do R2-01 e os trechos alterados (diff r2→r3 de 83 linhas); não é terceira revisão completa. Mesmo crítico, só leitura.
- Veredito: **APPROVE** — R2-01 fechado; nenhum obrigatório novo nos trechos alterados.

Parecer (transcrição fiel): a §3.3 e o AC13 agora concordam (`beginRepair` recusa com turno cancelado; `recordCall` com turno cancelado e porta aberta conta o uso válido e dá falso; porta fechada: as três dão falso sem contar; AC13 cobre os dois casos). Coerentes também: §3.2 itens 5 e 6, §3.5 itens 1–4 e 6, AC24 e a mensagem de uso inválido em `recordCall`. A lista de abertos da HISO-011 inclui o teto padrão do transporte sem contradizer a §3.5.1.

P3 opcional: no §3.5 item 3, falha de `body.cancel()` no ramo não 2xx deve ser ignorada (`.catch`) e não pode substituir nem atrasar o erro HTTP. Tratamento: aplicado na implementação (`await response.body?.cancel().catch(() => undefined)` antes de `providerHttpError`); sem mudança de texto, para não alterar o hash aprovado.

Gate: com este APPROVE sem obrigatórios, o BUILD local `AUD0621-RUNTIME-BUILD-0248-20261020` começa, conforme a decisão do usuário de 20/10/2026.
