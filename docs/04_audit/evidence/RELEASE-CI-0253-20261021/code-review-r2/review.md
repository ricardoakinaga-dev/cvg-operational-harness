# Crítica independente do código do BUILD da SPEC0253, rodada 2 (última)

- **Alvo:** delta `6e313fb44..059b27c5a` na worktree detached `/mnt/dados/cvg-work/cvg-d9ef-prodpath-20261021`. O delta implementa os opcionais O1–O6 da [r1](../code-review-r1/review.md).
- **Arquivos do delta:** `scripts/release-image-{gate,record}.mjs` e os três `tests/release-image-*.test.js`. O `release-image-contract.mjs` e o workflow ficaram sem mudança, conferido com `git diff --name-only`.
- **Autoridade:** [SPEC0253 r4](../../../../02_spec/0253_release_image_ghcr.md), com SHA-256 `e69dfe05…3910c4109` conferido, e [aprovação](../spec-approval.json).
- **Data:** 22/10/2026.
- **Crítico:** contexto novo, foco em supply chain e regressões.

## Como revisei

Fiz só leitura no código e no git. Os mutantes que eu mesmo criei rodaram numa cópia mínima no scratchpad da sessão, nunca na worktree.

- **Leitura:** o diff inteiro e o contexto de `probePackage`, `curl`, `classifyPackageProbe`, da CLI do gate, de `buildCommand`/`publishCommand` e de `readRegularFile`.
- **Testes (Node 22, `env -i`):** `npx vitest run tests/release-image-*.test.js` deu 235/235 verdes (223 da r1 + 12 novos). `prettier --check` nos cinco arquivos ficou limpo.
- **Provas do executor:**
  - Li `mutants.py` e `mutants-final.json`. São 125 mutantes, todos `KILLED`, e os 11 do delta (`R1-*`) correspondem aos itens O1–O6.
  - `first-red-r1.txt` mostra 6 vermelhos no código anterior: O1×2, O2×2, O3 e O4.
  - `real-anonymous.json` traz `403 DENIED`, `tokenIssued:false`, `curlExit:0`. Isso também prova que o `curl` real aceita a nova ordem `-q --proto =https`.
- **Mutantes meus:** dois, descritos em R2-O1 e R2-O2.
- **Simulação de tamanho para O4:** script no scratchpad, descrito em R2-O1.

## Veredito: `APPROVE`

Não há obrigatórios. O1–O6 foram resolvidos como a r1 propôs, sem regressão. Nenhum invariante da SPEC foi enfraquecido. Os três opcionais abaixo são lacunas de prova ou de borda, e nenhum deles muda uma decisão de `publish`/`refuse` em caso realista.

## Conferência O1–O6

| Item | Resultado |
| --- | --- |
| O1 | **Resolvido.** `gate.mjs:752-770`: um 200 com corpo que não é objeto JSON, ou com `tags` que não é lista nem `null`, vira `unreadable` em **qualquer** página, e daí `requestFailed` → `error`. Itens que não são string continuam caindo em `tags_list_unexpected` (`gate.mjs:101-108`). Os testes cobrem HTML na página 1, `garbage` na página 2 e `tags:"x"` (`gate.test.js:1257`), e conferem `probe`=`error` e `precondition`≠0. Borda menor em R2-O3. |
| O2 | **Resolvido.** `mask` só roda depois de `curlConfigValue` (`gate.mjs:686-697`), e um token inválido não é mascarado, impresso, gravado nem usado. `errorCode` aceita só `^[A-Z0-9_]{1,64}$` e troca o resto por `UNRECOGNIZED_CODE` (`gate.mjs:631-635`). Esse marcador não está em `PACKAGE_MISSING_CODES` nem em `TAG_ABSENT_CODES`, então o caso falha fechado. Os códigos válidos (`DENIED`, `NAME_UNKNOWN`, `MANIFEST_UNKNOWN`) passam pelo padrão. O `oneLine` (JSON-escape de controles) cobre todo `stderr` do gate (`:995-998`, `:1073-1075`, `:1103-1105`) e os motivos no resumo (`:1067`). O stdout continua em `JSON.stringify` de uma linha, e o `$GITHUB_OUTPUT` não mudou. O runner quebra linha só em `\n`/`\r`, que ficam escapados. |
| O3 | **Resolvido.** `argv[0..2]` é `-q --proto =https` em todos os pedidos, porque a função `curl` é única (`gate.mjs:572-586`). O teste confere as quatro chamadas (`gate.test.js:1226`). O token continua só no stdin (`--config -`). |
| O4 | **Resolvido.** `build` recusa quando o texto passa de `limite(release-image.json) − 128 KiB`, antes de gravar, e relê o arquivo com `readEvidenceFile` (`record.mjs:283-293`). Pela ordem do YAML, o passo `Build record` (`release-image.yml:272`) vem antes de `Package precondition` (`:279`) e de `Registry login` (`:286`). A margem basta: no pior caso simulado, com achados mínimos (nulos) e o `build-record` no limiar de 917.504 bytes, o `release-image.json` chega a 1.018.338–1.021.100 bytes (folga de ~27 KB), com um registro do gate de ~4 KB. Lacuna de prova em R2-O1. |
| O5 | **Resolvido como proposto.** `workflow-contract.test.js:276-280` proíbe `curl`/`wget` em todo `run:`. O mutante inline do executor morre. Lacuna de parser em R2-O2. |
| O6 | **Resolvido.** `wait` e `superseded` pela CLI saem com 0, `publish=false` e sem `gate_record=` (`gate.test.js:1322`). `--paginate --slurp` aparece em todo endpoint de lista, e `branches/main` fica sem ele (`gate.test.js:1207-1213`). A troca de inode entre `lstat` e `open` dá `release_file_replaced` (`record.test.js:1098`), e o stub restaurado lê normalmente. Os mutantes `R1-O6-*` morrem. |

## Invariantes da SPEC (item 2)

- **Token fora de argv, arquivos e log.** Mantido. O argv só ganhou `-q`, `--proto` e `=https`. O token inválido agora nem é mascarado nem impresso, o que é mais estrito.
- **O release nunca cria o pacote.** Mantido. `precondition` só mudou a forma da mensagem, e o O1 transforma mais casos em `error`, que dá `refuse`.
- **`refuse` em 5xx, timeout, 406 e índice.** Mantido, porque `classifyPackageProbe`, o `Accept` e o manifesto não mudaram.
- **`$GITHUB_OUTPUT` só com valores validados.** Mantido, porque `appendOutput` e os anchors não mudaram.

## OBRIGATÓRIOS

Nenhum.

## OPCIONAIS

### R2-O1. A prova de O4 não distingue a margem do limite cheio

- **Evidência:** `tests/release-image-record.test.js:1078-1096` usa 8.000 achados, o que dá um `build-record` de **1.249.499 bytes**, acima de 1 MiB. `scripts/release-image-record.mjs:57` define `RELEASE_RECORD_MARGIN`.
- **Mutante:** `RELEASE_RECORD_MARGIN = 0`, aplicado na cópia do scratchpad, deixa 55/55 verdes e **sobrevive**. O registro do teste é recusado com qualquer limite até 1 MiB.
- **Risco: baixo.** Sem margem, volta o problema original da O4, só na faixa de 896 KiB a 1 MiB: o `publish` falharia depois do push.
- **Correção:** um caso com o `build-record` entre 917.504 e 1.048.576 bytes (cerca de 6.000 achados mínimos) que espera `release_build_record_too_large`. Opcionalmente, outro caso no tamanho máximo aceito que confere que o `publish` cabe no limite.

### R2-O2. O teste de O5 (e os outros asserts sobre `step.run`) não enxerga `run: |-` nem `run: >`

- **Evidência:** `tests/release-image-workflow-contract.test.js:116` só lê o bloco quando o valor é `|` ou vazio. Com `|-`, `|+`, `>` ou `>-`, o `step.run` vira o próprio indicador. O O5 está em `:276-280`.
- **Mutante:** um passo `Extra probe` antes de `Verification record`, com `env: REGISTRY_TOKEN: ${{ github.token }}` e `curl -sf -H "Authorization: Bearer $REGISTRY_TOKEN" https://ghcr.io/v2/` (o mesmo do executor).
  - Em `run: |-` ou `run: >`, os **34/34 ficam verdes**.
  - Em linha, o O5 morre.
- **Origem:** a limitação do parser é anterior ao delta, mas a prova nova depende dela, e ela vale também para "sem `${{ }}` em `run:`".
- **Risco: baixo.** Exige uma edição futura deliberada, e o YAML de hoje não tem `curl`/`wget` nem bloco `|-`/`>`.
- **Correção:** aplicar o O5 sobre o texto inteiro do workflow (hoje não há `curl`/`wget` em nenhum lugar dele) ou exigir que todo `run:` seja `|` ou em linha, recusando `|-`, `|+`, `>` e `>-`.

### R2-O3. O1 ainda aceita 200 sem a chave `tags` como página vazia

- **Evidência:** `scripts/release-image-gate.mjs:756` (`body.tags === undefined`). Isso contraria o comentário em `:750-751` e a correção da r1, que pedia "`tags` que não é lista nem `null`".
- **Efeito:**
  - `{}` na página 1 dá `package_tags_empty` → `missing_or_inaccessible`. Falha fechado, mas com a dica da §9, que engana: é o mesmo sintoma da O1.
  - `{}` numa página ≥2 deixa a lista parcial.
- **Risco: muito baixo.** `absent` continua exigindo 404 `MANIFEST_UNKNOWN`, e o GHCR sempre devolve a chave.
- **Correção:** aceitar só `Array.isArray(body.tags) || body.tags === null`, mais um caso de teste com `{}`.

### Registro (complementa a O7 da r1)

- O `first-red-r1.txt` não cobre três provas acrescentadas depois:
  - motivos de `refuse` numa linha (`gate.test.js:1338`);
  - O5;
  - o assert de paginação.
- A eficácia delas aparece só nos mutantes `R1-O2-oneLine-identity`, `R1-O5-curl-in-workflow` e `R1-O6-without-pagination`, todos `KILLED`. O relatório do BUILD deve dizer isso.
- A O7 da r1 continua pendente: relatório do BUILD com os desvios (a)–(i), e evidências ainda não rastreadas.

## Resíduos

Os resíduos da r1 não mudaram: a janela entre o passo 14 e o push, a reexecução parcial e a Trivy comprometida. O delta não acrescenta nenhum.
