# F11 I4 — aceite do guia no snapshot congelado

**Crítico:** Carson (`01a0eb4c-8bf2-7010-a8d7-bbd25b8e42a1`), contexto
novo, somente leitura. **Veredito:** `ACCEPT_SCOPE`, sem P0/P1/P2 aberto
na revisão `105f150` do guia ancorado em `54257e3`.

O crítico conferiu o P2 residual de I3 em
`createOperationalHarness.ts` e no passo do worker: composição por
`capabilities` exige effect journal e, com `executionId`, fingerprint;
ausência ou divergência retorna `STATE_CONFLICT`. Sem `executionId`, o
fingerprint do input é opcional, mas divergência é recusada. O caminho
`tools` não o exige. O [guia](../../../../architecture/CURRENT_IMPLEMENTATION_2026-09-29.md)
e o fluxo agora expressam essas condições.

O parecer aceita **somente o documento do snapshot**. F11 depende da
composição PR-L04 e de revalidação no candidato novo; F12 e produção
permanecem `NO_GO`. O crítico não alterou arquivos nem executou testes.
