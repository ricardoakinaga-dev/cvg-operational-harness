# PDSH-025 — compactação de contexto antes do modelo — 12/10/2026

- Escopo: SPEC [0206](../../../02_spec/0206_pdsh025_compaction.md). DONE_LOCAL/T3; não é certificação, revisão independente ou release.
- Decisão: `packages/harness/src/compaction.ts` com estimador determinístico (`ceil(chars/4)`, só gatilho), engine puro `compactConversation` (clamp do janela, resumo derivado das mensagens descartadas, digest SHA-256 canônico, `throughSequence`, entrada imutável), controle `createCompactionControl` no hook `model/before-call` (ajusta `call.request.messages` antes do log I6/modelo; callback de auditoria que falha → stop `INSUFFICIENT_EVIDENCE`) e `createSessionCompactionRecorder` que apenda o evento validado `context/compacted` no `SessionEventStore` (PDSH-021). Sem modelo para resumir, sem efeito externo, sem tocar pipeline/controles padrão/budget/provider/SDK.

## Procedimentos observados

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Foco PDSH-025 + suíte do pacote harness | PASS: 25 arquivos/267 testes | (suíte do pacote na execução focada) |
| Suíte completa, Node 22.23.2, PG 16.15 próprio | PASS: 385 arquivos/3261 testes, 1 skip | [unit.log](unit.log) |
| `test:postgres` (gate padrão) | PASS: 37 arquivos/302 testes, zero skips | [postgres.log](postgres.log) |
| `test:postgres` + guarda PG de sessão (021) | PASS: 38 arquivos/311 testes, zero skips | [postgres-session.log](postgres-session.log) |
| E2E Chromium (portas próprias 3599/4599) | PASS: 12/12 | [e2e.log](e2e.log) |
| Fronteira ADR-010 | PASS, zero violações/diagnósticos/exceções ociosas | [boundary.log](boundary.log) |
| Typecheck/lint/catálogos/formato/diff | PASS | [static.log](static.log) |

## Self-review separada (não é aceite independente)

- Casos: estimador determinístico; abaixo do teto não compacta (cópia, sem mutação); uma única mensagem nunca compacta; resumo determinístico (duas execuções canonicamente iguais), digest conferido contra SHA-256 canônico manual, `throughSequence` da última descartada; clamp de `keepRecentMessages` e teto de `summaryMaxChars`; opções inválidas falham fechado; integração real no kernel single-pass (modelo recebe `[resumo, ...recentes]` e o callback auditou); pass-through abaixo do teto; auditoria falha → modelo nunca chamado; recorder grava `context/compacted` com sequência acima de `throughSequence` (o próprio validador do catálogo rejeita o contrário) e é no-op fora de compactação.
- Nota de integração: a regra do catálogo (`throughSequence < sequence do evento`) é intencional — o resumo referencia eventos que já existem no stream; o teste inicial usou sequências que não existiam e foi corrigido semeando o stream, sem afrouxar o validador.
- Limite honesto: o estimador decide o gatilho e não substitui a medição do provider (PDSH-024); o resumo é textual determinístico (trechos + digest), não uma sumarização semântica; o controle é composto por quem monta `plugins` (o caminho do worker/bridge durável fica para o consumo de PDSH-026).

## Estado operacional e limites

- Contêiner próprio `opencode-pdsh025-pg-20261012` (127.0.0.1:32773, tmpfs 4 GiB) removido; portas 3599/4599/32773 sem listener. Nenhum recurso alheio tocado.
- Sem provider/dado real/commit/push/deploy/release; produção NO_GO. Próxima ação: PDSH-026 (consumo do Assistente de Plantão sobre sessão + compactação — requer coordenação com o dono do produto ou deferimento registrado) e W4.
