# Checkpoint CODEX100 — drivers de observação SDK concluídos localmente

Atualizado em 18/10/2026 pelo executor do Lead `CONT-20261018-D9EF`. O programa CODEX100 segue
**IN_PROGRESS**. A unidade `DX100-G02:IMPLEMENT-SDK-OBSERVATION-DRIVERS` está
**COMPLETED_LOCAL_WITH_DECLARED_GAPS**. A meta continua sendo incorporar ao Operational Harness
todas as funções do Codex do pin `8d9f6466ff0294785d56f55b1fe363d132fe4133`.

Leia primeiro o [relatório](REPORT.md), a [validação H01–H12](validation-r2.json), o
[congelamento R2](source-freeze-r2.json) e a [próxima tarefa](next-task.json). O checkpoint de
reinício anterior está preservado em [archives/checkpoint-preimages/controls/](archives/checkpoint-preimages/controls/).

## Estado

- As fontes Node e Python estão completas, incluindo supervisor e observador independentes do host.
  [interface-v1](interface-v1.json) não mudou; as escolhas abertas estão fixadas no
  [suplemento](interface-bindings-v1.json).
- Autotestes: Python 115/115 e Node 98/98. Houve 10 diagnósticos constantes em serviço, todos com o
  veredito esperado. Revisão: R1 REVISE, um reparo agrupado e R2 APPROVE, sem achados obrigatórios.
- Orçamento fechado sem reset: 12/12 serviços, 2/2 revisões e 1/1 reparo agrupado. Nenhum serviço,
  processo ou agente próprio ativo ([recibo](resource-receipt-final.json)).
- Nenhum import de SDK, Pydantic ou compilador. Os 19 casos seguem `NOT_RUN`, com 0 recibos
  funcionais e 0 crédito de paridade. Catálogo 487+22 inalterado.

## Lacunas que viram pré-condições da próxima porta

- Os caminhos TS da identidade R2 não rodaram em serviço.
- A barreira cancel/reply e o loader rodaram em serviço só com identidades anteriores.
- Faltam os predicados de aceitação por caso, o staging selado do perfil SDK, `recv_ns` por frame
  e a errata R2-F01.
- Os sete artefatos adquiridos foram apagados de `/tmp` no reinício. A reaquisição só pode ser de
  dados, sob autorização própria, e não é autorizada por este checkpoint.

A SPEC0239 segue `REQUESTED_PENDING_USER`: não repetir a pergunta nem inferir BUILD. Os ledgers
compartilhados ficaram readonly; o texto proposto está em [ledger-delta-cont-d9ef.md](ledger-delta-cont-d9ef.md).
