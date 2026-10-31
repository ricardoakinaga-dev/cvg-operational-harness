# PAR-S05 — `sdk.hello` tolerante a nomes de método desconhecidos (decisão técnica do DF, SPEC 0295 §6.4 e D7)

Resolve o desvio declarado em `SLICE4-RESULT.md`. Um nome de método bem formado (identificadores separados por ponto, `^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$`) que o cliente não conhece é ignorado e nunca chamado. A forma continua estrita: lista de strings, sem repetição, `sdk.hello` e `turn.send` presentes, `session.open`/`session.events` coerentes com `sessions`/`events`, `session.list` e `session.trace` juntos. Nome malformado (`__proto__`, espaço, não string, array que imprime como nome) continua recusado.

- TS: `packages/sdk/src/validators.ts`; o teste "rejects hello unknown method" virou três recusas (nome malformado, com espaço, não string) mais um caso positivo de tolerância (`session.fork`, `toString`, `a.b.c1`).
- Espelho Python (`packages/sdk/python`): mesma regra em `validation.py`; testes equivalentes em `test_protocol.py`. O espelho implementa o prefixo de quatro métodos do contrato; `contract_v1.json` mantém essa lista e o pin de `protocol.ts` foi atualizado (o `SDK_METHODS` do TS agora tem seis); a comparação do oráculo em `test_interop.py` passou a exigir que o vocabulário do TS comece pelo do contrato e que o excedente seja exatamente `session.list` e `session.trace`.
- Mutantes: H1 (volta a recusar desconhecido), H2 (aceita qualquer string), H3 (underscore), H4 (espaço), H5 (não string) mortos, 5/5.
- Gates: prettier, eslint; 184 testes do SDK; unidade Python 32 de 33.

Pendência que não é desta mudança: `test_source_pins_and_catalog_exact_copy` ainda falha no pin de `packages/contracts/src/contracts.ts` (alterado pela PAR-C01 fatia 2, `ad7eeef80`, antes desta cadeia). Re-pinar é decisão da integração do C01 (confere se o espelho precisa acompanhar). A suíte `--suite interop` do Python não rodou aqui: exige `dist` do SDK e um Node confiável fora do `build:harness`.
