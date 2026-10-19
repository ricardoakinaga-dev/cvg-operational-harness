# Drivers de observação SDK — relatório da unidade

Ação: `DX100-G02:IMPLEMENT-SDK-OBSERVATION-DRIVERS`. Status:
**COMPLETED_LOCAL_WITH_DECLARED_GAPS**. A implementação e a qualificação com diagnósticos
constantes terminaram dentro do orçamento. A revisão final R2 aprovou sem achados obrigatórios.
Nenhum SDK, Pydantic ou compilador foi importado ou executado; os 19 casos SDK seguem `NOT_RUN`
e não há recibo funcional nem crédito de paridade.

## O que foi entregue

- **Node** ([node/](node/)): canal estrito ([channel.cjs](node/channel.cjs)), adapter sintético
  executável ([adapter-typescript](node/adapter-typescript)), peer JSONL ([fixture-cli.mjs](node/fixture-cli.mjs)),
  driver ([ts-driver.mjs](node/ts-driver.mjs)), loader restrito ([extension-loader.mjs](node/extension-loader.mjs))
  e driver do compilador preparado e não executado ([transpile.mjs](node/transpile.mjs)).
- **Python** ([python/](python/)): canal ([channel.py](python/channel.py)), adapter
  ([adapter-python.py](python/adapter-python.py)), peer JSON-RPC ([fixture-rpc.py](python/fixture-rpc.py)),
  driver ([python-driver.py](python/python-driver.py)), observador independente do host
  ([observer.py](python/observer.py)) e supervisor fora do cgroup ([supervisor.py](python/supervisor.py)).
- **Dados**: [fixture-cases.json](fixture-cases.json) (19 linhas congeladas + 8 diagnósticos),
  [case-plan.json](case-plan.json), [profile-templates/](profile-templates/) e o suplemento
  [interface-bindings-v1.json](interface-bindings-v1.json). [interface-v1.json](interface-v1.json) não mudou.

## Qualificação

- Autotestes puros: Python 115/115 e Node 98/98 ([selftests/](selftests/)). Cobrem 33 capturas
  sabidamente ruins rejeitadas, reconciliação, FIFOs reais do host, prazos, controles antes do END,
  loader/emitidos e interoperabilidade Node→observador Python.
- Diagnósticos em serviços transientes `bwrap` + `systemd-run` (12/12 do orçamento, incluídos os 2
  históricos): 10 tentativas, todas com o veredito esperado. O conjunto inclui relay Python e TS,
  barreira cancel/reply, loader e gate do compilador, sinal no meio do stream, SIGKILL da unidade e
  backpressure com falha limitada. A tabela por identidade está em [source-freeze-r2.json](source-freeze-r2.json).
- Revisão independente: [R1](review-r1/report.md) REVISE (7 P2), seguida do [reparo agrupado único](repair-r1.json)
  e da [R2](review-r2/report.md) APPROVE. As recomendações residuais estão em
  [lead-disposition.json](review-r2/lead-disposition.json). Critérios H01–H12 em [validation-r2.json](validation-r2.json).

## Lacunas declaradas

Só [8ec433a64c73-DIAG-PY-TERM](diagnostics/8ec433a64c73-DIAG-PY-TERM/result.json) roda exatamente as
fontes R2. Os caminhos TS reparados não rodaram em serviço com identidade R2, porque o orçamento
acabou; a barreira final, o INVALID em voo, o sinal Node e os emitidos foram qualificados por
autotestes e revisão estática. Ficam para a próxima porta:

- os predicados de aceitação por caso;
- o staging selado do perfil SDK;
- a gravação de `recv_ns` por frame;
- a reaquisição dos sete artefatos, apagados de `/tmp` no reinício.

H03, H04, H05, H08 e H09 seguem PARCIAIS.

## Recursos

As 12 unidades estão coletadas e os cgroups foram removidos; não sobrou processo de papel nem
bwrap ([recibo](resource-receipt-final.json)). As tentativas ficam preservadas em
`/mnt/ia/cvg-codex100-exec-20261017/sdk-observation-drivers/attempts/`.
A SPEC0239 segue `REQUESTED_PENDING_USER`; esta unidade não concede BUILD nativo.
