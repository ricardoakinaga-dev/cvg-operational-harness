# F03 / resposta à crítica I8

**Entrada:** [I8-review](I8-review.md), 0 P0/0 P1/1 P2, sobre a SPEC 0163 SHA-256 `a44d4aa5df7ba8c9c3077fc0a59a6259ad5dbba1904a4c9abdcc8e632ed9f884`.

A regra de admissão de `recordLocalSpan` agora exige que o ID local gerado seja diferente **tanto** do span de origem quanto do pai validado, quando presente. Uma colisão é detectada antes de `end`, com degradação fixa e sem observação inválida no buffer. A prova exige gerador determinístico que devolva alternadamente cada um dos dois IDs proibidos e verifica ausência de `end`/registro, além de um positivo com terceiro ID distinto. Isso alinha a condição executável ao teste de identidade já descrito.

Os 74 registros explícitos e os 34 pares `HEAD` automáticos da resposta I7 não foram alterados. Esta resposta é documental: não implementa a guarda, não executa o teste e não concede BUILD. Uma crítica independente deve verificar o novo hash antes da revisão humana T3.
