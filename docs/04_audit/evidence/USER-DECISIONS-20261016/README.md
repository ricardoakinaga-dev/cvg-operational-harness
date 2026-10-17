# Decisões do usuário — 16/10/2026

Pedido do usuário: "vamos decidir o que tiver que resolver". Decisões tomadas por perguntas na sessão Claude Code `f5` (task `PARE100-GAP-20261016-F5`), sem dado real, sem BUILD e sem push.

- [D1–D7 do roadmap de paridade](../PARE100-GAP-20261016/decisions-d1-d7.json): todas com a opção recomendada; [roadmap 0379](../../../03_build/0379_roadmap_paridade_100_deepseek.md) e [backlog 0380](../../../03_build/0380_backlog_paridade_100_deepseek.md) aprovados como plano oficial.
- [Gates T3 pendentes do PARE100](spec-gates.json), ligados ao SHA-256 de cada SPEC. Cada SPEC teve um resumo independente feito por subagente Sonnet (somente leitura) antes da pergunta.

  | SPEC | Decisão                    | Cartão PAR      |
  | ---- | -------------------------- | --------------- |
  | 0220 | Adiada; refazer na 0227    | PAR-K01         |
  | 0221 | Aprovada com ajustes       | PAR-S01         |
  | 0222 | Aprovada com ajustes       | PAR-K04         |
  | 0225 | Aprovada com ajustes       | PAR-K03, C03    |
  | 0226 | Adiada; reduzir após 0225  | PAR-K01, K03    |

- [Produção do núcleo, fase C do plano 0374](production-0374.json): servidor no hospital, HashiCorp Vault no servidor, token interno só para o ensaio, backup local e no TrueNAS com papel de backup BYPASSRLS, console na rede interna com túnel só para webhooks, alerta no Telegram, observabilidade por logs/ready/heartbeat/alerta, imagem no GHCR por digest, B5 aprovado, A2 com allowlist por caminho (aplicação pendente) e G7 por corte coordenado.

Ordem das migrations registrada para o integrador: 0029 (composição 0217) primeiro, depois 0030 = SPEC0225 e 0031 = SPEC0221.
