# PAR-C01 — DISCOVERY da nota 0290c (`throughSequence` é posição, não sequência do log)

Task `AUD0625-PAR-C01-D9-20261029`, 30/10/2026, Claude D9, sobre `claude/aud0625-par-c01-d9` @ `5a715d4c5` (desvio 5 da fatia 2, pedido do DF). Sintético.

## Pergunta e resposta curta

O `throughSequence` do evento `context/compacted` guarda a **posição da última mensagem resumida na lista de mensagens da requisição** (`sequence = index + 1` em `compaction.ts`),
e não a sequência do log de sessão. Confirmado; a lacuna é de mapeamento, e o significado aprovado já é o do log.

## Evidência

| Pergunta | Resposta | Onde |
| -------- | -------- | ---- |
| De onde vêm as mensagens que o controle vê? | Do pedido de modelo montado pelo kernel/orquestrador (`system` com objetivo e instruções + `user` do turno) e por controles anteriores; `ModelMessage` é `{role, content}` | `kernel/kernel-runtime.ts`, `contracts.ts:256`, `kernel/pipeline.ts` (`runModelCall`) |
| Elas carregam a sequência do log? | **Não** em ponto algum: nem `ModelMessage`, nem o kernel, nem o host; o `CompactableMessage.sequence` é fabricado como `index + 1` dentro do controle | `compaction.ts` (`createCompactionControl`), `model-compaction.ts` |
| O SDK liga o histórico do log às mensagens? | Não: `turn.send` grava `message/user` no log e monta um pedido novo de um turno só; o histórico da sessão não é reenviado ao modelo | `packages/sdk/src/server.ts:230-330` |
| O que o validador exige? | `throughSequence < sequence` do próprio evento; a regra existe para o evento só cobrir prefixo que o precede (SPEC 0202: "referência a prefixo imutável"; 0206 confirma que o evento "é a prova auditável") | `session/events.ts:258-263` |
| Qual é o significado aprovado? | O da 0202/0206: **sequência do log**. A 0290 §3.5 repete o campo sem redefini-lo | `0202`, `0206`, `0290` |
| Quem escreve o campo? | `createSessionCompactionRecorder` copia `result.throughSequence`, que o controle preenche com a posição | `compaction.ts` |

Consequências medidas pelo teste `aud0625-par-c01-through-sequence.test.ts` (log real em `InMemorySessionEventStore`, eventos antes das mensagens):

- com 6 eventos de enchimento e as mensagens em 7 e 8 do log, o evento grava `throughSequence = 3` (posição), quando o prefixo resumido termina no 8;
- com um log curto (2 eventos), a posição 3 não é menor que a sequência do evento (3): o validador **rejeita** o evento e o controle recusa o turno;
- um consumidor que lê `throughSequence` como cobertura (a projeção `compaction` da S02, o fork do S04) afirmaria que o resumo cobre eventos que ele não cobre, ou o contrário.

## Caminho escolhido: cabe no recibo da 0290, sem mudar `CompactableMessage` nem `ModelMessage`

Nada nos tipos de mensagem muda. O vínculo é uma **porta do anfitrião**, no mesmo molde dos pins aprovados na D1-A ("fontes estruturadas fornecidas pelo anfitrião, nunca inferidas do texto"):
`logSequenceOf(index, turn) → number | undefined`, opcional, nos dois controles de compactação. Regras e limites estão em [0290c](../../../02_spec/0290c_through_sequence_note.md).
O contrato público muda só por uma opção opcional nova em duas interfaces de opções; nenhum tipo de mensagem, evento ou esquema muda. Se o DF entender que isso exige T3, a mudança é
reversível (um commit) e fica isolada.

## Lacunas

Não há, no repositório, um host que reenvie o histórico do log ao modelo; a porta só pode ser exercitada por teste. O host real (S07/S03) é quem sabe qual evento originou cada mensagem.
