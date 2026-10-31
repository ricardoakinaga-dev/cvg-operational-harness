# Nota 0290c — `throughSequence` é a sequência do log (SPEC 0290, desvio 5)

30/10/2026. Nota de implementação da [SPEC 0290](0290_model_compaction_under_pressure.md), `claude/aud0625-par-c01-d9`; evidência em
[DISCOVERY-0290c](../04_audit/evidence/AUD0625-PAR-C01-D9-20261029/DISCOVERY-0290c.md). Não altera a SPEC aprovada (recibo human-decisions-22): fixa o significado que ela
já herda da 0202/0206 e fecha a lacuna de mapeamento que a fatia 2 declarou. Sem push; produção `NO_GO`.

## Regra

1. `throughSequence` do evento `context/compacted` é a **sequência do log de sessão** do último evento que originou uma mensagem resumida. Nunca a posição da mensagem na requisição.
2. O anfitrião informa o mapeamento por uma porta opcional, `logSequenceOf(index, turn)`, que devolve a sequência do evento de origem da mensagem `index` de `request.messages`, ou `undefined` quando
   nenhum evento a sustenta (por exemplo a instrução governada). Nada é inferido do texto.
3. `resolveLogThrough` valida o mapeamento: apenas inteiros seguros positivos, **estritamente crescentes** entre as mensagens mapeadas; a porta que lança, devolve outra coisa ou não mapeia nenhuma
   das mensagens resumidas **recusa** (`INSUFFICIENT_EVIDENCE`, sem evento). `throughSequence` = o maior valor entre as mensagens resumidas; as mensagens mantidas ficam depois dele
   (consequência da monotonia). Um resumo nunca afirma cobrir mais do log do que cobriu.
4. **Compactação por modelo (`model-compaction-v1`).** Com `onCompacted` configurado a porta é **obrigatória**: sem ela, ou com mapeamento inválido, o turno recusa **antes** de pagar o resumo.
   Sem `onCompacted` não há evento e a porta é dispensável. (Caminho novo e ainda não integrado: sem compatibilidade a preservar.)
5. **Compactação heurística (`harness-compaction-v1`, PDSH-025).** Com a porta, vale a regra 3. Sem a porta, **mantém o valor legado** (posição na requisição) por compatibilidade, e deve ser lido
   como "valor registrado"; um log curto continua sendo recusado pelo validador `throughSequence < sequence`. O ajuste da regra legada sai quando o host real passar a fornecer a porta.
6. O cancelamento durante o mapeamento não grava nem envia nada. A idempotência `(throughSequence, sourceDigest, strategyVersion)` passa a usar a sequência do log.

## Contrato

Mudanças, todas aditivas: `logSequenceOf?` em `CompactionControlOptions` e em `ModelCompactionOptions`; exportação do tipo `LogSequenceOf` e da função `resolveLogThrough`. Não mudam
`CompactableMessage`, `ModelMessage`, `ContextCompactionResult`, o esquema de evento nem o SDK. A única quebra é de comportamento e só no caminho `model-compaction-v1` (ainda não integrado):
`onCompacted` sem `logSequenceOf` passa a recusar.

## Provas e mutantes

`aud0625-par-c01-through-sequence.test.ts` (log real com eventos antes das mensagens): valor correto nos dois controles, log curto aceito, máximo entre as mensagens mapeadas, 7 mapeamentos inválidos
recusados nos dois caminhos, ausência da porta recusada antes do resumo no caminho de modelo, cancelamento no mapeamento, e os controles do legado. Mutantes T1–T13 mortos
(`mutations-0290c.json`).

## Fora de escopo

O host que reenvia o histórico do log ao modelo e implementa a porta (S03/S07); a projeção da S02 (`compaction`) passa a poder rotular o campo como cobertura quando esse host existir.
