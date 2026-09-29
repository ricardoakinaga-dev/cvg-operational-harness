# F11 I3 — fingerprint em execução durável

**Crítico:** Ohm (`01a0eb4a-41c7-7461-8d42-6c2e8a44cd80`), contexto
novo, somente leitura. **Veredito:** `REVISE` (0 P0, 0 P1, 1 P2). Os
24 hashes/tamanhos do manifesto conferiram contra `54257e3`; as outras
duas correções da I2 foram aceitas.

O P2 residual era a frase que tornava o fingerprint opcional sem a
condição da execução durável por capabilities. No código congelado,
`harness.execute` retorna `STATE_CONFLICT` se `executionId` está presente
e falta fingerprint de composição nesse caminho; divergência também é
recusada. A [revisão do guia](../../../../architecture/CURRENT_IMPLEMENTATION_2026-09-29.md)
explicita essa condição e preserva o caminho `tools` sem fingerprint.

O crítico não alterou arquivos nem executou testes. Uma nova leitura
independente da revisão ainda é necessária; F11/F12 e produção seguem
abertos.
