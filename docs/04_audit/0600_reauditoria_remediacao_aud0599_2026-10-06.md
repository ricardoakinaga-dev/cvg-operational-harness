# AUD-0600 — reauditoria da remediação AUD-0599 — 06/10/2026

- Task: `AUD0600-REMEDIATION-REAUDIT-20261006`, Codex. Pedido: auditar os três commits locais `b9cf7b6`, `b98df52` e `5c97b40`.
- Candidato congelado: `5c97b40a751233a2fdd2babcbabba80387faa7cc`; base `d893ea9cfd22d014c34f0989e6836464fe596413`.
- Parecer: **as correções dos cenários originais foram confirmadas; o fechamento integral de F01/F02 é parcial, com dois P2 remanescentes**. Produção permanece `NO_GO`. Nenhuma regressão nova foi demonstrada: os dois achados também ocorrem na base.
- Evidência: [resumo e provas](evidence/AUD0600-REMEDIATION-20261006/summary.md). Implementação somente leitura; sem commit, push, dismissals, alteração de proteção do `main` ou deploy nesta rodada.

## Critérios e método

Critérios congelados antes dos testes: [AUD-0599](0599_auditoria_entrega_fable_2026-10-06.md), [SPEC 0181 §11/§12](../02_spec/0181_kernel_plugin_contract.md) e [barra 0373](../03_build/0373_barra_producao_harness.md). Verificar preservação da decisão, identidade e término da etapa, corpo/efeitos ausentes sob bloqueio, aprovação sem replay, pausa retomável, bootstrap sem pacotes instalados, equivalência dos parsers e regex, aliases válidos para TypeScript e atualização restrita da dependência.

Worktree próprio no SHA congelado, instalação física por `npm ci --ignore-scripts`, Node 22.23.2 e PostgreSQL 16 descartável próprio, em loopback, com `PHASE4A_PG_REQUIRED=1` e dados sintéticos. Nenhuma sonda foi inserida na coleta canônica. O checkout compartilhado não recebeu alterações de código nem do lockfile.

Um revisor independente examinou somente o kernel e produziu sondas externas. A leitura obrigatória dos ledgers exibiu incidentalmente o resumo do construtor; não se alega cegamento documental perfeito, e esse resumo não foi usado como evidência. O lead examinou CI/segurança, reexecutou os 12 cenários anteriores com asserções restauradas para o comportamento correto, reproduziu separadamente os cinco casos dos dois achados abaixo e reexecutou o suplemento de viabilidade. Os controles negativos substituem em memória apenas os três arquivos do kernel por bytes de `git show d893ea9`; os demais imports permanecem idênticos. Isso distingue correção efetiva de asserções que simplesmente deixaram de cobrar o defeito.

## Achados

### AUD0600-F01 — P2 — indisponibilidade do log inteiro volta a apagar a negação

**Cenário:** single-pass, aprovação real aprovada, `begin` reserva a operação, guarda nega com marcador reconhecível, e o mesmo sink rejeita `tool/result` e `turn/end`. Essa indisponibilidade não exige concorrência nem dados externos.

`unrecordedBlock` compõe corretamente a negação na resposta do despacho. Em seguida, `Turn.#finish`, em `packages/harness/src/kernel/kernel-runtime.ts:655`, substitui essa resposta por `unrecorded.response` quando falha o registro `turn/end`.

**Resultado reproduzido pelo revisor e pelo lead:** `INSUFFICIENT_EVIDENCE`, resposta somente `Kernel log could not record the turn: closing outage.`, sem o marcador da negação. Corpo zero, efeitos zero, aprovação `FAILED`, uma tentativa de encerramento da chamada e uma de encerramento do turno. A segurança do efeito permanece preservada; perde-se o diagnóstico obrigatório de §11.3/§12.1. O caso estreito em que somente `tool/result` falha passa.

**Disposição:** F01 original confirmado nesse caso estreito; preservação geral da decisão com log indisponível permanece parcial. Compor a falha de encerramento com a resposta/decisão já acumulada, sem substituir sua causa. Adicionar regressão para falha conjunta de `tool/result` e `turn/end`, preservando as contagens e a liquidação da aprovação. Não basta repetir o teste em que o encerramento do turno ainda funciona.

### AUD0600-F02 — P2 — retomada termina antes do dispatcher e deixa a etapa aberta

**Cenários:** após `APPROVAL_REQUIRED`, aprovar e retomar a execução (a) com sinal já abortado ou (b) com a ferramenta retirada do catálogo. Repetir também após pausa no checkpoint de despacho, quando a mesma etapa está `RUNNING`.

O loop em `packages/harness/src/iterative-runtime.ts:683` retorna `CANCELLED` antes de chegar a `dispatchTool`; a validação em `:739` retorna `STATE_CONFLICT` se a ferramenta não está disponível. O fechamento introduzido em `iterative-dispatch.ts` não alcança esses caminhos. O checkpoint terminal é persistido em `iterative-runtime.ts:1437` sem encerrar a etapa pendente.

**Quatro casos reproduzidos pelo revisor e pelo lead:** checkpoint `CANCELLED` ou `STATE_CONFLICT`, mesma etapa/número ainda `WAITING` ou `RUNNING`, sem `errorCode` terminal; corpo zero e nenhum efeito. Em particular, o caso `RUNNING` já passou pelo checkpoint descrito em §12.3. São caminhos públicos de retomada, não manipulação manual de um checkpoint.

O suplemento do revisor, reexecutado pelo lead, confirma dois retornos anteriores a `stepOpen` dentro do próprio dispatcher: ferramenta disponível na validação e ausente no despacho (`iterative-dispatch.ts:338`), ou prazo esgotado durante `audit.append` de `orchestrator.decided` (`:351`). Ambos mantêm `RUNNING` com checkpoint terminal `STATE_CONFLICT`/`MAX_DURATION`, sem corpo, efeito ou nova chamada. Também ocorrem na base.

**Disposição:** F02 original de negação de política/aprovação com fechamento perdido passa; a ampliação anunciada para cancelamento/conflito não é integral. Encerrar a etapa aberta também nos retornos terminais anteriores ao pipeline, respeitando a identidade existente, com `cancelled`, `deadline` ou código correspondente. A recuperação deve distinguir ausência de efeito comprovada de efeito incerto; não se deve marcar genericamente toda etapa em voo como não executada. Preservar a exceção de pausa do operador e os checkpoints realmente retomáveis. Regressão deve cobrir os dois estados, os motivos e os dois retornos viáveis de despacho, com checkpoint/etapa coerentes e ausência de corpo/efeito nos casos comprovados.

## Correções confirmadas

| Entrega                                                                  | Resultado independente                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 após reserva, somente `tool/result` rejeitado                        | Motivo presente, corpo zero, aprovação `FAILED`, um encerramento. Controle negativo na base falha.                                                                                                                                                        |
| F02, negação em etapa `WAITING`/`RUNNING`, log saudável ou rejeitado     | Mesma etapa `FAILED`, `policy_denied`/`approval_denied`, checkpoint coerente. Handoff e política inválida também passam nos caminhos testados.                                                                                                            |
| Cancelamento/guarda disparados no despacho, depois de checkpoint/reserva | Fechamento com log saudável ou rejeitado passa; pausa saudável preserva retomada e orçamento. Isso não cobre o retorno anterior ao despacho de AUD0600-F02.                                                                                               |
| Bootstrap Verify                                                         | `ci-bar.mjs init` executado antes do install, sem `node_modules`, exit 0. O script da base, em pasta sem dependências, falha por `zod` ausente.                                                                                                           |
| Parsers de log                                                           | Corpos movidos sem mudança funcional, reexports preservados; três parsers comparados com a base em seis fixtures cada, PASS.                                                                                                                              |
| Lockfile e dependências                                                  | Única entrada JSON alterada: `node_modules/source-map-js`, 1.2.1 → 1.2.2; versão instalada 1.2.2; `npm audit --json` completo zero vulnerabilidades.                                                                                                      |
| CodeQL #17                                                               | Três aliases inválidos rejeitados; TypeScript confirma TS5061/5062/5066; script da base não os rejeita. Teste de captura literal `$&` incluído na suíte canônica.                                                                                         |
| CodeQL #1/#2/#4/#9                                                       | Quatro consumidores usam helper que percorre o sufixo de barras; configuração/defaults e controle SSRF preservados. Provas com até um milhão de barras. `ssrf.ts` byte-exato frente à base.                                                               |
| CodeQL #8                                                                | Normalização de whitespace e regex sem quantificadores sobrepostos; 300 mil entradas determinísticas e 234 variações de whitespace sem divergência frente à base. Entradas de até um milhão de espaços passam. Amostragem não equivale a prova exaustiva. |

## Verificação canônica

Suíte completa: 352 arquivos, 2.844 PASS ordinários + duas falhas esperadas do worker (`it.fails`, I6/I7), zero skips, exit 0, PostgreSQL obrigatório. O JSON do runner contabiliza 2.846 PASS porque inclui as duas falhas esperadas; elas não comprovam conformidade do worker. Typecheck, lint, formatação, links/higiene e auditoria completa de dependências passaram no candidato isolado. Suíte exclusiva de PostgreSQL: 35 arquivos, 288 PASS, zero skips, exit 0.

A revisão adversarial produziu 31 cenários principais (26 PASS/cinco FAIL) e dois suplementares (dois FAIL), agrupados nos dois P2 acima. Os 12 cenários históricos reexecutados pelo lead passaram. As falhas novas não são skips nem falhas esperadas incorporadas à suíte; permanecem evidência explícita do parecer. O runner do revisor captura falhas e retorna exit 0; o parecer usa as asserções e resultados individuais, não esse exit.

## CI remoto, governança e limite do aceite

Consulta somente leitura ao GitHub: `main` continua em `d893ea9`, sem proteção; nenhum run dos três commits locais foi encontrado. [Verify da base](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/37503284921) e [Security da base](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/37503284853) terminaram com falha. Esses resultados não qualificam o candidato novo nem invalidam as provas locais das causas corrigidas.

O GitHub ainda mostra 19 alertas high abertos (oito em código ativo e 11 em evidências) e um medium no produto. Os seis alertas ativos tratados pela entrega continuam vinculados ao SHA antigo; fechamento oficial depende de publicação e novo scan. Não foi executado CodeQL local. #6/#7, exclusão das evidências do scan e proteção do `main` continuam decisões pendentes; nenhum alerta foi dispensado.

A barra 0373 exige suas dez condições no mesmo SHA e imagem. Esta revisão não comprova composição de login (condição 4), scan da imagem (6), imagem sem shell/worker (7), restore real com cadeia (8), alerta de parada/fila (9), nem parte B e pausa operacional do kernel durável (1/10). As duas falhas esperadas do worker permanecem dívida declarada. Sem E2E, certify, imagem ou ensaio operacional nesta rodada; não se concede fechamento de sprint/release por esses testes locais.

Próxima ação do owner KERNEL-PLUGINS: tratar os dois P2 remanescentes e repetir os cinco casos junto às regressões existentes. As correções de bootstrap/dependência e os cenários originais podem ser reconhecidos dentro do escopo verificado, sem marcar o kernel integralmente concluído.
