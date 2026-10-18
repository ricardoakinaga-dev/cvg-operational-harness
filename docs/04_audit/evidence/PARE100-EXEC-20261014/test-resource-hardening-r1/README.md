# SPEC0224 — suporte de subprocessos dos testes

Resultado da unidade: **REVISE / TH06 não atendido**. Houve três candidatas e dois retrabalhos; o código permanece somente no worktree isolado, sem aprovação da unidade ou promoção ao diretório principal.

A execução focada final passou em **50 testes**: 40 do helper e dez de ciclo de vida217. Tipagem dos sete arquivos, tipagem/lint oficiais e formatação passaram. As **302 expectativas originais** dos cinco consumidores foram preservadas. Isso não constitui aceite de PostgreSQL, global, E2E, qualificação ou paridade.

A revisão final encontrou três finalizadores de filhos que ainda perdem a causa inicial quando o encerramento do pool falha. O Lead repetiu a mesma probe sem alterar seu código: os seis controles de fonte original/corrente reproduzem a perda. Outra reprodução executa o helper real e confirma perda da causa na falha dupla de criação/remoção do HOME. A unidade permanece incompleta.

- [Resultado e limites da unidade](contract/unit-closure.json).
- [Revisão independente final por critério](review-r3/review.json).
- [Reprodução e autenticação do Lead](lead-final-review/lead-verification.json).
- [Falha adicional na alocação do HOME](lead-cleanup-probe-r3/finding.json).
- [Diff final preservado](rework-r3/implementation.patch.source.txt).
- [Adjudicação da probe histórica: três PASS e dois FAIL, sem chamar a suíte de verde](rework-r3/probe-and-gate-adjudication.json).
- [Manifesto de publicação e hashes das origens](publication-manifest.json).

As rejeições R1/R2 e todos os resultados selecionados, inclusive falhas e omissões de streams vazios, permanecem preservados. O pacote publica 309 arquivos não vazios por espelho; caches, HOME/TMP, snapshots amplos e o inspect privado do Docker não foram copiados. Originais privados continuam disponíveis e seus selos são vinculados pelo manifesto.

O container sintético224 permaneceu parado. P01–P04 não foram executados; nenhum schema0030/0031, checker, pin, contrato público ou dado real foi alterado. Fronteira corrente:224 diagnósticos padrão/421 estritos, INCOMPLETE, zero violações/installed-lock drift; não há exceção nova ativada. A referência recebeu somente adjudicação estática de quatro chamadas literais/nove entradas/182 hashes, sem prova de execução ou paridade.

Programa integral:36 tarefas em oito fases, duas DONE_LOCAL e34 abertas; paridade integral NOT_MEASURED. Próximo passo: planejamento de recuperação dos caminhos de falha antes de outra implementação, preservando o encerramento sem aprovação desta unidade.
