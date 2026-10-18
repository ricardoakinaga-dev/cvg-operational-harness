# Build público do worker e smoke genérico compilado

O driver existente `scripts/build-public-workspace.mjs apps/worker` passou
pelos exports reais, sem aliases de fonte, com 16 workspaces. Foram
preservados 716 arquivos de dist; a saída passou a 731, com 70 alterações.
As 1042 fontes monitoradas e as 81 entradas da candidata atual permaneceram
intactas. [Comando](command.json), [diff dos emits](emits-changes.json),
[cópias dos emits alterados](after-emits-manifest.json),
[manifesto de publicação](publication-manifest.json).

O smoke I0 executou os pacotes públicos `@cvg/harness`,
`@cvg/harness-contracts` e `@cvg/harness-orchestrator`, todos resolvidos para
`W/packages/*/dist/index.js`. Três casos passaram:

- COMPLETE entregou o resultado sintético integral ao modelo, retornou seu
  SHA-256 e preservou o slot nativo 1 no checkpoint antes da única chamada.
- O limite nativo de framing recusou a resposta antes do modelo, com zero
  chamadas e resultado integral preservado no checkpoint.
- O caminho legado manteve a resposta literal e zero chamadas de modelo.

Modelo, política e consumo Toy64/custo0 são substituições declaradas.
Fábrica, despacho, contexto, pipeline, orçamento, journal e store compilados
são nativos, em memória. Isso não exercita o host publicado da SPEC0226,
lease PostgreSQL, billing real, tokenizer real, paridade de referência ou
os critérios completos da SPEC0224.

[Resultado final do smoke](compiled-smoke-summary.json) e
[saída bruta](compiled-smoke-r3.stdout.log). As duas tentativas anteriores
falharam por expectativas erradas do observador: RESPONSE não chama o
DecisionInputCounter, e RuntimeResult usa `modelCalls` direto. Scripts,
comandos e erros originais foram preservados; só o observador privado foi
corrigido. Nenhum contador RESPONSE ou mudança de runtime foi introduzido.

As auditorias oficiais pós-build continuam INCOMPLETE: 234 diagnósticos
no modo normal e 431 no estrito, ambos com zero violações AST e zero
installed/lock drift. O freeze0220 passou a 437 pins idênticos e 28
divergentes entre 465; a proposta e a tabela ativa continuam intocadas.
[Resumo observado](observation-summary.json). Esses números não conferem
aceite de segurança, global, PostgreSQL, E2E ou release.

O [replay público SDK/API](../public-composition-build-r2/README.md) manteve
idênticos os bytes de JavaScript, declarações e dados deste worker; apenas
metadados de build mudaram. Nenhum arquivo foi promovido para ROOT.
