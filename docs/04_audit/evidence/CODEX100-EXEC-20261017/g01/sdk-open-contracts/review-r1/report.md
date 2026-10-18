# R1 — REVISE

`DX100-G01:RECONCILE-OPEN-SDK-CONTRACTS` — crítica FRESH independente, sem participação na construção e sem descendentes. **mandatory_count: 2 (P2/P2)**. Este parecer julga contratos de fonte T1; nenhum resultado de runtime/funcional foi emitido.

Freeze: `80f98219346ee93a6750d6eeca39404bf1c699b8d341b60a1523a4171d1d7ba3`, 70 arquivos. [Primeiro inventário](first-hash-inventory.json), [último inventário](last-hash-inventory.json), [dados independentes](data-observations.json), [parecer estruturado](review.json), [manifesto](manifest.json).

## Achados obrigatórios

**R1-01 — P2 — SK02/SK03: a expectativa de PY04 está invertida para resume/fork.** [PY04](../python-contracts.json#L78), linhas 91/94/95, afirma que resume impõe o `threadId` do argumento e considera incorreto deixar `params.threadId` substituí-lo. Porém [client.py arquivado](../inputs/P02.source.txt#L485), linhas 485–491, faz `{"threadId": thread_id, **_params_dict(params)}`; fork repete a ordem nas linhas 505–511. O valor em params prevalece. Com argumento sintético A e dict `{threadId: B}`, a mensagem leva B; null explícito no dict também prevalece. Em contraste, `_start_turn`, linhas 672–678, põe `threadId` e `input` depois de params, impondo seus valores. `_params_dict`, linhas 97–110, mantém o dict e não remove seu null. As declarações geradas [ThreadResumeParams/ThreadForkParams](../inputs/P17.source.txt#L6107), linhas 6107/10018, também contêm `threadId`; nenhuma semântica Pydantic foi executada ou presumida.

O campo `future_known_bad` atual rejeitaria comportamento correto da referência. Corrigir os contratos/futuros de resume e fork versus `_start_turn`, com refs e contraprova de ordem de overlay em dados/AST. O exemplo independente está em `data-observations.json:F_R1_01_dictionary_precedence`. **Não corrigir o SDK nem exigir executá-lo para reparar este T1.**

**R1-02 — P2 — SK02: falta concretizar a cadeia de cancelamento de goal.** [PY10](../python-contracts.json#L224), linhas 224–240, descreve `_start_turn` comum; [PY13/PY14](../python-contracts.json#L298), linhas 298–343, descrevem startup síncrono e chamada ao callback `cancel_goal`. Faltam expectativas nomeadas para dois corpos reais:

- [async_client.py](../inputs/P03.source.txt#L244), linhas 244–290: worker daemon, `shield(wrap_future(operation))`, `CancelledError` registra callback e relança, resultado futuro falho pula cleanup, resultado bem sucedido inicia outro daemon que cancela e faz finish/unregister em finally. Entregar CancelledError não significa que esse cleanup já ocorreu.
- [client.py](../inputs/P02.source.txt#L568), linhas 568–597: pause via `thread/goal/set(status=paused)`, Exception suprimida e tentativa de interrupt em seguida; ID ausente não envia interrupt; somente InvalidRequestError com prefixo específico pode gerar uma segunda tentativa com ID diferente, extraído da mensagem ou do estado; IDs ausentes/iguais e outras falhas não repetem.

As arestas/excertos capturam partes desses helpers, mas não substituem o contrato de ramos/defaults/erros/cleanup nem seus oráculos futuros. Acrescentar a cadeia e cutpoints/known-bad explícitos em PY13/PY14 ou registro delimitado equivalente: cancel antes/depois do resultado, resultado falho, pause falho, ID ausente/igual/alterado e limite de duas tentativas de interrupt. Preservar o contraste com [cancelamento de ordinary turn](../inputs/P03.source.txt#L301), linhas 301–326, e [close/cancel de goal stream](../inputs/P05.source.txt#L417), linhas 417–448. O limite genérico runtime NOT_RUN não cobre essa omissão de contrato; os efeitos e schedules continuam sem qualificação.

## Dezoito checks substantivos

Cada linha é um grupo delimitado de inspeção; os dois checkers permitidos integram esses grupos, sem acrescentar revisões ou testes funcionais.

| ID | Escopo | Disposição |
| --- | --- | --- |
| C01 | Freeze e proveniência (SK06,SK07) | SATISFIED_STATIC |
| C02 | Donos, requisitos e catálogo (SK01) | SATISFIED_STATIC |
| C03 | 25 sites RPC e resultados (SK02) | SATISFIED_STATIC |
| C04 | Aliases e relações (SK02,SK06) | SATISFIED_STATIC |
| C05 | Precedência de parâmetros (SK02,SK03) | REVISE |
| C06 | Declarações geradas e biblioteca externa (SK03) | SATISFIED_STATIC |
| C07 | Initialize e guard de campos (SK02,SK05) | SATISFIED_STATIC |
| C08 | Init/processo e encerramento (SK02) | SATISFIED_STATIC |
| C09 | Respostas, notifications, erros e retry (SK02) | SATISFIED_STATIC |
| C10 | Turn/subscribers/coleta (SK02) | SATISFIED_STATIC |
| C11 | Goal: startup, cancel e close (SK02) | REVISE |
| C12 | Login e inputs (SK02,SK03) | SATISFIED_STATIC |
| C13 | TS lazy/input/schema/cleanup (SK04) | SATISFIED_STATIC |
| C14 | TS config/options/ambiente (SK04) | SATISFIED_STATIC |
| C15 | TS JSONL/agregado/EOF (SK04) | SATISFIED_STATIC |
| C16 | TS Abort/process lifecycle (SK04) | SATISFIED_STATIC |
| C17 | Distribuição/plataforma/proxy (SK05) | SATISFIED_STATIC |
| C18 | Preservação, metachecks e higiene (SK06,SK07,SK08) | SATISFIED_BOUNDED_REVIEW_DELIVERY |

A evidência detalhada de cada grupo está em `review.json:substantive_checks`. SK01/04/05/06/07 atendem no recorte estático; SK02/03 exigem revisão. SK08 tem a entrega R1 selada, com integração de continuidade e encerramento do ator pelo Lead ainda posteriores a esta entrega; não é aceite da unidade.

Os dois comandos existentes foram executados **uma vez cada**, somente `--check`, ambos exit0: [Python](python-check.log), sete grupos/18 negativos; [TypeScript](typescript-check.log), 24 cenários/10 negativos. Não repetidos. A ferramenta TS6.0.3 executada pelo reader é parser local, sem typechecker, emit ou import do alvo. A leitura independente encontrou R1-01 apesar desses checks, pois validar joins/expressões não prova a verdade da prosa.

Confirmados os bytes Git pinados de 24 fontes Python e12 TS/wrappers,724 excertos Python e269 ocorrências de refs TS. Conferidos 25 sites históricos =20 requests/1 initialized notification/4 dynamic e os21 IDs reais correspondentes. Conferidos350 endpoints de arestas, incluindo7 multihop/32 referências callable e oito aliases; isso não significa350 funções ou execuções nem grafo completo. O índice AST inicial do crítico omitiu uma função aninhada; foi corrigido recursivamente e a origem conferiu, sem defeito no pacote ou falha runtime.

Seis gaps/owners/requisitos mantêm OPEN/NOT_RUN/null. O checkpoint anterior de2.690 arquivos tem2.687 idênticos e somente três controles próprios autorizados alterados (state/continuation/execution-log); zero drift indevido. SPEC0239 `ccdf3a754c460e138307148f9eec79e0dce4a9b7ac5c9d10334716e5b5c0dd87`, oito anexos, request pendente e14CQ conferem. Catálogo509 linhas,487 funcionais+22 controles,22 famílias, todos NOT_RUN/null; backlog/roadmap anteriores preservados por hash, incluindo49 cards/10 fases.24 links locais dos índices resolvem; o relatório bruto TS e os históricos de recuperação foram preservados. REPORT e Lead acceptance serviram como índices.

## Disposição e limites

**REVISE**, sem bloqueio ambiental: os dois achados admitem um reparo documental agrupado e eventual R2 autorizada dentro do orçamento original (resta uma revisão/um reparo). Nenhum reparo foi feito pelo crítico. O manifesto fecha os outputs desta R1; sua autoentrada usa null explicado para evitar autorreferência.

Pydantic/coerção/config/nullable/herança efetivas, SDK/runtime instalado, wheels/tarballs/binários, plataformas e liveness continuam não qualificados. Client default accept não concede autoridade institucional; EOF parcial TS não certifica terminal nativo; cancel/close/sinal não prova ausência de efeito ou fim do processo. Sem SDK/app/reference/provider executados ou importados, sem rede/install/PG/Docker/gate/teste funcional. Nenhum recibo, gap, G01 global, BUILD ou release fechado. O T3 pendente0239 permanece separado deste veredito T1.

Escrita do crítico somente em `review-r1/**`; coordenação/SPEC/catálogo/masters/owners/fontes/pacotes anteriores e programstate não foram modificados. Lead deve integrar o parecer em sua continuidade e fechar o ator após a entrega. Nenhuma R2 ou descendente iniciado.
