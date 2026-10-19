# SPEC0217 — testemunho de recon estático

Task P100-010 / PARE100-EXEC-20261014. Estado: CURRENT_SOURCE_INSPECTION, 15/10/2026. Este witness é do autor do desenho; **não é revisão independente** e não certifica execução.

## Proveniência e escrita

Worktree: `/tmp/cvg-pare100-exec-20261014-6az3hlay/worktree`. [Claim](claim.json) registrado antes da escrita. [recon.json](recon.json) contém HEAD, UTC da captura, caminhos, bytes, linhas, SHA-256 e snapshots inertes `.source.txt`. Baseline sujo em [baseline-status.txt](baseline-status.txt). A captura preserva diferenças de outras lanes; HEAD não define esses bytes.

Leitura da constituição/AGENTS e coordenação; estados/log/backlog compartilhados inspecionados pelas entradas vigentes, carteira0378 e fontes históricas citadas. Nenhuma atualização de ledger ou claim compartilhado nesta lane: a atribuição SPEC0217 já existe na coordenação e o usuário limita explicitamente a escrita aos dois paths. O Lead é dono da integração de continuidade.

## Trilha conectada observada

1. API `server.ts`, webhook: valida/verifica tenant e ingresso, `receiveInboundMessage`, `inbound.process`, correlação persistida, caminho durableInbound que não executa inline, envelope queued existente. Também lidos os caminhos distintos executeInboundRuntime e capability approval execute. Nenhum endpoint novo presumido.
2. Worker `main.ts`/`postgres-controlled.ts`: branches published-agent/default e kernel opt-in; load inbound/context, takeover, pin versão, history20, executePublishedAgent, completeInboundRuntime. O pool do options é consumido pelo branch kernel; o branch published não monta journal/steps PG. Callback published só faz push em array.
3. `execute-published-agent.ts` resolve versão e delega à fachada platform; wrapper completed não é tool succeeded. `test-lab.ts` prepara/policy/knowledge e projeta; `controlled-kernel-execution.ts` monta a factory real, planner/model adapter, ports locais e runtimeInput.
4. O planner guarda output/providerInvoked/names/planSealed/finalIssued/expectedStep/attempts em closures. `controlled-kernel-adapters.ts` guarda grants/settlement/ACKs em Map e mantém close síncrono antes de projeção/final awaits. Async pause não pode ser ligado diretamente: o contrato público permite Promise mas readPause atual a trata como inválida.
5. `plugin-execution-core.ts:188–216` aceita admit **síncrono booleano**, chama handler capturado no mesmo turno; a proposta mantém isso e acrescenta preparo assíncrono antes da callback. Passar Promise seria bypass. `prepareCapabilityCommand` hoje gera correlationId próprio; a proposta precisa passar raiz trusted no perfil durável e persistir a identidade de comando.
6. Runtime governado antigo `kernel-composition.ts`: createGovernedRuntimeComposition, PostgresEffectJournal0013/ApprovalAuthority0015. Runtime operacional público separado: operational-harness-worker.ts/execution-spine.ts; usa PostgreSQL/fences mas seu audit é bufferizado antes da factory e flush pós-terminal. Não confundir branches.
7. Portas neutras reais: RuntimeInput.executionId/signal/resume; ApprovalEngine/execution; EffectJournal público, ExecutionStepStore e OperationalExecutionStore. Não encontrado tipo RuntimeControlStore/ControlStore. ControlPlaneStore é a autoridade de configuração/versão, com adapter tenant-scoped existente.
8. `PostgresOperationalEffectJournal` é compatível com o port público e guarda result; `PostgresEffectJournal` antigo usa outcome/digest/expiry/reconcile e não é substituível por cast. DurableApprovalEngineAdapter traduz authority0015; a0214 usa authority0002 e get(id,tenant), não get(tenant,id).
9. Migrations0016/0018/0019 oferecem pai/fila/journal/checkpoint e RLS. FK do checkpoint exige pai0016. Step store dá UPSERT sem fence de lease atual. `cancel`0016 recusa CLAIMED/RUNNING; proposta preserva esse409 e não inventa cancel aceito durante execução.
10. Migration0028 de session events exige schema dedicado e proíbe tables legadas; runner operacional default termina em0027 e não a inclui. Não reutilizar0028 no schema inbound existente. Proposta0029 é NOVA e não modifica bytes/checksums anteriores.
11. `completeInboundRuntime` faz transação com lock de mensagem/sessão, handoff/outbound sintético, audits, trace e marker completed. Array vazio de tool audits é aceito pela validação atual; a proposta só o usa depois de exigir os receipts já persistidos/mirrored pelo adapter, para não duplicar os mesmos audits. Não modifica validação geral.
12. Restart atual: teste child operacional AFTER_CLAIM e teste de reconstituição do runtime governado antigo são referências de mecânica/oráculos. Não há evidência nessa lane de restart do planner0214 publicado; não executar esses testes e declarar durabilidade217 por analogia.

## Inferências e decisões, separadas de CURRENT

- PROPOSED: ingresso durável já existente + novo compositor published com admissão vinculada, reuso de0016/0019 e sidecars de snapshot/evidência. Isto é o menor cutover com continuidade útil escolhido; não é funcionalidade existente.
- PROPOSED: positivos S1→continuação em outro processo e S3→completion sem reexecução; janelas ambíguas falham com handoff. Snapshot de planner e checkpoint devem ser gravados juntos por wrapper real de saveCheckpoint, não por hook inventado no kernel.
- PROPOSED: gate T3 concreto depois de revisão técnica do Lead e crítica fresca. U1–U4 da0214 permanecem reconhecidos; não dispensam revisão0217.
- UNKNOWN: viabilidade executada, latência dos fences, garantias do novo SQL/triggers, provas K01–K12 e migração integral dos demais consumidores. Não são PASS nem decisões humanas concedidas.

## Limitações e verificação

Sem tools externas/web/provider, banco, testes de runtime, builds, instalação, code writes, manifests/lock, ledgers, root/ref writes, commit/push ou descendentes. Static reads incluíram tentativas de nomes de arquivos não existentes (`packages/harness-contracts`, `contracts/ports.ts`, `contracts/step.ts`, `harness/checkpoint.ts`, `operational-harness-composition.ts`); foram corrigidas para os paths reais antes do desenho. Não inferir exports/methods desses nomes tentados.

Inventário de hashes e relatório de integridade documental serão conferidos no handoff. Drift concorrente, se encontrado, fica registrado como drift; não sobrescrever fonte de outra lane nem reescrever evidência antiga. [Aceitação executável](acceptance-plan.md) permanece NOT_RUN e anterior ao user gate. O próximo dono é o Lead, para revisão técnica, congelamento da candidata, crítica independente e posterior revisão humana T3; não é ordem para implementar.
