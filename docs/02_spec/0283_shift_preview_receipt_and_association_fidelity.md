# SPEC0283 — Recibo do preview e fidelidade de associação vinculam a confirmação

R0, 29/10/2026. Task `AUD0625-F13-DISCOVERY-07-20261029` (Claude Sonnet, sessão
07), achado F13 da [auditoria 0625](../04_audit/0625_repository_score_audit_2026-10-28.md).
Estado `PROPOSED_FOR_HUMAN_T3_REVIEW`. T3 / G3: muda a regra que transforma um
rascunho do Assistente de Plantão em tarefas e memória confirmadas. **Sem BUILD
até revisão humana explícita deste documento.** Sem ação clínica, sem dado real;
NO_MODEL permanece e não é removido por esta SPEC.

Escopo: consumidor `products/shift-assistant` (ADR-010). É um **delta de
fatiamento** sobre a [SPEC0179](0179_shift_consumer_reliability.md) §3, §4 e §6
(aprovada; corpo hash-bound, não editado). Onde esta SPEC e a 0179 divergem, a
0179 vale, salvo nos pontos marcados `DECISÃO 0283`, que a 0179 deixa abertos.
Evidência: [DISCOVERY](../04_audit/evidence/AUD0625-F13-DISCOVERY-07-20261029/DISCOVERY.md).

## 1. Problema

1. **Preview sem recibo.** O rascunho é gravado antes do envio do preview; a
   falha de envio vira log; `ok` confirma sem saber se a pessoa recebeu o
   conteúdo (D1–D3).
2. **Preview cortado.** Notas grandes têm o fim cortado em 4 partes e o fim é
   onde ficam os avisos e a instrução de confirmação (D4).
3. **Token sem conteúdo.** `ok nota <8 hex>` identifica a nota, não a revisão
   nem o conteúdo apresentado (D5).
4. **Fidelidade por conjunto.** A checagem numérica aceita a troca de valores
   entre pacientes, campos e unidades se os números existem na fonte (D6).

## 2. Invariantes

I1. **Recibo antes da confirmação.** Uma revisão só é elegível a confirmação
depois que **todas** as partes do preview daquela revisão foram aceitas pelo
canal. Recusa (`not_sent`), resultado incerto, parte ausente ou preview cortado
tornam a revisão não elegível.

I2. **Fail-closed.** Falta de recibo (inclusive por queda entre a gravação do
rascunho e o envio) é "não elegível". Nunca se infere recibo.

I3. **Confirmação exata.** A confirmação nomeia a revisão e o conteúdo
apresentados (token do §4); conteúdo diferente do apresentado não confirma.

I4. **Associação por tupla.** Cada valor numérico com unidade da saída tem de
corresponder, na fonte, ao mesmo bloco de paciente, ao mesmo campo e à mesma
unidade literal. Sem correspondência única, a revisão tem `blockingIssues`.

I5. **Sem efeito colateral.** Nenhuma tarefa `open`, lembrete ou memória
confirmada nasce de revisão não elegível; recusa não altera nota nem tarefa.

I6. **Nada novo no núcleo.** Mudanças só em `products/shift-assistant/**`; o
harness não importa o consumidor.

## 3. Recibo do preview (PISO-003 §6, fatia mínima)

Novo evento do journal do produto `preview_presented`, gravado por um único
`commit` depois do último envio daquela revisão:

```
{ type: 'preview_presented', at, noteId, revision, contentSha256,
  parts: [{ index, bytes, partSha256, outcome: 'accepted'|'not_sent'|'uncertain' }],
  truncated: boolean }
```

- `contentSha256` é o hash do texto integral do preview, antes do corte.
  `complete = parts.length ≥ 1 ∧ todas accepted ∧ ¬truncated`.
- A nota nasce `preview: 'pending'`. O envio tenta todas as partes; uma parte
  recusada **não** interrompe o registro: as já enviadas e as restantes entram
  no recibo (`not_sent` para as não tentadas). O recibo, e não o log, é o
  registro da falha.
- `#confirm` só considera elegível a revisão cujo último recibo é `complete`.
  Caso contrário responde `CONFIRMATION_NOT_ELIGIBLE` com a causa
  (`preview_not_delivered`, `preview_uncertain`, `preview_partial`,
  `preview_truncated`) e não altera nota nem tarefa.
- Reenvio: a mesma revisão pode ser reapresentada (nova tentativa de envio),
  gerando novo recibo para o mesmo `contentSha256`. Um recibo antigo `complete`
  não é invalidado por reenvio falho.
- `DECISÃO 0283-A (preview grande).` Preview acima do limite de partes **não**
  é cortado em silêncio: a revisão fica não elegível (`preview_truncated`) e a
  resposta orienta dividir a nota. Os limites 4 × 32 KiB não mudam.
  Alternativa descartada: elevar o número de partes (muda o orçamento de
  transporte da 0179 §8.2 sem fechar o princípio).
- `DECISÃO 0283-B (resultado incerto).` `uncertain` não é recibo. A pessoa pode
  sair do estado por (i) reapresentação aceita ou (ii) `ok nota <token
completo>`: o eco do token completo é evidência de que ela viu a revisão.
  `ok` simples continua exigindo recibo `complete`.
- `DECISÃO 0283-C (rascunhos anteriores à SPEC).` Rascunhos não confirmados de
  journals sem `preview_presented` são não elegíveis (I2) até serem
  reapresentados; o primeiro tick após o upgrade os reapresenta, e a pessoa
  pode usar `corrigir`. Nenhuma confirmação existente muda.

## 4. Token de revisão

Segue a 0179 §3: `<noteId curto>-r<revisão>-<hash curto>`, mostrado
integralmente no preview (`ok nota <token>`), com 8 hex em cada parte. A
comparação interna usa o identificador completo e o hash integral persistidos.
`revisão` é a posição da revisão na cadeia de `corrigir` da nota; `hash` é o
início de `contentSha256`. O código de 8 hex puro deixa de ser aceito como
seletor quando a revisão tem token; a mensagem de "mais de um rascunho" lista os
tokens completos. A recusa de token com revisão substituída ou hash divergente é
`CONFIRMATION_NOT_ELIGIBLE`, sem revelar nota de outro autor.

## 5. Fidelidade de associação (PISO-002 §4, fatia mínima)

Módulo determinístico novo `src/source-evidence.ts`, sem LLM.

1. **Blocos de fonte** por âncora literal de paciente (nome e `ID|ficha|
prontuário <literal>`; leito se dito), intervalos disjuntos, como na 0179 §4.
2. **Ocorrências de valor** da saída: nos campos `evolucao`, `motivo`,
   `exames_pedidos`, `condutas` e `pendencias[].descricao`, extrair
   `(número, unidade literal)` com a regex conservadora `\d+([.,]\d+)?` seguida
   de unidade da lista fechada (`mg, g, mcg, ml, mL, l, UI, %, bpm, rpm, mmHg,
°C, kg, h, min, vezes`), mais número sem unidade quando o rótulo de campo da
   fonte o exige (`temperatura`, `frequência cardíaca`, `frequência
respiratória`, `peso`, `glicemia`).
3. **Correspondência.** Cada ocorrência da saída precisa de uma ocorrência na
   fonte com **mesmo número literal, mesma unidade literal, mesmo bloco de
   paciente e mesmo rótulo de campo**. Escala preservada: `1,0` ≠ `1`. Sem
   conversão (`mg` ≠ `g`), sem cálculo, sem equivalência por extenso (C2 da 0179
   fica para a fatia seguinte).
4. **Issues bloqueantes** (códigos da 0179): `VALUE_PATIENT_MISMATCH` (valor
   existe só no bloco de outro paciente), `VALUE_FIELD_MISMATCH` (existe no
   mesmo bloco sob outro rótulo), `VALUE_UNIT_MISMATCH` (mesmo número, outra
   unidade), `UNSOURCED_VALUE` (nenhum bloco), `SOURCE_ASSOCIATION_AMBIGUOUS`
   (mais de uma correspondência, ou fonte fora da gramática). O preview mostra
   o trecho da fonte ao lado do valor proposto. A lista numérica por conjunto
   (`unverifiedNumbers`) continua como aviso.
5. `DECISÃO 0283-D (falso positivo).` A regra é conservadora: fonte fora da
   gramática ou rótulo não reconhecido bloqueia (`SOURCE_ASSOCIATION_AMBIGUOUS`)
   e pede `corrigir` com rótulo ou ID explícito; **não** degrada para aviso. A
   confirmação humana não é prova de que o modelo associou certo.
6. Sem `SourceEvidence`/`quote` nesta fatia: ela depende de D2 e continua
   `Aberto` no cartão PISO-002.

## 6. Aceite e testes

Os 8 RED de `src/__tests__/preview-receipt-reliability.test.ts` (R1–R8) viram
verdes sem trocar `it.fails` por asserção mais fraca; o marcador é removido no
BUILD. Casos novos exigidos no BUILD:

- recibo: parcial (1ª aceita, 2ª recusada), incerto, queda entre gravação e
  envio, reinício do volume (recibo e não-recibo sobrevivem), replay do webhook
  do `ok`, reapresentação com sucesso depois de falha, rascunho legado (C);
- token: revisão substituída, hash divergente, eco do token completo sobre
  `uncertain` (B), código curto recusado, nota de outro autor;
- associação: os três RED, mais troca entre três pacientes, valor idêntico em
  dois blocos (correspondência por bloco), `1,0` vs `1`, fonte fora da gramática
  (D), homônimos (mantém AUD0621);
- regressão: `confirmation-reliability`, `inbox-outbox-reliability`,
  `journal-reliability`, `shift-assistant*` verdes; sem mudança de limites de
  transporte; `skip-catalog`/`mutation-manifest` religados se arquivos
  catalogados forem tocados;
- mutação sobre o código novo (recibo, token, tupla), todas mortas ou
  justificadas equivalentes.

## 7. Fora de escopo

Equivalência por extenso (C2), `SourceEvidence` com `quote` (C3), outbox durável
de todas as respostas (PISO-003 integral), recuperação de journal (PISO-004),
qualquer mudança no NO_MODEL ou na decisão D2, canais reais, ação clínica.

## 8. Decisões pedidas ao humano (T3)

| ID     | Pergunta                                                                    | Recomendação                                |
| ------ | --------------------------------------------------------------------------- | ------------------------------------------- |
| 0283-A | Preview grande: bloquear confirmação ou elevar o limite de partes?          | Bloquear; não mudar limites                 |
| 0283-B | Resultado incerto: só reapresentação ou também eco do token completo?       | Aceitar os dois; `ok` simples só com recibo |
| 0283-C | Rascunhos sem recibo no upgrade: não elegíveis até reapresentar?            | Sim (fail-closed)                           |
| 0283-D | Associação fora da gramática: bloquear ou só avisar?                        | Bloquear                                    |
| 0283-E | Fatia 1 inclui a tupla (§5) junto do recibo (§3), ou o recibo vai primeiro? | Recibo e token primeiro; tupla na fatia 2   |

Aprovar esta SPEC não libera release, piloto, provider real nem a decisão D2.
