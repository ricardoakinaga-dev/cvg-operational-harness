# 0280 — F18: autoridade privada e resultados monotônicos nos hooks internos

Estado: **PROPOSED_FOR_HUMAN_T3_REVIEW**. Atribuição GBrain10814, task `AUD0625-F18-PHASE1-CODEX-20261029`. Base fixa `d8a3e59244a5a29a07444254f1ab5682b43aab3e`, indicada pelo DF, mesmo que a branch de integração avance. Esta fase entrega Discovery, proposta T3 e testes RED; não autoriza BUILD corretivo.

## 1. Problema, contrato e superfície real

O [F18 da auditoria0625](../04_audit/0625_repository_score_audit_2026-10-28.md#f18--p2-extensão-interna-pode-relaxar-controle-ou-resultado) apontou estaticamente estado mutável e resultados relaxáveis. A evidência complementar desta fase confirma quatro caminhos executáveis no perfil interno, com efeitos exclusivamente em memória e identificadores sintéticos.

A [SPEC0181](0181_kernel_plugin_contract.md), invariantes I2–I5/I8–I10, e a [ADR011](../architecture/adrs/ADR-011-kernel-de-plugins-com-controles-obrigatorios.md) exigem que capacidades não relaxem controles, que a aprovação seja de uso único, que o resultado final seja imutável e que falhas de evidência não virem sucesso. A ordem controles→capacidades, isoladamente, não assegura essas propriedades.

A entrada usada é `createKernelRuntime`/`standardKernelPlugins`, com `StandardKernelOptions.plugins`. Tipos e símbolos do kernel são reexportados por `packages/harness/src/index.ts`; não se afirma que sejam inacessíveis por import. A fábrica canônica `createOperationalHarness` não oferece opção `plugins`. O recorte é a composição/extensão interna, não um bypass demonstrado por pedido de modelo, JSON ou pelo contrato suportado da fábrica canônica. Plugins JavaScript continuam código confiável do host; esta proposta protege o fluxo de autoridade do kernel, não cria um sandbox contra código arbitrário no mesmo processo.

## 2. CURRENT — comportamento confirmado

| ID     | Caminho interno                                                                                      | Observação causal na base                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| F18-R1 | `tool/pre-execute` de capability apaga `call.grant` depois do controle de aprovação                  | Aprovação solicitada/concedida, grant visto pelo hook; corpo executa1vez, reserva0 e confirmação0; turno COMPLETED |
| F18-R2 | `tool/post-execute` de capability devolve `succeeded` depois do controle receber erro de confirmação | Corpo1, reserva1, tentativa de confirmação1; hook recebe `confirm_failed`; turno vira COMPLETED                    |
| F18-R3 | `turn/end` de capability devolve COMPLETED depois de auditoria falhar                                | Auditoria tentada1vez; hook recebe INSUFFICIENT_EVIDENCE; turno/log final anunciam COMPLETED                       |
| F18-R4 | `turn/end` de capability devolve COMPLETED depois de política negar                                  | Corpo0, reserva0, efeitos0; hook recebe POLICY_DENIED; turno final anuncia COMPLETED                               |

Controles sem o hook relaxador: execução autorizada reserva/executa/confirma1vez; confirmação falha mantém TOOL_FAILURE/unknown_effect; auditoria falha mantém INSUFFICIENT_EVIDENCE; política negada mantém POLICY_DENIED/zero efeitos.

As origens são `types.ts` (`ToolCallState` e `HookMap`), `pipeline.ts` (`runGate`, `dispatch`, `postExecute`), `controls.ts` (`approvalsControl`/`auditControl`) e `kernel-runtime.ts` (`Turn.#finish`). `readonly` em TypeScript não torna o objeto profundamente imutável em runtime. O grant/estado de reserva compartilha o objeto entregue ao hook e o acumulador final aceita substituição posterior sem preservar fatos de controle.

## 3. TARGET PROPOSTO — decisões T3 submetidas

**D1 — separar autoridade de observação.** O kernel cria contexto privado por turno/chamada. Política já decidida, necessidade/grant de aprovação, reserva/handle de execução, concessão de sandbox, identidade executável, signal original, orçamento e fatos de início/settlement pertencem a esse contexto, não ao objeto que extensões recebem. Escritas de controles centrais usam portas privadas ligadas pelo kernel; `kind: control` de um plugin arbitrário não concede acesso a essas portas. Nenhum novo serviço público via `ctx.get` expõe o estado privilegiado.

Os hooks recebem projeção observacional explícita, destacada e imutável, com campos necessários de identificação/fase e fatos observáveis. Não recebem referências graváveis a `TurnState`, `ToolCallState`, requests de aprovação, handles de reserva, descritor executável, orçamento ou dados aninhados do chamador. Projeções não expõem funções de executor nem controller de cancelamento; o kernel fornece a autoridade original ao corpo. Não usar deep-freeze sobre objetos do usuário, serviços, sinais ou instâncias opacas. Um valor não representável na projeção deve ser omitido/representado como opaco, nunca devolvido por referência como fallback de clone.

**D2 — preservar fatos bloqueantes fora do acumulador de apresentação.** O kernel conserva decisões de controle, fato do efeito e confirmação/evidência em registros privados. Hooks podem negar/restringir, observar, acrescentar metadados permitidos ou redigir dados de apresentação; não podem produzir autoridade nem apagar recusa, cancelamento, deadline, confirmação incerta ou evidência ausente. O resultado é reconciliado com os fatos privados depois de cada extensão e antes do log final/retorno. Não há ranking numérico universal de stopReasons: preservar o motivo causal original e, quando faltar evidência, manter também o fato de bloqueio, como no padrão `unrecordedBlock`.

Um `KernelStop` não vira proceed; uma aprovação concedida não executa sem reserva válida; reserva existente não desaparece para suprimir complete/fail/uncertain/release. `confirm_failed` e incerteza de efeito não viram succeeded; auditoria falha não vira COMPLETED. Uma extensão não fabrica sucesso sem despacho real nem chama `next` várias vezes para executar o efeito mais de uma vez. Uma recusa antes do despacho mantém zero corpo/zero início; uma violação depois do efeito permanece falha explícita/uncertain, sem retry automático.

O journal conserva o fato físico original do efeito; falha posterior de confirmação/auditoria continua distinta desse fato. Não reescrever started/finished históricos para fingir que o efeito não ocorreu. Log e resposta final não podem divergir sobre a condição de controle preservada.

**D3 — compatibilidade da extensão interna.** Emendar a liberdade de substituição da SPEC0181§4: redigir a apresentação de um sucesso legítimo continua permitido, mas não mudar seus fatos de autoridade, contadores ou settlement. Transformações de entrada necessárias por controles confiáveis devem ocorrer por operação explícita antes da decisão aplicável; mudança em tenant/agente/tool/operationKey/payload depois da decisão exige recusa e nova chamada governada, não reaproveitamento do grant. Não estender plugins à fábrica pública nem introduzir novo contrato de instalação dinâmica. Composição interna que dependia de mutação privilegiada deixa de ser válida e precisa migração/revisão explícita.

**D4 — preservar contratos adjacentes.** Manter normalização I7 de throw síncrono/rejeição assíncrona, controle de pausa, signal, budgets, aprovação de uso único, journal e audit fail-closed. Não ampliar prazos, adicionar retries, alterar schema/migration/lockfile, mudar perfis de sandbox ou confundir esta proposta com X01, K08 ou promoção de release. A escolha de tornar tais fatos não relaxáveis é a mudança T3 que requer aprovação humana deste documento/hash antes de BUILD.

## 4. Contrato por fase proposto

| Fronteira                  | Extensão pode                                                                                            | Kernel deve preservar                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| before-step / before-model | Observar projeção e negar; controles credenciados ajustam dados por caminho explícito anterior à decisão | Identidade privada, signal/budget, recusa já obtida e request efetivamente logado                      |
| tool/pre-execute / guardas | Observar e negar/abster; informar restrição                                                              | Decisão policy, grant e vínculo exato de tenant/agente/tool/payload/operação                           |
| tool/execute               | Delegar uma vez ou interromper antes do efeito; observar desfecho                                        | Reserva anterior ao corpo, despacho real, sandbox/cancelamento originais, zero efeito quando bloqueado |
| tool/post-execute          | Observar ou restringir apresentação/desfecho                                                             | Reserva e settlement privados; incerteza/confirm_failed não relaxáveis, sem duplicar efeito            |
| turn/end                   | Redigir apresentação/telemetria ou acrescentar restrição                                                 | Audit fail-closed e motivo causal de bloqueio; resposta/log final coerentes, nunca COMPLETED fabricado |

Violação antes de efeito: falha fechada normalizada com identificação do hook, sem vazar payload/segredos; liberar/falhar reserva conforme contrato atual e prova de não início. Violação depois de efeito: preservar resultado físico e sinalizar evidência/settlement incerto; nenhum sucesso ou reexecução automática. Observador que lança mantém I7 e não derruba processo. Não substituir falha por tipo inválido, nem aceitar retorno com status/kind inconsistente.

## 5. Aceite executável após eventual BUILD

| ID    | Prova obrigatória                                                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F18-A | R1 GREEN sem inversão: tentativa de remover/substituir grant não permite efeito sem begin único; ausência de autoridade legítima mantém corpo0                                                                                  |
| F18-B | R2 GREEN: complete falha, post hook tenta succeeded, resultado segue TOOL_FAILURE/unknown_effect e complete não é repetido                                                                                                      |
| F18-C | R3 GREEN: audit falha, turn hook tenta COMPLETED; mantém INSUFFICIENT_EVIDENCE e fato de efeito original, sem retry                                                                                                             |
| F18-D | R4 GREEN: negação policy/guarda/pausa/aprovação não é desfeita por hook de fim; corpo0 e log coerente                                                                                                                           |
| F18-E | Tentativas de mutar grant, reserva, sandboxHandle, descritor, identidade/payload decidido, signal/budget ou projeção aninhada não mudam a autoridade usada; nenhuma mutação dos originais do chamador                           |
| F18-F | Sucesso legítimo e apresentação redigida preservam execução/settlement únicos; hook só observador não altera resposta; `next` duplicado e sucesso sem next são recusados                                                        |
| F18-G | I7 sync throw/async reject, cancelamento pré-despacho/em volta do corpo, log falho, confirmação/release/fail/uncertain e quiescência existente não regridem; single_pass/iterative/kernel compartilham os mesmos fatos privados |
| F18-H | Mutantes: reexpor cada campo privilegiado, ignorar latch de recusa, aceitar relaxamento de confirm_failed/audit, devolver original quando projeção falha e permitir next múltiplo devem morrer por assertivas causais           |

[Fonte do teste desta fase](../04_audit/evidence/AUD0625-F18-PHASE1-CODEX-20261029/test-source.ts.txt): quatro controles ordinários e quatro `it.fails` somente sobre oráculos de autoridade/monotonicidade. Execução/admissão/infraestrutura ficam em beforeAll fora da inversão; os contadores e entradas efetivamente vistos pelos hooks ficam no log. Removendo apenas `it.fails`, observam-se4RED de assertiva e4controles PASS, sem erro de setup/timeout. A primeira versão exigia fatos inseguros na preparação; essas exigências foram retiradas para permitir futura proteção fail-closed sem cristalizar o defeito como precondição.

## 6. Reconciliação, verificação e handoff

Claims I7/81C4 foram encontrados fechados/publicados; fontes privadas permanecem readonly. Aviso11451 aoDF/81C4/33E9 antecedeu esta fase. Nenhuma implementação de par ou HOW privado é adotado. O baseline fixa os bytes recebidos, não segue branch mutável e não substitui a revisão/integração conduzida pelo DF.

BUILD futuro somente após aprovação humana hash-bound, task/claim próprios e reconciliação dos writers de kernel/pipeline/controls/iterative-runtime. Implementar primeiro o recorte vertical grant→reserva→efeito→settlement→resposta, depois cobrir os demais hooks; não promover congelamento superficial ou ordem de listeners como fechamento. Rodar R1–R4, matriz E–H, conformance0181, regressões dos controles públicos pertinentes, tipos/lint e barra atual no candidato integrado. Evidência parcial não vale como certificação integral.

Rollout: composição com extensão incompatível recusa e conserva os fatos/logs anteriores. Recuo operacional deve desabilitar a extensão afetada; não reabrir mutação privilegiada ou relaxamento de falhas como fallback promovível. A mudança pode invalidar consumidores internos que tratavam hooks como writers irrestritos, motivo explícito da revisão T3. Sem migração de dados proposta. Imagem/destino/CI e produção têm gates independentes.

Próximo responsável: DF revisa a proposta e leva ao Ricardo com SHA; até lá, F18 permanece OPEN e a SPEC permanece PROPOSED_FOR_HUMAN_T3_REVIEW. Nenhuma correção runtime ou liberação de produção decorre desta fase.
