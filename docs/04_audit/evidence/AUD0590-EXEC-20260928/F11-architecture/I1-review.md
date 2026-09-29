# F11 I1 — crítica do snapshot de arquitetura

**Crítico:** Descartes (`01a0eb41-74b9-7873-915e-5d253cc0bc83`),
contexto novo, somente leitura do guia e das fontes congeladas em `54257e3`.
**Veredito:** `REVISE` (0 P0, 2 P1, 4 P2). Os 24 hashes e tamanhos do
[manifesto](source-manifest.json) coincidiram com o commit; o crítico não
executou testes nem alterou arquivos.

| Prioridade | Lacuna do guia inicial | Resposta documental |
| --- | --- | --- |
| P1 | Diagrama e fluxo davam a entender que todo tool usa effect journal. | Distinguir capabilities, que exigem journal/fingerprint, do caminho `tools` de compatibilidade, onde ambos podem faltar. |
| P1 | `/trajectory` parecia disponível no entrypoint padrão. | Registrar que a rota requer `executionSteps` injetado e `buildServerFromEnv` não o fornece por padrão no SHA. |
| P2 | Fingerprint parecia universal. | Limitar a afirmação à composição por capabilities. |
| P2 | Chave de idempotência repetida parecia sempre retornar registro existente. | Exigir mesmo hash de request; payload diferente gera conflito. |
| P2 | Seta API → worker não dizia que os processos precisam compartilhar store. | Marcar PostgreSQL compartilhado ou store explicitamente injetado em comum. |
| P2 | Links relativos para código poderiam ser lidos como fonte imutável do snapshot. | Explicar `git show 54257e3:<caminho>` e que links navegam no checkout móvel. |

As correções foram incorporadas ao
[guia](../../../../architecture/CURRENT_IMPLEMENTATION_2026-09-29.md).
F11 permanece aberto para PR-L04 e nova fonte integrada; F12 e produção
seguem `NO_GO`. Crítica independente da revisão ainda é necessária.
