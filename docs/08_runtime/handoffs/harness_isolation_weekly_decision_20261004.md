# Sessão de decisão — isolamento do harness — 04/10/2026

Estado: `WAITING_HUMAN_APPROVAL / GLOBAL_FAIL / NOT_PROMOTED`. Pedido de continuidade recebido: “siga para os proximos passos”. Preparação T1 executada; novo orçamento de BUILD/revisão ainda não concedido. O próximo passo recuperado da rodada anterior é esta sessão de decisão, sem esperar uma data de calendário para preparar o trabalho.

## Decisão necessária e autoridade anterior

O [handoff R2, respostas do usuário](harness_isolation_audit_actions_r2_20261003.md) limita R2-D1 a um ciclo com uma revisão posterior e R2-D2 a “Sem rodada além dessa”. O ciclo terminou reprovado, conforme o [encerramento R2](harness_isolation_r2_execution_20261004.md). Este pacote propõe uma concessão nova e limitada; não registra uma concessão presumida a partir do pedido de continuidade.

| Decisão proposta | Escopo de execução                                                                                                                                            | Orçamento e condição de parada                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| NEXT-D1          | Corrigir C1 em scratch, propagando ou recusando bindings aninhados de capacidades Node/global e mantendo resolução física de runtime/tipos.                   | Um ciclo de implementação e uma crítica nova de contexto fresco. Nova falha encerra o ciclo; sem revisão adicional automática.         |
| NEXT-D2          | Corrigir PV10 em scratch para persistir `review_required` e erro em falhas permanentes/retries esgotados, sem romper o registro bruto permitido por NO_MODEL. | Um ciclo de implementação e uma crítica nova de PV01–PV14, sem acesso a ledgers, coordenação ou histórico. Nova falha encerra o ciclo. |

As decisões podem ser concedidas juntas ou separadas. A aprovação dos corpos das SPECs 0179 e 0180 já existe e não é solicitada novamente. A proposta restaura contratos aprovados, sem criar schema, provider ou exceção clínica. Se a implementação exigir mudança material de contrato, parar a frente e preparar a emenda correspondente antes de BUILD.

R2-D3 permanece a autorização de promoção **condicionada**, sem dispensa de nenhuma condição. Só avaliar promoção depois de P1–P4 aceitos, baseline completa, Node 22/PostgreSQL/E2E/regressão neutra verdes e ownership resolvido. Não promover um candidato rejeitado, nem commitar trabalho alheio. A concessão de NEXT-D1/NEXT-D2 não significa que essas condições já passaram.

## Recon e plano técnico curto — C1, T2

Fonte congelada: candidato privado R2. Caminhos de implementação propostos: `scripts/check-product-boundary.mjs` e `tests/product-boundary.test.js` na cópia nova, mais fixtures próprias. Não editar o checkout compartilhado antes do aceite e da integração autorizada.

O fixed point atual vincula identificadores simples e somente o primeiro nível de `ObjectBindingPattern`. Em `const {process:{getBuiltinModule:get}}=globalThis`, o binding interno fica sem capability e não recebe recusa conservadora. A mesma classe perde `mainModule`, inclusive quando o receptor é preservado por método ou `bind(host)`. A visita de dependência física sozinha não resolve essa perda de binding.

Hipótese de correção: percorrer recursivamente a árvore de binding, compondo o acesso ao objeto de origem e alimentando os mesmos classificadores de capabilities. Propriedade computada indeterminada, rest, default ou escape cuja semântica não seja demonstrada deve gerar diagnóstico `INCOMPLETE`, não verde. `mainModule` com anchor desconhecido continua exigindo recusa. Distinguir propagação estática demonstrada de recusa conservadora; preservar positivos e concordância API/CLI.

Aceite obrigatório: recusar os 14 falsos PASS históricos **e os 11 negativos válidos encontrados em R2**; preservar os controles positivos e as asserções existentes; cobrir nomes aliases, múltiplos níveis, CommonJS/ESM, destino não literal, receptor/bind e dependência física em `node_modules`. Os quatro pilots sem receptor são inconclusivos e não podem contar como bypass ou aceite. Rodar testes canônicos e scan instalado; se o scan for `INCOMPLETE`, não o renomear para PASS nem declarar HISO-005 DONE. Crítico deve receber um inventário explícito dos 14 históricos, candidato hash-bound e critérios, sem racional do Builder ou parecer anterior.

## Recon e plano técnico curto — PV10, contrato T3 já aprovado

Fonte: produto privado R2 de 92 arquivos congelados. Caminhos propostos: `products/shift-assistant/src/assistant.ts` e testes de confiabilidade/restart no scratch. Outros arquivos só entram se a investigação mostrar necessidade concreta, com claim antes da alteração; não abrir refatoração de schema/journal.

Falhas permanentes `invalid_request`, `schema_invalid` e limite de resposta entram hoje em `#draft`; retries esgotados fazem o mesmo. O evento de rascunho chama `finish()`, que grava `processed` e remove o erro. Reabrir o journal conserva esse resultado incorreto. O evento existente `processing_retry_scheduled` já suporta `review_required`, erro e orçamento duráveis; usar essa transição para falhas finais, em vez de representar um processamento bem-sucedido.

O organizador padrão nega CLINICAL por NO_MODEL. O caminho explícito de registro bruto precisa continuar permitido, sem tarefas derivadas ou chamada de modelo. Não transformar qualquer erro `policy_denied` em êxito bruto silencioso: distinguir a intenção de operar sem modelo de falhas de organização. A correção deve obedecer simultaneamente à [SPEC 0179](../../02_spec/0179_shift_consumer_reliability.md), confirmação da fonte bruta (§3) e revisão em falhas (§6), sem relaxar nenhum dos dois contratos.

Aceite: HTTP com ack de admissão correto; fonte/erro/attempt/stage/draftAt e estado de revisão preservados no reopen; zero tarefas derivadas em falha; falha permanente sem retry automático; transiente com teto de cinco tentativas e backoff persistido; replay sem reprocessamento terminal; SIGKILL real nas tentativas 2 e 5; substituição conserva tarefas suspensas e histórico. Exercitar o bundle público com NO_MODEL e modelo fictício de respostas estáticas apenas nos seams admitidos. As 37 situações originais e 40 testes da fundação permanecem; reavaliar todas as 14 PV e as disposições de asserções originais.

## Baseline e coordenação antes de promoção

Os quatro testes alheios, total histórico de 23 casos, continuam presentes no checkout compartilhado e ausentes do candidato de integração R2. A preparação **não** copiou ou commitou essas fontes. Owners registrados: UP91-004-R2/R3 e AUD-0588/AUD-0589, todos Codex; isso não comprova exclusividade sobre o diff atual. O owner precisa liberar/commitar seus caminhos ou registrar handoff de ownership antes da integração. Preservar cada identidade/hash; uma contagem maior não substitui os testes desaparecidos.

Ledgers 99/20/30 continuam dirty, com 130 inserções e 11 deleções. Owner identificável: Codex/AP-LOCAL-20261001; atividade atual não confirmada. A regra 5 de [coordenação](../agent_coordination.md) impede editar os diffs alheios. [Rechecagem e hashes](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/next-steps-20261004/coordination-recheck.json) e [entradas prontas para integração](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/next-steps-20261004/ledger-entries.md) preservam a continuidade sem alegar atualização desses ledgers.

## Verificação desta preparação

Reexecução I0 de controles existentes: três fixtures C1 voltaram a dar checker PASS/exit 0 enquanto Node 22 executou o marcador sintético do produto. PV10 por HTTP voltou a persistir `processed`, inclusive no reopen; uma chamada de organizador fictício, zero tarefas; assertion esperada falhou com exit 1. Sem nova crítica, fix ou reexecução da suíte completa. [Comandos, hashes e sentinels](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/next-steps-20261004/recovery-replays.json).

A primeira projeção mínima do reprodutor PV10 não carregou os mappings/workspaces necessários. Essa falha de preparação foi preservada; o replay decisivo só conta após adicionar as dependências existentes como referências de leitura. Candidatos anteriores e corpos hash-bound das SPECs permaneceram intactos. `.agent/state.json` ainda aponta para AUD0592 histórico/bloqueado; não foi reescrito nem tratado como autoridade para o novo BUILD.

## Limites preservados

24 critérios originais mantidos, apenas HISO-001 DONE. NO_MODEL clínico inclui sintéticos; D2 aberta. Nenhuma concessão para push, provider real, dados reais, piloto, release, produção, testes clínicos humanos ou lockfile de dependências. Portas 3400/3401 e recursos de outros agentes preservados. Evidência bruta fora do Git, commits locais somente por caminhos próprios. Próxima ação única: registrar a resposta explícita a NEXT-D1/NEXT-D2; executar somente a frente concedida.
