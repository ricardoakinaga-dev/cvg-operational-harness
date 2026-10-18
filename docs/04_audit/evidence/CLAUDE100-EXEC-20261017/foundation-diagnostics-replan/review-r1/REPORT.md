# Crítica fresca do HOW — C100-FND-DIAGNOSTICS-REPLAN-001

**APPROVE_REPLANNED_HOW — zero ajustes obrigatórios.** O plano distingue corretamente construção, rethrow, observação esperada, observador pós-CAS e passagem ao finally. É um HOW válido para uma futura unidade T2 privada. Este parecer T1 não implementa, certifica, cria orçamento de código nem reabre qualquer unidade FAILED.

Objeto julgado: [plano congelado](plan.snapshot.source.txt), SHA-256 `72bdc20ab3f9114dd4397420790d2f04072747008dc54c7b230c04cf192b4fa5`. Fonte readonly: `b585b214edb03707eba15a5342e839dab17c6da3`. [Resultado estruturado](result.json), [manifesto da revisão](manifest.json), [claim local](claim.json), [binding inicial](inputs-before.json) e [binding final](inputs-after.json). Os 22 inputs e os 14 pares fonte/snapshot foram conferidos por SHA-256 e bytes nos dois extremos; nenhum drift observado. O manifesto de inputs também foi vinculado separadamente.

Foi lida a constituição docs/07, o início DIAGNOSTICS da coordenação, os cabeçalhos de estado/log/backlog e os registros TH06 pertinentes. A reserva de review-r1 já está registrada na coordenação. A restrição explícita do usuário mantém planos, task, ledgers, candidatas e demais pacotes readonly; a continuidade desta revisão fica somente aqui. Aplicada a skill engineering-framework para disciplina de evidência e julgamento estático. Não houve delegação, execução de target, importação, compilação, rede, teste ou probe.

## Julgamento das operações e dos fluxos

`collectCompleteDiagnostics` começa com a primária bruta, captura cada ação síncrona separadamente e retorna o wrapper produzido pela política existente. Assim, a avaliação de `errorInfo`, dos campos do objeto e da escrita ocorre depois de capturada a primária. O wrapper é necessário inclusive para `throw undefined`; não se pode testar presença pelo valor do erro. Ações independentes continuam sendo tentadas, e operações dependentes permanecem na mesma closure. Não há motivo para duplicar a política de `completeCleanupError` nem alterar as quatro definições normais de `errorInfo`.

`projectCompleteDiagnostic` tem outro contrato: retorna normalmente quando a projeção funciona; só lança a composição quando a própria projeção falha. Isso serve para a rejeição esperada em finish e probe. Nos handlers de rethrow, a primária continua sendo relançada pelo coletor, mesmo com diagnóstico bem-sucedido. A assinatura `() => void` isoladamente não impede callbacks async em TypeScript; o plano reconhece isso e exige auditoria dos callsites. A aceitação pressupõe as closures síncronas propostas, com I/O assíncrono ainda aguardado por `cleanupCompleteChildren`.

No journal público, coletar push/construção antes e entregar seu `{error}` ao owner assíncrono permite que trace seja tentado mesmo se o push falhar. Nos cinco sites já lazy, o corpo inteiro do callback está sob captura do cleanup: a presença lexical de um try externo, sozinha, não justificaria essa conclusão. O combiner e os wrappers existentes foram lidos nas linhas 695–755 do [fixture congelado](../inputs/05-complete-process-support.ts.source.txt); seus corpos não foram executados.

O observador de capacity é distinto do catch de falha nativa de CAS: o primeiro ocorre depois de `cas(input)` retornar. O HOW mantém o mesmo objeto/token nativo e registra o erro bruto em carrier privado, inclusive quando `errorInfo` falha antes de alimentar `observerErrors`. O carrier deve participar da finalização que falha o caso; o guard de verdict ocorre antes dos saves. Um array de metadados vazio não prova ausência de falha. O plano exige `UNPROVEN_FAILURE`, sem ErrorInfo fictício, sem suprimir as asserções existentes e sem usar a falha do observador para rejeitar o CAS já commitado.

No catch externo de capacity, a atribuição da combinação ao carrier **antes** de relançar resolve o caso B. Se P é a primária opaca, D1 a falha de construção no catch e D2 outra falha de projeção no finally, o cleanup recebe P+D1 e captura D2 em seu callback; o grafo final deve alcançar P, D1 e D2 por identidade. Manter somente `primary={error:P}` repetiria a perda de D1. Uma eventual falha de save/end também deve permanecer no grafo, e a falha de um callback não cancela os demais callbacks seguros. Essa é uma dedução dos corpos existentes e do wiring proposto, com prova futura obrigatória em DG04.

## Conferência dos 23 sites reais

Cada linha abaixo foi conferida no corpo real da fonte b585, além dos dois mapas. As linhas referem-se aos snapshots integrais já vinculados. Todas as avaliações são estáticas; P01/P02/P03 são testemunhos anteriores, não execuções desta revisão.

| Site | Papel e limite da closure aceito no HOW |
| --- | --- |
| [Capacity](../inputs/00-complete-admission-capacity-postgres.integration.ts.source.txt):526 | Rethrow do journal. Capturar P antes; push inteiro com `errorInfo` em uma ação; event independente em outra; relançar combinação. |
| Capacity:552 | Falha nativa de CAS. Construção e event `native-CAS-error` dentro de uma ação do coletor. |
| Capacity:556 | Mesmo catch, segundo diagnóstico independente: construção e writes.push em outra ação; falha do event anterior não o suprime. |
| Capacity:591 | Observador pós-CAS. Construção de fault, push e event dependentes na closure; guardar composição bruta em carrier do caso e devolver o resultado original. |
| Capacity:1101 | Catch externo. Construção/atribuição de observation.error sob captura; atualizar primary com a composição antes do rethrow. |
| Capacity:1125 | Finally já lazy. Projeção de checkError dentro do callback de cleanup; primary atualizado retém D1 quando esta projeção lança D2. Guard de verdict e carrier do observador antecedem persistência. |
| [Bound](../inputs/01-complete-bound-admission-postgres.integration.ts.source.txt):487 | Rethrow no wrapper CAS. Event e sua construção capturados antes de relançar P+diagnóstico. Não converter o wrapper inteiro em observador esperado. |
| Bound:642 | Catch de run já lazy. Construção de error.json e chamada de save na closure aguardada; `{error}` bruto entregue ao cleanup. |
| [Settlement](../inputs/02-complete-settlement-public-postgres.integration.ts.source.txt):162 | Callback SQL já protegido. Construção e wire dentro do try, composição antes da entrega; callback uma vez, retorno nativo preservado. P03 é positivo anterior finito. |
| Settlement:198 | Rejeição Promise SQL, RB01/P02. failed deve receber closure do record; coletor inclui invocação dessa closure e wire, sem avaliação antecipada de errorInfo. |
| Settlement:206 | Throw síncrono SQL, RB01/P01. Mesmo limite lazy do record+wire; manter throw síncrono, sem tornar query async. |
| Settlement:856 | Rethrow do CAS/injeção. Construção inteira de CAS-error sob coletor; conservar estágio/injected e falhas deliberadas before-cas/ack-loss. Este caso não é o observador capacity. |
| Settlement:984 | Rethrow de model.complete. Event e projeção sob captura; o finally `delivered.resolve()` continua existindo. |
| Settlement:1011 | Rethrow de reserve. Capturar P antes da construção/emissão de native-reserve-error. |
| Settlement:1024 | Rethrow de settle. Capturar P antes da construção/emissão de native-settle-error. |
| Settlement:1039 | Handler de rejeição da Promise hybrid. Construção/event na closure; relançar composição, preservando a rejeição e seu acompanhamento em decisions. |
| Settlement:1077 | Catch de runResult é rethrow: construir/emitir runtime-error no coletor e rejeitar com composição. Não usar aqui a semântica de observação normal de finish. |
| Settlement:1121 | Finish observa a rejeição esperada de runResult. project envolve a construção de `{result:null,error:...}`; sucesso retorna outcome normal, falha lança P+diagnóstico. Demais operações async mantêm seus owners existentes. |
| Settlement:1182 | Probe negativo observa erro esperado. Closure inclui projeção, atribuição e emissão de native-probe-error; diagnóstico normal continua até comparações e assert STATE_CONFLICT. |
| Settlement:1315 | finish-error já lazy. Projeção e save dentro de callback aguardado com a falha de finish como primária; sem reescrita apenas por uniformidade. |
| Settlement:1336 | Summary já lazy sob remember/cleanup. Construção inteira do record, incluindo projeção condicional, e save dentro do callback; erros de callbacks anteriores continuam no owner externo. |
| [Public restart](../inputs/04-complete-tool-public-restart.test.ts.source.txt):257 | Catch de journal. O push eager atual precede cleanup; coletá-lo primeiro, passar combinação ao cleanup que ainda tenta trace; owner externo cobre pool.end. |
| Public restart:442 | Catch de harness.run já lazy. trace e save/projeção são callbacks independentes, ambos tentados; owner externo conserva pool.end. |

Contagem independente por leitura lexical dos sete arquivos: capacity 6, bound 2, settlement 13, public restart 2, demais 0 = **23**. As coordenadas coincidem exatamente entre fonte, mapa AST e mapa semântico. Isso confirma o inventário de chamadas diretas, sem alegar análise interprocedural de toda possível coerção.

Os outros sete sites do mapa também foram examinados: quatro coerções nas definições, capacity:97, bound:125, settlement:220 e public restart:86; e três substitutos em [helper-tests](../inputs/06-complete-process-support.test.ts.source.txt):1367,1463,1674. Os substitutos pertencem, respectivamente, aos controles de instrumentSql, realSettlementBoundary e catches reais. Não cobrem adequadamente os getters de Error nem a projeção real opaca. DG06 exige controles adicionais extraídos da fonte real; permite preservar os testes anteriores e adaptar somente o binding dos novos helpers no compilador de controles. Nenhum desses compiladores foi executado aqui. Total **23+4+3=30**.

## DG01–DG09 e limites de evidência

| Critério | Parecer sobre o HOW; execução futura |
| --- | --- |
| DG01 | Suficiente: P opaca precisa continuar alcançável em sync/Promise junto de diagnóstico/end, com errorInfo real. NOT_RUN. |
| DG02 | Suficiente: preservar os três modos SQL e entrega única; rejeição esperada com projeção normal não falha o caso. NOT_RUN. |
| DG03 | Suficiente: identidade do resultado/token CAS, carrier bruto, finalização falha e verdict UNPROVEN antes de save, inclusive sem registro em observerErrors. NOT_RUN. |
| DG04 | Suficiente: P+D1+D2 distintos e transitivamente alcançáveis; carrier atualizado impede substituir a combinação pela primária original. NOT_RUN. |
| DG05 | Suficiente: ações independentes separadas, dependentes agrupadas; joins antes de DB, deadlines, HOME e finalização global preservados. NOT_RUN. |
| DG06 | Inventário 23/23 revisado; prova futura com projeção real em cada escopo alterado e negativos que não usem stub permissivo. NOT_RUN. |
| DG07 | Exige preservar 75 testes/zero skips, 302 expectativas/SQL/fixtures, 50 regressões originais e sete pins protegidos. Os 14 pares atuais estão byteidênticos; os números de testes/AST são evidência anterior, não nova execução/recertificação. NOT_RUN. |
| DG08 | Exige crítica independente do código, gates T2 e certify/verificador atuais, candidata e recursos próprios antes de integração; sem transferência de certificado. NOT_RUN. |
| DG09 | Preserva FAILED/esgotamento e exige task/escopo/orçamento próprios antes de futuro BUILD; esta revisão tem código=0. Atendido documentalmente. |

A causa RB01 e os resultados P01/P02/P03 foram confrontados com o [resultado anterior](../../foundation-th06-recovery/review-build/result.json) e a [fonte arquivada das sondas](../../foundation-th06-recovery/review-build/probes.source.txt), ambos inputs vinculados. Não se assume que PostgreSQL real emita a primária sintética. O objetivo é o contrato de ownership de valores unknown do suporte privado.

Não há mandatory nem rework documental consumido nesta revisão. O aceite cobre a suficiência do HOW, sem provar implementação, ausência de regressão, M1, PAR, 117 resultados/17 controles ou release. Core/runtime/API pública/schema/policy ficam fora do delta. Qualquer futuro escopo T3 exige anotação e gate próprios; não há nova pergunta de aprovação humana para o T2 privado descrito.

Próxima ação do responsável: registrar uma futura unidade T2 delimitada, com task, HOW e orçamento próprios antes de código, preservando este freeze e as unidades FAILED. Nenhuma alteração de plano, fonte, task ou ledger foi feita pelo crítico.
