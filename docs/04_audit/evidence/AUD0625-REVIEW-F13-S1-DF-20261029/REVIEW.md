# Revisão independente da SPEC 0283, fatia 1 (F13) — Claude DF, 29/10/2026

Alvo: `claude/aud0625-f13-07` @ `b179e8231e`. Autoria da Claude 07, recibo [human-decisions-13](../USER-DECISIONS-20261028/human-decisions-13.json). Revisor não autor. É revisão, não aceite. Produção `NO_GO`.

## Veredito

**APPROVE**, sem achados.

## Conferido

- **Recibo por nota.** A correção cria uma nota nova (`randomUUID`), e o `previewState` é por id. Uma revisão nova começa sem recibo e nunca herda o "complete" da anterior.
- **Confirmação.** Sem apresentação completa, `ok` responde `CONFIRMATION_NOT_ELIGIBLE` com a causa. O eco do token completo só vale quando a última parte ficou incerta e nada deixou de ser enviado (`echoable`). Preview cortado nunca é confirmável (A).
- **Token.** Tem a forma `<nota>-r<rev>-<hash>`, e o código curto de 8 hex não seleciona mais rascunho.
- **Rascunho legado** (sem estado): fica inelegível e é reapresentado pelo tick, dentro do orçamento (C).
- **Pontos de interpretação da autora**, aceitos:
  1. O hash é do conteúdo canônico, não do texto do preview, porque o token aparece dentro do preview. O texto enviado fica ligado por `partSha256` no recibo.
  2. O 503 do canal é `uncertain`, como na 0268, e por isso cai em `preview_uncertain`.
- **Testes**, com Node 22 numa cópia detached: produto com 14 arquivos, 159 passam e 3 expected fail (R6–R8, da fatia 2).
- **Mutações.** A mutação própria, "incerto vira ok", morre. A autora registrou 22 de 23 mortas; a M23 é defensiva e equivalente com os chamadores atuais.
