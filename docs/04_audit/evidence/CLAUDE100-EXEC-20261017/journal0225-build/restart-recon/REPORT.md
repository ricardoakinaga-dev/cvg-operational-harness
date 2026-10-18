# Recon de retomada0225 — mapa estático, sem execução

**CURRENT** significa fonte atual observada como texto, não comportamento executado. **PROPOSED** identifica os dois procedimentos futuros. **UNKNOWN** identifica o que os oito inputs não sustentam. Nenhum teste, import de target, processo de aplicação, PG/Docker/rede/probe, instalação/build/gate, commit ou descendente foi executado. Nenhum código, fixture antiga, SPEC, detector, pin, claim ou ledger foi alterado. Não há DONE funcional nem autorização nova.

Foram congelados oito inputs, com snapshots `.source.txt`, hashes antes/depois idênticos e inventário completo. S01 é a cópia ajustada f26ccead; S02–S08 coincidem com os respectivos blobs do HEAD da candidata. As fontes atuais de fixture nativa em edição pelo Lead não foram usadas como autoridade. Resultados nativos relatados na delegação são contexto, não provas executadas por este scout.

## Fontes e pontos de entrada

| ID | Fonte | O que sustenta |
| --- | --- | --- |
| S01 | adjusted-spec-proposal.md | §4/5/7/9/11: domínio/opt-in, limites, confirmação, J08–J13; linhas88–177,281–320,378–383,436–467. |
| S02 | complete-tool-public-restart.test.ts | connect/store/journal134–141; wrappers224–307; registry/model308–404; factory405–439; restart528–665. |
| S03 | complete-tool-process-restart.test.ts | checkpoint artificial89–188; restart336–395; CAS424–493. É teste de store, sem runtime/model/body. |
| S04 | complete-tool-json-public-postgres.integration.ts | nome real localizado; fixtures128–222, observer452–477, registry/model/journal/factory521–674, classificações721–794. |
| S05 | complete-settlement-public-postgres.integration.ts | nome real localizado; leitura física426–490, interceptação CAS800–858, porta settle1027–1064, SP08/SP091586–1628. |
| S06 | fixtures/complete-process-support.ts | perfis/identidade17–49, caminhos56–112, recurso180–276, serviço/argv278–344, child489–574, inspect579–672, cleanup755–827. |
| S07 | createOperationalHarness.ts | opções33–61, composição80–151, seleção/run158–226, registry/journal227–264. |
| S08 | complete-bound-admission-postgres.integration.ts | role/grants262–315; authority414–433; store/CAS454–490; receipt antes do modelo519–571; journal/factory596–616; admissão651–815; controles910–1047. |

`source-inventory.json` associa cada ID ao caminho absoluto, snapshot, SHA-256 e comparação com HEAD. `map.json` contém quinze entradas com intervalos de linha e estado explícito.

## Composição e evidência de retomada

A porta pública é `createOperationalHarness({effectJournal, stepStore, capabilities, iterativeOrchestrator, modelGateway, toolResultContext:{version:1}, ...})`. S07 prepara o registry e o envolve em `createJournaledToolRegistry`; aceita capabilities **ou** tools, conserva fingerprint e delega o perfil iterativo. O factory não escolhe a versão física do journal.

**PROPOSED:** na fixture sintética nova, construir `PostgresOperationalEffectJournal(pool, {resultStorage:{version:1}, ...opçõesDoFenceNativo})` e passá-lo em `effectJournal`. No caso bound, passar o mesmo `claim.fence` ao journal e ao `PostgresExecutionStepStore`. Readiness do armazenamento antecede admissão/run. O opt-in não deve ser derivado de output, HTTP ou tag, nem ligado a host comum/published/0226. Essa é a composição prevista por S01/M02; a assinatura corrente de readiness/adapter ainda exige snapshot separado do Lead.

**J09 — checkpoint completo:** S02:269–307 chama o CAS nativo, exige `APPLIED` e observação `TOOL_RESULT` com `completion:COMPLETE`, salva checkpoint/CAS e estaciona após o marker `COMMITTED_FULL_TOOL_RESULT`. O parent observa, envia SIGKILL, espera exit/close e inicia reader com PID diferente e mesma identidade lógica. O hook é wrapper privado do teste; não há callback de crash de produção demonstrado.

**J10 — journal confirmado antes do checkpoint:** S02:224–267 delega `journal.confirm` e estaciona após seu retorno, antes da persistência do resultado no checkpoint. A condição antiga é exclusivamente writer + `json-null-value`, com phase `CONFIRMED_JOURNAL_BEFORE_RESULT_CHECKPOINT`. A futura fixture deve discriminar explicitamente os dois crashpoints para todos os casos exigidos. O título genérico do teste antigo não prova qual fase ocorreu. Esse retorno de confirm também não é a janela J08 póscommit/préack.

**Contagens e oráculos:** S02 persiste body/model em JSONL e requests/results/CAS/journal em trace por PID. Receipts e `budgetUsage` ficam no checkpoint PostgreSQL. O contador `measure` de S02 não grava um evento independente: preservar os registros de cada medição é parte proposta do novo perfil, não evidência existente. Await de gravações e marker comprova a ordem frente à morte do processo; não é promessa de fsync/power-loss.

Para os positivos pequenos, o oráculo proposto é corpo total1, um modelo anterior e um posterior ao resultado, dois admissionIds distintos SETTLED e uso real somado sem débito duplicado. O reader deve receber o mesmo output/tipo/bytes/SHA e operação do journal/checkpoint no frame real `request.messages[1].content`, sem resposta escondida em closure. S04:551–579 mostra resposta curta de SHA/bytes derivada do próprio frame, útil sem elevar512 tokens de saída. Não exigir igualdade entre o frame pré-tool e o pós-tool: comparar a observação entregue. V1 exige versão1/payload válido e `result` SQL NULL; a assertiva antiga de JSONB direto em `journal.result` não serve como oráculo físico do formato novo.

S03 salva checkpoint/receipt sintetizados diretamente; é referência para token `{checkpointId,digest}`, APPLIED/CONFLICT e save V2 recusado, sem substituir retomada pública. A disputa concorrente antiga não é requisito adicional desta recon sequencial.

**J11:** S04 diferencia capture COMPLETE recusado por orçamento do frame de `SUCCEEDED/UNAVAILABLE` sem output. Há controle ASCII32768 classificado `context-overflow`;32769/depth33/nós10001 seguem indisponibilidade. Não presumir que um output isolado32768 cabe no frame inteiro. A nova matriz deve separar output/contexto/checkpoint e confirmar journal íntegro antes de afirmar indisponibilidade e modelo seguinte0. NUL/22P05 nas fontes antigas é um controle histórico, não expectativa a editar. Journal1MiB, contexto32KiB/depth32/nós10000 e captura de todo ToolResult/checkpoint8MiB continuam fronteiras diferentes.

## Bound/fence e limite dos exemplos antigos

S08 fornece a sequência nativa: catalogar agent/version; `createWithSession`; `enqueue`; `claimNextFenced`; `prepareControlledPublishedAdmission`; store published `admit`/`claim` ACTIVE; `createHost`; `startPrepared`; `beginPhase`; usar o `claim.fence` produzido. O runtime/request/fingerprint precisa corresponder ao registry efetivamente registrado, não a IDs preenchidos à mão.

As rows testemunhadas incluem `operational_executions` RUNNING com attempt/lease_owner/lease_until e binding com request/capability/prepared digests, admission/prepared runtime, phase OPEN, ackfalse, outer attempt/worker/attempt-row e expires_at. S08 exige receipt RESERVED persistido por CAS antes da chamada ao modelo, comprovado em outra conexão service com backend PID distinto.

O provisionamento antigo usa LOGIN não super/bypass, NOINHERIT/sem createdb/createrole, memberships0 e nenhuma propriedade de schema/relation; concede schema USAGE, SELECT/INSERT/UPDATE no conjunto de tabelas, remove UPDATE da evidence e concede sequência USAGE/SELECT. O conjunto cobre catálogo/inbound/sessão/outbox/attempts, execuções e sua outbox/eventos/steps/checkpoints/journal, bindings/evidence, effect_journal e pause switch. São grants de uma fixture ampla: não certificam a ACL mínima0030. O novo recurso requer o principal dedicado/binding exato/schema do guard0030 e guards0029 preservados em AND, sob owner separado, sem ownership/DDL/memberships/bypass/super.

**Limite:** o positivo bound S08 usa registry vazio e RESPOND; demonstra admissão/checkpoint, não corpo/confirm de ferramenta. Sua alteração de attempt e ausência de fence são negativos úteis, mas não cobrem stale worker/outer, lease durante encode, pause/cancel, DML sem guard ou o formato1. S05 `before-cas`/`ack-loss` operam o CAS de receipt SETTLED, não a transação de confirmação do journal. Não transferir esses resultados como J08/J13.

## Perfil privado e gaps delimitados

S06 fixa task/BASE/containerName/database/admin-user/schema-prefix antigos, CWD físico, hashes de recurso/config, UID/mode, ausência de symlinks, Node/CLI/socket, targets/roles/argv finitos e inspeção real de ID/name/image. S02 acrescenta CID antigo e `pare224_runtime`. Portanto esses alvos não podem ser executados no recurso0225 nem copiados com checks removidos.

**PROPOSED:** um perfil privado separado, finito e equivalente, com CID completo real/name/image/endpoint conferidos pelo owner, task/root/CWD/arquivo e fonte/config conhecidos, campos exatos de conexão e ambientes próprios. Preservar limites de output/deadline, PID/sinal/close/join e retenção de causa principal; não ampliar detector/pins existentes nem aceitar roots/argv arbitrários. O CID e a qualificação desse perfil são UNKNOWN nesta recon.

Os oito inputs foram suficientes para os seams públicos. Permanecem UNKNOWN: **G01**, limites exatos de transação/lease e assinatura readiness atuais; **G02**, todos os predicados0029/0030, token e ACL mínima; **G03**, identidade/perfil de recurso novos; **G04**, execução da matriz completa. Próximas leituras delimitadas, pelo Lead, são adapter/readiness e fencing/SQL0029/0030 congelados. Não foi lido um nono input nem feita varredura adicional dessas fontes.

## Próximos dois procedimentos rejeitáveis — ambos NOT_RUN

**P01 — retomada pública:** após perfil/identidade/readiness selados, começar com NUL4096 e null nos dois crashpoints separados. Antes do kill, uma conexão independente confirma a fase durável; após SIGKILL/close, recriar runtime em PID novo e verificar journal/checkpoint/frame/CAS/receipts/usage/contagens. Rejeitar marker genérico, ausência de pré-condição durável, mesmo PID, corpo repetido, conteúdo alterado, débito duplicado ou trace parcial. Expandir para todas as fixtures J09/J10 e limites J11, incluindo pósconfirm/save falho, preservando modelo seguinte0 nos indisponíveis. Fontes S01/S02/S04/S07, map M01–M09/M14–M15.

**P02 — confirmação bound:** após fechar G01/G02, criar positivo toolful com autoridade/fence nativos e formato1; só então isolar rollback antes/depoisUPDATE/précommit, kill póscommit/préack e reread, confirm igual/idempotente versus diferente/conflito, e identidades/fences/lease/pause/cancel/deadline/DML J13. Rejeitar qualquer confirmação parcial, demotion do CONFIRMED, retry indevido, escrita/corpo fora do fence ou substituição por teste unbound/CAS de modelo. Distinguir diagnóstico terminal permitido sob lease válido de efeito novo. Fontes S01/S05/S08, map M10–M13/M15; G01/G02 permanecem pré-condições técnicas não demonstradas.

**Uma ação concreta:** Lead congelar as fontes G01/G02 e o descritor real do recurso para fechar o perfil P01 e seu primeiro par NUL/null em duas fases; este scout para aqui. Crítica independente de código permanece de outro ator fresco.
