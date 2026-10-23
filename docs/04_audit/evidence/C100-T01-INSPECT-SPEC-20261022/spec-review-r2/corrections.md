# Correções da SPEC0255 r2 → r3

- Revisão de origem: [review.md](review.md) e [review.json](review.json). REVISE sobre a r2 (`e03a1553…`), com R2-M1 a R2-M4. Os M1–M7 da r1 ficaram fechados no mérito.
- SPEC corrigida: [r3](../../../../02_spec/0255_c100_skill_plugin_offline_inspection.md). O sha256 está em [spec-r3.json](../spec-r3.json).
- Sondas do crítico, copiadas byte a byte do scratchpad:
  - [critic-probe-r2.mjs.txt](critic-probe-r2.mjs.txt) e [saída](critic-probe-r2-output.json);
  - [critic-probe-r2-aba-fields.cjs.txt](critic-probe-r2-aba-fields.cjs.txt) e [saída](critic-probe-r2-aba-fields-output.json).
- Correção mínima, sem mudar o desenho aprovado no mérito.

## Obrigatórios

| Item | O que mudou | Onde na r3 |
| --- | --- | --- |
| **R2-M1** — busca de nome diferente entre seleção e admissão | Uma só função de busca (`lookup`) para os dois caminhos: `ENOENT` dá ausente; diretório real com o mesmo `dev` dá candidato; arquivo regular, symlink, especial ou outro `dev` dá `NAME_CONFLICT`; qualquer outro erro, inclusive `EACCES`, dá `NAME_LOOKUP_FAILED` (falha fechado). A ordem fica escrita: abrir os roots e tirar a assinatura → adquirir → buscas → conferência final dos roots, **depois da última busca** → decisão. O I13 lista as quatro exceções: estouro de `maxEntriesPerRoot`, prazo, `maxFilesTotal`/`maxTotalBytes` e `expected.inputDigest`. O SK08c ganhou o caso t10 (arquivo regular com o mesmo nome; MU38), o `EACCES` na busca (MU39) e a corrida da busca com `beforeLookup`/`afterLookup` (MU40) | §7.9 (condições 1 e 7), §7.10 (passos 2 e 3, I13), §8.2 (passo 5), §8.11 (nova), §9, SK08c, §12.1 |
| **R2-M2** — `<redacted:12hex>` reversível | Marcadores ordinais `<redacted:N>` e `<unsafe:N>`, sem hash do valor. Item com valor redigido ou nome inseguro: `itemDigest` `null`, `sha256` `null` no arquivo que contém o valor, e entrada no `inputDigest` pela forma exibida. Limitação declarada no I9: o `sha256` publicado de arquivo pequeno é oráculo para valor enumerável redigido na descrição. SK11 confere a ausência de qualquer prefixo do sha256 do valor (MU41) | §4 (I9), §7.4, §7.5, §7.6, §7.11, §8.9, SK11 |
| **R2-M3** — escape e marcador do MU04 | O exemplo com escape voltou ao §7.5 e ao SK03: `{"id":"a","\u0069d":"b"}`. A perda na r2 veio da ferramenta de escrita, que decodifica a sequência de barra invertida com `u` dos parâmetros; na r3 o texto foi escrito por script, e o arquivo tem os 6 caracteres da sequência. No SK05b(iii), o marcador fica no corpo **e** na `description` do `SKILL.md` de fora, e a prova confere que o `sha256` do `BODY` é o dos bytes de dentro | §7.5, SK03, SK05b(iii) |
| **R2-M4** — dependência de timestamp | A G2 foi reescrita: a G1 vale sempre, sem depender de tempo; a detecção da G2 depende do kernel, e em kernel sem multigrain (antes do 6.13) a troca no mesmo tique pode passar, sem nunca levar a ler de fora. O risco residual lista os três efeitos possíveis, todos de conteúdo de dentro. P22 nova, como default do lead. Ganchos `beforeItemCheck` (antes da conferência do §8.7) e `afterItem` (depois) definidos. SK05b(iii), (vi) e o MU05 usam espera de pelo menos 50 ms; o (vi) cria subdiretório, que muda `nlink` | §3 (G1, G2, risco residual), §8.7, §8.11, §12 (ganchos e tempo), SK05b, §16, §17.2 (P22) |

## Opcionais

| Item | Tratamento | Onde |
| --- | --- | --- |
| R2-O1 | Entrada nova `hostIdentifiers`; identificador igual a uma entrada dela, ou a `grantedTools`/`availableKnowledge` no perfil `admission` e na seleção, não passa pelo redator. Falsos positivos de CalVer registrados na P18 e nos riscos | §7.2, §7.11, §16, §17.3 (P18), SK11 (MU45) |
| R2-O2 | Regex da P19 com `0x…`, `.5` e `+.5` | §7.5, SK03 (MU43), P19 |
| R2-O3 | Ganchos só endurecem; só por setter interno, nunca por variável de ambiente ou `globalThis`; teste estático de que nenhum módulo fora de teste importa o setter | §12, SK12 (MU44) |
| R2-O4 | CR em `SKILL.md` e referências, inclusive no corpo, dá `LINE_ENDING_UNSUPPORTED`; ordem BOM → decodificação → CR → frontmatter | §7.5, §9, SK03 (MU42) |
| R2-O5 | Texto da P5 e da condição 5 alinhado: grant com `*` é recusado mesmo sem requisito | §7.9, SK10, P5 |
| R2-O6 | Gate reordenado: crítico → Codex (antes da revisão do usuário) → usuário; mudança de aceite pelo Codex gera nova revisão, novo sha256 e nova rodada do crítico | cabeçalho, §14 |
| R2-O7 | Texto de montagem corrigido: bind mount do mesmo FS não é detectado (fora do modelo); btrfs e overlayfs podem dar recusa falsa (falha fechado) | §3, P21 |
| R2-O8 | Achado não bloqueante `FORBIDDEN_CODE_POINT_IN_CONTENT`, com contagem, para corpo e referências (exceto TAB e LF) | §7.5, §7.6, §9, SK03 |
| R2-O9 | Id e nome do diretório passam pelo redator | §7.11, SK11 |

Também: as referências da 0255-B a "r3" viraram "revisão futura", porque esta revisão é a r3 da 0255-A; e a lista de mutantes vai até MU45.

## Divergências

Nenhuma de mérito. Duas escolhas minhas para o crítico conferir:

1. **Nomes dos motivos da busca.** O crítico sugeriu "qualquer outro tipo ou errno → recusa, com o mesmo código nos dois caminhos". Separei três motivos: `NAME_CONFLICT` (entrada de outro tipo com o mesmo nome), `DUPLICATE_ID` (dois diretórios) e `NAME_LOOKUP_FAILED` (erro). Um arquivo regular sozinho com o nome não é "duplicata", e o erro de busca pede tratamento diferente na operação. Os três recusam igual nos dois caminhos.
2. **`hostIdentifiers` (R2-O1).** O crítico sugeriu isentar o requisito igual a um id concedido. Como o perfil `inventory` não recebe grant, uma isenção só pelo grant faria o mesmo item sair `INVALID` no inventário e `VALID` na admissão. Por isso a isenção vem de uma lista explícita do host, válida nos dois perfis. No perfil `admission` e na seleção, `grantedTools` e `availableKnowledge` entram nela sozinhos. A isenção exige igualdade exata (MU45).

Registro: o `corrections.md` da r1 também perdeu a sequência de escape na escrita. Ele foi mantido como estava, porque o hash dele já está no `spec-r2.json`. A forma correta está nesta página e na r3.
