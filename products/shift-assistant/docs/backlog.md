# Backlog do Assistente de Plantão

## Autoridade documental — 17/10/2026

Este arquivo continua sendo a única fonte de status dos dez cartões PISO. A
[correspondência AP–PISO–HISO](requisitos-ap.md) e os ponteiros do0370 não criam
outra fila. A reconciliação documental HISO-002/HISO-008 preserva todos os
conteúdos funcionais e estados abaixo; não aceita correções em candidatas
privadas, não encerra D2 e não qualifica o piloto. O recibo de BUILD local
das SPEC0179/0180 está em [spec.md](spec.md). Os registros abaixo conservam
seus escopos, datas e resultados originais.

> Fechamento R2 em 04/10/2026: correções de identidade, assertions e SIGKILL aceitas no scratch; 13 PV PASS, PV10 FAIL (falha permanente termina processed em vez de review_required). R2-D3 não satisfeita: nenhum products retrabalhado ou deleção promovido. PISO-001–004 IN_PROGRESS, PISO-005–010 TODO; D2 aberta/NO_MODEL. Os registros abaixo são histórico anterior ao fechamento atual. [Relatório](../../../docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/r2-actions/final-status.md).

> Rodada 2: R2-D2 autoriza P1–P5 em scratch; R2-D3 autoriza promoção local apenas com os gates e PV aprovados. D2 segue aberta/NO_MODEL. D009/D011 aguardam HISO-005 aceito. AP-011 tem [suporte documental de recibo](../../../docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/ap011-provider-delivery-receipt-r1.md), sem SLA ou provider qualificado; se nenhum provider satisfizer o recibo, exigir decisão separada do usuário. [Packet atual](../../../docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/r2-actions/t3-packet.md). Nenhum cartão encerrado nesta preparação.

## Decisão separada — revisão da D2 (organização por modelo)

Estado `OPEN / HUMAN_DECISION_REQUIRED`, decisão B3 de 03/10/2026. Manter `NO_MODEL`: notas clínicas recebem `policy_denied` antes de budget/provider, com zero chamadas. A revisão da D2 pertence ao responsável e não é approval da SPEC 0180 nem novo critério PISO. Organização clínica por modelo permanece fora enquanto a decisão estiver aberta; o impedimento se limita à parte clínica do D009, sem bloquear preparações e fatias independentes autorizadas. Não implementar grant/exceção ou mudar classificação para contornar a política. Os dez cartões originais abaixo preservam seus aceites.

BUILD local aprovado por hashes separados, [recibo](../../../docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/human-t3-approval.json). PISO-001–004 estão em implementação **somente no candidato privado**, sem promoção ao checkout ou aceite. Fundação PISO-004: 40 testes próprios PASS; fluxo legado 27 PASS/10 FAIL, com lacuna real de correção de drafts. [Preservação isolada](../../../docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/piso004-isolation.json); texto webhook→preview→confirmação→tarefa→restart: R1 REJECT por quatro defeitos; rework no candidato privado com 194 testes integrados PASS/zero skips e tipos/lint/build público PASS. Suíte completa PostgreSQL 2.837 PASS/340 arquivos/zero skips, PG dedicado 288 PASS e E2E 12 PASS/zero retries; a segunda/última revisão independente encerrou REJECT, com P1 de herança de ID apesar de fonte explícita, PV13 FAIL por assertions reduzidas e PV10 BLOCKED por falta de restart real do processamento. [Encaminhamento semanal](../../../docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/audit-actions/product-weekly-handoff.md); nenhum patch promovido ou cartão encerrado. Os 194 e 288 são subconjuntos do total, sem somá-los. Parse V2 puro restaurado; o caminho clínico positivo original do provider permanece BLOCKED por D2/NO_MODEL. Não confundir os 37 nomes preservados com prova desse caminho. HISO-005 permanece FAIL/encaminhamento semanal; estas fatias independentes não o encerram. Piloto, D2, provider real e produção continuam fora da autorização.

Data: 03/10/2026. Fonte canônica dos dez cartões PISO transferidos de [0370](../../../docs/03_build/0370_harness_product_isolation_backlog.md), por HISO-008. IDs, dependências, aceites e status foram preservados. As tarefas HISO permanecem no backlog do harness. Contratos [SPEC](spec.md) e procedimentos [operação local](operacao-local.md).

### PISO-001 — Ativar tarefas somente após confirmação humana

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: engenharia do consumidor. Risco/gate: T3 / G3. Dependências: HISO-004, HISO-008.
- WHAT/WHERE/HOW: corrigir `assistant`/`store`/comandos para manter organização como rascunho até confirmação exata do responsável. Lembretes não podem disparar de tarefa não confirmada; correções invalidam confirmação anterior.
- Aceite: P01 fechado; rascunho não ativa tarefa, confirmação válida ativa uma vez, duplicata não duplica efeito e correção exige nova confirmação. Preservar condições aprovadas dos comandos/D1–D4 e AP-009–AP-011.
- Evidência: regressões de confirmação/correção/replay e estados persistidos sintéticos. Encaminha F01.
- Progresso 20/10/2026 (AUD0621, [evidência](../../../docs/04_audit/evidence/AUD0621-PRODUCT-BUILD-20261020/promotion.json)): rascunho nunca abre tarefa nem lembrete; `ok` confirma só rascunho do próprio autor, numa linha do journal que ativa as pendências; com mais de um rascunho exige `ok nota <código>`; correção exige nova confirmação; journal legado projeta tarefa de nota não confirmada como rascunho (F08). Aberto: preview aceito pelo canal (outbox/recibo), token de revisão com hash, `legacy_review_required` de notas legadas confirmadas.

### PISO-002 — Preservar fidelidade e identidade do paciente

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: engenharia do consumidor, com validação de requisitos pelo owner do produto. Risco/gate: T3 / G3. Dependências: HISO-004, HISO-008.
- WHAT/WHERE/HOW: validar associação dos valores à fonte e paciente, exigir seleção inequívoca em homônimos e impedir IDs não verificados de entrarem na memória confirmada. Substituir seleção ambígua do primeiro `.find` por vínculo explícito suportado no contrato.
- Aceite: P07/P08/P09 fechados; troca de valores entre pacientes é sinalizada mesmo com os mesmos números; dois nomes iguais não escolhem automaticamente um ID; rascunho não contamina memória confirmada. Mudança de schema de tarefa/ID tem migração e revisão próprias.
- Evidência: casos negativos/positivos com homônimos, números e memória sintéticos. Encaminha F06/F07.
- Progresso 20/10/2026 (AUD0621, [evidência](../../../docs/04_audit/evidence/AUD0621-PRODUCT-BUILD-20261020/promotion.json)): homônimos não recebem ID pela ordem da lista; ambiguidade bloqueia a confirmação; memória de pacientes só de notas confirmadas; leito divergente não completa ID só pelo nome (F09). Aberto: evidência por campo (SourceEvidence), que depende de D2.
- Progresso 29/10/2026 (AUD0625 F13 fatia 2, SPEC 0283, [evidência](../../../docs/04_audit/evidence/AUD0625-F13-BUILD-07-20261029/SLICE2-RESULT.md)): valores com unidade ou rótulo de medida são conferidos por paciente, campo e unidade contra a fonte (`VALUE_PATIENT_MISMATCH`, `VALUE_FIELD_MISMATCH`, `VALUE_UNIT_MISMATCH`, `UNSOURCED_VALUE`, `SOURCE_ASSOCIATION_AMBIGUOUS` bloqueiam a confirmação). Continua aberto: numeral por extenso (C2) e `SourceEvidence` com `quote` (C3), que dependem de D2.

### PISO-003 — Recuperar processamento e envio com estado durável

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: engenharia do consumidor. Risco/gate: T3 / G3. Dependências: HISO-004, HISO-008, PISO-004.
- WHAT/WHERE/HOW: separar recebido/processando/processado/falha recuperável/resposta entregue em `assistant`/`store`; retries limitados por mensagem e disponibilidade da fila. Falha de append não pode rejeitar permanentemente a cadeia global de processamento.
- Aceite: P02/P03/P11 fechados; falha transitória de transcrição/envio permite recuperação sem perder entrada e sem duplicar ativação. Resultado externo incerto usa idempotency key quando suportada ou estado explícito de revisão; não prometer exactly-once do provedor.
- Evidência: falhas injetadas, reinício, replay, fila recuperada e efeitos por ID. Encaminha F02/F08.
- Progresso 20/10/2026 (AUD0621, [evidência](../../../docs/04_audit/evidence/AUD0621-PRODUCT-BUILD-20261020/promotion.json)): falha transitória de download, Whisper ou organização deixa a mensagem pendente com tentativa e próximo horário persistidos (30 s, 2 min, 10 min, 30 min), sobrevive a restart e termina em nota bruta ou revisão humana; membro revogado vira revisão (F07, F10). Desvio deliberado da SPEC0179 §6, mais restrito: cinco tentativas por mensagem, somando os estágios, porque o contador por estágio permitia laço quando a falha alternava de estágio. Aberto: outbox durável de respostas e recibos, transcrição persistida antes da organização, envelope inline do Evolution.
- Progresso 29/10/2026 (AUD0625 F13 fatia 1, SPEC 0283, [evidência](../../../docs/04_audit/evidence/AUD0625-F13-BUILD-07-20261029/SLICE1-RESULT.md)): recibo por parte do preview (`preview_presented`), confirmação só com preview inteiro aceito, token `<nota>-r<revisão>-<hash>`, reapresentação limitada e preview cortado não confirmável. Continua aberto: outbox durável das demais respostas.

### PISO-004 — Recuperar journal truncado sem perder histórico válido

- Estado: `IN_PROGRESS`. Prioridade: P1. Dono: engenharia do consumidor. Risco/gate: T3 / G3. Dependências: HISO-004, HISO-008.
- WHAT/WHERE/HOW: especificar durabilidade e recuperação JSONL/media em `store`, incluindo escrita, sync, prefixo válido, registro incompleto final e relação entre evento/arquivo. Preservar D4 e cópia original antes de qualquer migração.
- Aceite: P04 fechado; cauda incompleta pode ser isolada com evidência e prefixo recuperado; corrupção no meio exige diagnóstico sem descarte silencioso. Reconstrução mantém tarefas/notas/confirmação/pausa. Teste de queda de processo não é prova de queda elétrica física.
- Evidência: fixtures de truncamento/corrupção, recuperação/restart e hashes de originais. Encaminha F03 e pré-requisito de restore.
- Progresso 20/10/2026 (AUD0621, [evidência](../../../docs/04_audit/evidence/AUD0621-PRODUCT-BUILD-20261020/promotion.json)): última linha sem LF isolada com cópia verificada, segmento selado sem truncar e sucessor em `journal.json`; linha inválida no meio, evento desconhecido ou prefixo divergente falham fechado; commits com fsync e transação numa linha (F18). Aberto: formato V2 com seq/hash, lock de escritor único, protocolo de mídia com sidecar, migração.

### PISO-005 — Serializar disparos de lembretes

- Estado: `TODO`. Prioridade: P1. Dono: engenharia do consumidor. Risco/gate: T3 / G3. Dependências: PISO-001, PISO-003.
- WHAT/WHERE/HOW: tornar tick/reserva por tarefa-janelamento seguro contra chamadas simultâneas, persistindo tentativa/resultado com política para envio incerto. Evitar race read→send→append.
- Aceite: P05 fechado; dois ticks concorrentes não iniciam duas entregas da mesma janela. Preservar quatro repetições/intervalo aprovado, ACK e snooze; restart não zera contagem. Falha externa não gera loop ilimitado ou declaração enganosa de exactly-once.
- Evidência: relógio sintético, concorrência, queda/replay e efeitos por tarefa/janela. Encaminha F04.
- Progresso 20/10/2026 (AUD0621, [evidência](../../../docs/04_audit/evidence/AUD0621-PRODUCT-BUILD-20261020/promotion.json)): um tick por vez, reserva durável antes do envio, revalidação de pausa, desligamento, journal, tarefa, nota e destinatário antes de cada envio; envio incerto bloqueia a janela até `adiar` ou `feito` (F10, F11). Aberto: recibo de entrega e AP-011, ferramenta humana de resolução de incerteza, tick de 1 a 5 s.

### PISO-006 — Fazer pausa e saúde responderem a falhas de transporte

- Estado: `TODO`. Prioridade: P1. Dono: engenharia do consumidor. Risco/gate: T3 / G3. Dependências: PISO-003, PISO-005, HISO-011.
- WHAT/WHERE/HOW: limitar request/recepção de mídia/envio em `whatsapp`/`transcriber`; abortar recursos; tornar pausa administrável fora da fila bloqueada e revalidar pausa antes de cada efeito. Definir readiness, progresso de fila e shutdown limitado.
- Aceite: P06/P10 fechados; servidor pendurado não bloqueia pausa indefinidamente; pausa reconhecida impede o próximo efeito ainda não iniciado de tick em andamento. Health/readiness detectam ausência de progresso, sem reportar 200 saudável apenas por processo vivo. Entrada pendente não é apagada ao pausar.
- Evidência: servidor sintético lento/travado, mídia excessiva, pausa concorrente, restart e shutdown. Encaminha F05/F09; adapter de modelo segue HISO-011.
- Progresso 20/10/2026 (AUD0621, [evidência](../../../docs/04_audit/evidence/AUD0621-PRODUCT-BUILD-20261020/promotion.json)): leituras com teto por chunk e prazo até o fim do corpo em WhatsApp e Whisper, base64 validado antes de decodificar, prazo de job, fila limitada com 503 `queue_full`, pausa do gestor fora da fila, `/health/live` e `/health/ready` com 503 por motivo, stop limitado (F21 produto). Aberto: limites do transporte de modelo e dos adapters compartilhados (HISO-011) e oracle de cancelamento de modelo, sem aplicação enquanto NO_MODEL valer.

### PISO-007 — Comprovar hardening do artefato do consumidor

- Estado: `TODO`. Prioridade: P1. Dono: operação do consumidor, com revisão de segurança. Risco/gate: T3 / G3. Dependências: HISO-007, PISO-006.
- WHAT/WHERE/HOW: implementar candidato sem shell, usuário não root, filesystem read-only com volumes explícitos e filtro efetivo de egress na infraestrutura. Ajustar deploy/env e rotas autorizadas de WhatsApp/Whisper/modelo.
- Aceite: controles comprovados na imagem e rede reais; tentativa de destino não autorizado bloqueada pela infraestrutura, não apenas pela allowlist da aplicação. Segredos e dados fora do artefato; sem operação HIS/prontuário/consulta automática. Não usar teste de bundle como prova de isolamento de container.
- Evidência: build/image inspection e negativos de runtime/rede em ambiente sintético próprio. Encaminha F10 e barra 0368.
- Progresso 20/10/2026 (AUD0621, [evidência](../../../docs/04_audit/evidence/AUD0621-PRODUCT-BUILD-20261020/promotion.json)): runtime `gcr.io/distroless/cc-debian12` fixado com Node 22.23.2, sem shell, gerenciador ou `node_modules`, usuário 10001, rootfs só leitura, `/data` 0700; compose com limites e rede interna sem porta publicada; exemplo nft default-deny; `image-contract.mjs` e `infra-egress-proof.mjs` com prova local PASS e controles FAIL (F25). Aberto: filtro aplicado no host de produção com contadores, build pela receita completa no CI, SBOM do artefato.
- Progresso 21/10/2026 (AUD0621-PRODUCT-PISO008, [evidência](../../../docs/04_audit/evidence/AUD0621-PRODUCT-PISO008-20261021/promotion.json)): imagem reconstruída da base integrada; `image-contract.mjs` PASS com o SHA do programa igual ao do bundle; `infra-egress-proof.mjs` PASS, `docker stop` limitado com exit 0 e controles FAIL. Continua aberto: nft com contadores no host de produção, build pela receita completa no CI e SBOM do artefato.

### PISO-008 — Comprovar backup, restore e recebimento de alerta

- Estado: `TODO`. Prioridade: P1. Dono: operação do consumidor. Risco/gate: T2 / G1 para provas; T3 se alterar contrato de segurança/estado. Dependências: PISO-004, PISO-006, PISO-007.
- WHAT/WHERE/HOW: procedimento de backup/restore do journal e mídia, em volumes sintéticos separados; induzir indisponibilidade/falha e verificar alerta num receptor sintético próprio. Não enviar mensagens a pessoas nesta tarefa.
- Aceite: restore reconstrói notas, pacientes, tarefas, confirmação, pausa e hashes de mídia; não depende de apagar o original. Alerta chega ao receptor de teste com motivo e identificação segura. Entrega ao responsável real e ensaio administrativo ficam no gate do piloto.
- Evidência: inventário/hashes antes/depois, restore/restart e receipt sintético. Encaminha F03/F05/F11; métricas prometidas sem execução não contam como prova.
- Progresso 21/10/2026 (AUD0621-PRODUCT-PISO008, [evidência](../../../docs/04_audit/evidence/AUD0621-PRODUCT-PISO008-20261021/promotion.json)), prova local sobre o journal V1 com crítico R3 APPROVE: backup com escritor parado, inventário com caminho relativo, bytes e SHA-256 e `backup_verified` só depois de conferir cada hash, sem remover nada; restore que recusa caminho absoluto, `..`, symlink, conjunto diferente e hash divergente antes de escrever, em destino novo e vazio, com projeção comparada sob hold; sandbox que confirma rascunho por identidade e nunca roda na origem nem no restaurado; monitor externo (`src/monitor.ts`, `scripts/shift-monitor.mjs`, `deploy/monitor.example.yaml`, `docs/operations.md`) com sonda de 10 s e timeout de 2 s, duas falhas para disparar e duas boas para resolver, um alertId por episódio e fila durável com cinco tentativas; prova com processos separados 38/38 e 14 recibos com o hash dos alertas; stop do produto com processo real em menos de 10 s. Continua aberto: monitor em outra máquina, receptor real com responsável, parada física do host, lock de escritor único e journal V2 (PISO-004), outbox com recibo do provider (PISO-003) e os opcionais do R3 listados na evidência.

### PISO-009 — Preparar guia e homologação do produto

- Estado: `TODO`. Prioridade: P2. Dono: owner do produto, apoiado por engenharia/operação do consumidor. Risco/gate: T1 para docs, T2 para testes locais sintéticos; integração externa/uso real depende do gate específico. Dependências: HISO-008, PISO-001, PISO-002, PISO-008.
- WHAT/WHERE/HOW: guia de uma página de comandos/limites/pausa/apoio, vinte casos estruturados e dez áudios sintéticos de até 60s com jargão pertinente, transcritos no Whisper local. Consolidar qualificação do canal/provedores e checklist administrativo de AP-008/AP-015/AP-016.
- Aceite: resultados por caso/áudio e pendências humanas explícitas; guia lido pelos dois plantonistas do piloto conforme AP-015. Responsável valida contato de suporte e requisitos de privacidade/canal. Agente não assina DPA nem simula validação administrativa. Preservar D1–D4, inclusive retenção aprovada; não inventar expiração/deleção automática.
- Evidência: guia, fixtures/resultados e checklist com dono/data; aprovação humana ainda ausente permanece pendente. Encaminha F11/F13.

- Preparação03/10/2026 (T1, sem antecipar BUILD T3): [20casos e10áudios sintéticos](homologacao-corpus.md) criados com manifesto/hashes, campos esperados e contraexemplos. Integridade de fonte/schema/PCM verificada; consumidor/Whisper/revisão humana NOT_RUN. Tarefa permanece TODO pelas dependências e aceites completos.

### PISO-010 — Decidir e acompanhar o piloto específico do consumidor

- Estado: `TODO`. Prioridade: P2. Dono: owner do produto e responsável pelo piloto. Risco/gate: T4 / G4; decisão humana antes de qualquer uso real. Dependências: HISO-014, PISO-001, PISO-002, PISO-003, PISO-004, PISO-005, PISO-006, PISO-007, PISO-008, PISO-009.
- WHAT/WHERE/HOW: apresentar candidato/hash e evidências da barra 0368 no escopo interno aprovado; só após decisão específica realizar piloto de duas semanas com dois plantonistas, com métricas por turno de completude, qualidade dos lembretes e necessidade de intervenção.
- Aceite: critérios técnicos e administrativos aplicáveis comprovados; HIS da fase futura corretamente N/A, não fingido como integrado. Decisão continuar/ajustar/parar registrada pelo responsável, com canal de pausa/suporte. Sem consulta real automática, ação clínica/financeira/prontuário definitivo ou produção irrestrita.
- Evidência: pacote de decisão e, se autorizado, registro de acompanhamento/resultados por turno. Encaminha F11/AP-016. Aprovações D1–D4 existentes não são solicitadas novamente; não substituem aprovação do candidato/piloto.

## NEXT-D2 — PV10 em cópia isolada — 04/10/2026

O usuário autorizou um ciclo local e uma revisão nova, mantendo NO_MODEL inclusive para dados sintéticos. O Builder congelou a correção dos estados terminais de falha, tentativas duráveis e registro bruto sem inferência, com 290 testes em nove arquivos passados. A revisão independente integral PV01–PV14 terminou INVALID por escrita de cache de dependências fora da área autorizada; os 14 comportamentos foram observados PASS, sem aceite formal. Resultado e provas no [handoff NEXT](../../../docs/08_runtime/handoffs/harness_isolation_next_execution_20261004.md). Esta nota registra implementação privada, sem aceitar PISO-003 ou promover fonte.

A promoção R2-D3 permanece condicionada aos aceites e à suíte completa, PostgreSQL, E2E e regressão neutra, além de preservar a baseline. Na mesma rodada, C1 foi rejeitado tecnicamente, o E2E terminou com uma falha, e quatro arquivos alheios com 23 testes exigem coordenação de autoria. Nenhum cartão adicional foi encerrado e nenhum piloto foi autorizado.
