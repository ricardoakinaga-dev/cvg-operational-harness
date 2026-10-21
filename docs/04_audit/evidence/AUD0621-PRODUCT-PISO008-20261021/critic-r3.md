# Crítico independente R3 (verificação restrita) — AUD0621-PRODUCT-PISO008-20261021

Rodada autorizada pelo Lead depois do R2 REJECT (mesmo precedente da SPEC0248:
uma rodada de reparo e um R3 restrito a ela). Agente general-purpose novo
(não-fork), prompt autocontido, somente leitura, sobre a árvore de trabalho do
reparo em cima de `321a1369c`, depois commitada sem alteração como `5cb5d303c`.
Escopo: R2-M1, R2-M2, R2-M3, readiness 200 fora do contrato e `dataDir`
symlink; o resto da frente não foi reaberto.

**VEREDITO: APPROVE** — nenhum obrigatório nos 5 itens.

- **R2-M1**: `findDraft` escolhe o rascunho confirmável de menor note id;
  `syntheticDraft` acha a nota pelo messageId que a própria sandbox enviou e
  falha explicitamente (`synthetic draft created`). Sonda do crítico com 2, 3 e
  4 rascunhos restaurados vencendo depois, de um e de dois autores: 12/12 PASS,
  `confirmedNoteId` = menor id, `syntheticNoteId` = nota nova, lembretes só das
  tarefas sintéticas, nenhum outro rascunho confirmado, volume restaurado
  intacto.
- **R2-M2**: M36 e M36b morrem em "fails an empty round"; M40 em "fails the
  same count of reminders for the wrong tasks" (cópias do src no diretório do
  crítico).
- **R2-M3**: recusa sandbox igual, dentro, acima ou por symlink para dentro do
  volume restaurado, e igual, dentro ou por symlink para a origem; aceita
  destinos válidos (irmão com o mesmo prefixo, pai symlink de fora, barra
  final, caminho relativo, diretório vazio existente). CLI: destino separado e
  irmão com prefixo exit 0 PASS; dentro da origem, do restaurado e por symlink
  exit 1 com a falha de posicionamento; origem idêntica por hash.
- **Opcional A**: contrato alinhado com `server.ts`/`health.ts` (200 só com
  `ready` verdadeiro; `stopping` sempre 503); corpo válido sem achado; `{}`,
  `ready:"true"`, `mode:stopping`, `attention:null`, `[]` e `null` viram
  `ready_invalid`; 503 inalterado.
- **Opcional B**: `source_symlink` recusado sem criar `data/`.

## Residuais registrados (não obrigatórios; sem mudança de código após a aprovação)

1. Caminho com `..` depois de um symlink escapa da verificação de posição
   (`resolvedPath` aplica `resolve()` textual antes do realpath; `backup.ts`
   `resolvedPath`, usado em `restore-sandbox.ts`): `--sandbox <link>/../x`
   passa a verificação, o `mkdir` cria um diretório vazio 0700 dentro da origem
   ou do restaurado e a CLI sai com exit 1 (ENOENT) sem relatório. Sem falso
   PASS nem arquivo gravado; caso patológico; o mesmo helper protege o destino
   do restore e o `--out`. Endurecimento sugerido: recusar `..` no caminho cru
   ou conferir o realpath depois do `mkdir`.
2. A ligação do oráculo dentro da sandbox (`checks.push(...evaluateReminderRound(...))`)
   não tem teste próprio: o mutante W1 que a remove sobrevive. Sugestão:
   afirmar os nomes dos checks de lembrete no relatório de um caso de R2-M1.
3. O teste da escolha por identidade depende de UUIDs aleatórios: M42 morre em
   ~11 de 12 rodadas (5/5 nas repetições desta frente); a falha original (M41)
   é pega sempre.
4. `dataDir` symlink com barra final passa a recusa de raiz symlink; inofensivo
   porque inventário e varreduras usam o caminho real.

## Executado pelo crítico

Node v22.23.2, load 1,8–3,7; suíte do produto 12 arquivos/132 testes verdes;
first red conferido (11 falhas e 1 aprovado em cópia `git archive` do HEAD);
mutantes M36, M36b, M40 e W1; sondas `probe-r3.mts` e `probe-r3b.mts`; CLI
`make-fixture`, `backup.mjs` e `restore-proof.mjs restore` com 6 destinos de
sandbox. `git status` da candidata igual antes e depois. O teste de SIGTERM
falhou nas cópias temporárias do crítico, inclusive sem mutante, por não achar
`tsx` fora do repositório (ambiente da sonda); na candidata ele passa.
