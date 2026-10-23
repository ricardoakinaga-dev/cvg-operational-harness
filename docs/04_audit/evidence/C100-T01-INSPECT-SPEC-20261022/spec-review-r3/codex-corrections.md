# Correções da SPEC0255 r3 → r4 (revisão do Codex e opcionais R3)

- Base: r3 aprovada pelo crítico ([review.md](review.md), sha256 `6fec67f4…`), igual à versão em `HEAD` `176c1bdf`.
- Revisão dos aceites pelo Codex sobre a r3: REVISE, com F01 e F02. Os arquivos estão no checkout principal, fora desta worktree:
  - `docs/04_audit/evidence/UNBLOCK-CLAUDE-20261022/owner-review-codex.json`;
  - `docs/04_audit/evidence/UNBLOCK-CLAUDE-20261022/0255-proposed-corrections.patch`;
  - item 5 de `docs/08_runtime/handoffs/unblock_claude_20261022.md`.

  Os hashes estão no [spec-r4.json](../spec-r4.json).
- Regra: os dois retrabalhos do `0383:15` já foram usados. Esta r4 segue o [replanejamento](../replan-20261023.md): só o delta, sem contrato, aceite ou corte novo.
- Diff para o crítico: [spec-r4.diff](../spec-r4.diff), que ignora mudança de quantidade de espaço (`git diff -b`) e mostra só o conteúdo, e [spec-r4.full.diff](../spec-r4.full.diff), byte a byte, com o realinhamento das tabelas feito pelo prettier.

## Patch do Codex

1. `git apply --check` passou na worktree, e o patch foi aplicado como veio.
2. O conteúdo resultante teve sha256 `00c74347…`, o mesmo `proposedPatchedContentSha256` do `owner-review-codex.json`.
3. Depois disso vieram as propagações e os opcionais abaixo, e o prettier realinhou as tabelas.

| Item | O que o patch muda | Propagação na r4 |
| --- | --- | --- |
| **F01** — SK10c-new exigia `SELECTED` fora do grant | O SK10c-new passa a ter dois controles. (i) Ferramenta declarada fora do grant: `REFUSED` com `TOOL_NOT_GRANTED`, array intacto e kernel `POLICY_DENIED`. (ii) Ferramentas concedidas e corpo que instrui WRITE: `SELECTED`, e o WRITE continua `POLICY_DENIED` | Mutante novo MU47 (`SELECTED` fora do grant), morto pelo SK10c-new (i) e pelo SK10. A linha do SK10c-new cita "Mata MU14b e MU47". O A10 descreve os dois controles. Registro no §17.1 |
| **F02** — mensagem bruta do validador | Na tabela do §7.12, "Mensagens do validador" passa de "idênticas byte a byte" a categorias estáticas: campo desconhecido devolve só "campo desconhecido", sem a chave, e nada de valores, caminhos ou mensagens de terceiros. O SK11 ganha o negativo da chave com caminho absoluto e segredo, no loader e no consumidor `dist` | **§7.12:** nota que nomeia as duas mensagens que interpolavam texto do autor (`loader.ts:47-49`, chave; `loader.ts:68-70`, id e nome do diretório) e as categorias fixas que entram. As asserções atuais do `pdsh-015` continuam valendo. **§7.5 item 4:** a inspeção também deixa de publicar a chave do autor; `MANIFEST_INVALID` sai com `validatorCode` `UNKNOWN_FIELD` e sem `field`, e o mesmo vale para chave repetida no frontmatter fora de `name`/`description`. **§7.6:** o `field` só leva nome do vocabulário fixo. **§7.11:** o `field` sai da lista de identificadores redigidos. **SK11:** caso da inspeção (MU48) e segredo montado por concatenação. **SK14:** casos de F02 (MU46). **A11 e A17:** citam as categorias estáticas. **P8 (§17.2):** idem |

## Opcionais R3

| Item | Tratamento | Onde |
| --- | --- | --- |
| R3-O1 | §8.11 alinhado com o §7.10: na seleção, a busca de nome vem primeiro e acha o root; no inventário, aquisição e depois busca; a conferência final vem depois da última busca e da última leitura | §8.11 |
| R3-O2 | Resolvido pela propagação da F02: o `field` só leva nome do vocabulário fixo, então não precisa de marcador `<unsafe:N>` nem `<redacted:N>` | §7.5 item 4, §7.6, §7.11 |
| R3-O3 | O I7 declara que a validação de formato e a publicação do digest dependem do contexto do chamador, e que o `expected.inputDigest` vem de execução com o mesmo perfil e contexto | §4 (I7) |
| R3-O4 | O §8.9 declara que o `inputDigest` não fixa o conteúdo de item com `itemDigest` nulo, sem efeito na admissão de outro item | §8.9 |
| R3-O5 | CRLF recusado virou risco declarado e premissa P23, com default proposto | §16, §17.3 |
| R3-O6 | §14 item 1 alinhado ao `0383:15` e ao replanejamento: até dois retrabalhos; a r2 e a r3 foram os dois; a r4 é o replanejamento; se o crítico pedir mais um obrigatório, a SPEC volta ao usuário sem r5, com as três opções. §15: "com até dois retrabalhos". §14 item 2 registra o REVISE do Codex e a conferência da r4 | §14, §15 |
| R3-O7 | Cabeçalho da tabela do §5: "Estado na r4". I13 (d): "que só a inspeção avalia". `skillId` com 1 a 64 caracteres, com `INPUT_INVALID` fora disso | §5, §7.10, §7.2 |
| R3-O8 | Testes de corrida em diretório temporário local com timestamp fino (ext4, xfs, btrfs ou tmpfs), nunca em NFS | §12 |

Também mudaram:

- o cabeçalho (r4) e o histórico (r3, revisão do Codex e r4);
- o estado do gate em 23/10;
- a faixa de mutantes no §15 (MU01a–MU48).

Não houve contrato, aceite ou corte novo.

## Divergências e pontos para o crítico conferir

1. **A F02 também na inspeção.** O patch do Codex muda a mensagem do loader. Pela regra dele ("nunca propagar valores, caminhos ou mensagens de terceiros"), a r4 também tira a chave do autor do `field` do relatório da inspeção. Antes, a chave aparecia quando passava no charset e no redator. A mudança é mais estrita e não cria contrato novo, mas o relatório perde o nome da chave desconhecida como diagnóstico. A contrapartida é que o R3-O2 desaparece.
2. **A segunda mensagem interpolada.** O patch só nomeia a de campo desconhecido. A de id diferente do diretório (`loader.ts:68-70`) interpola o id e o nome do diretório, que também são texto de terceiros. A r4 a põe na mesma regra ("Demais mensagens são constantes revisadas", do próprio patch) e a cita no SK14. A asserção do `pdsh-015` só confere o trecho fixo e continua valendo.
3. **Ficou como estava:** a linha "skill.json ilegível: raw" (`String(valor)` de um valor não-Error). O patch não a mudou, e ela só ocorre com mock do runtime, sem conteúdo da skill. Mudar exigiria trocar a asserção do `pdsh-031`, o que é contrato novo de teste e fica fora do delta.
4. **Diff:** o `spec-r4.diff` ignora espaço para o crítico ver só o conteúdo; o byte a byte está no `spec-r4.full.diff`.
