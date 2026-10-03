# Backlog do Assistente de Plantão

Data: 03/10/2026. Fonte canônica dos dez cartões PISO transferidos de [0370](../../../docs/03_build/0370_harness_product_isolation_backlog.md), por HISO-008. IDs, dependências, aceites e status foram preservados. As tarefas HISO permanecem no backlog do harness. Contratos [SPEC](spec.md) e procedimentos [operação local](operacao-local.md).

### PISO-001 — Ativar tarefas somente após confirmação humana

- Estado: `TODO`. Prioridade: P1. Dono: engenharia do consumidor. Risco/gate: T3 / G3. Dependências: HISO-004, HISO-008.
- WHAT/WHERE/HOW: corrigir `assistant`/`store`/comandos para manter organização como rascunho até confirmação exata do responsável. Lembretes não podem disparar de tarefa não confirmada; correções invalidam confirmação anterior.
- Aceite: P01 fechado; rascunho não ativa tarefa, confirmação válida ativa uma vez, duplicata não duplica efeito e correção exige nova confirmação. Preservar condições aprovadas dos comandos/D1–D4 e AP-009–AP-011.
- Evidência: regressões de confirmação/correção/replay e estados persistidos sintéticos. Encaminha F01.

### PISO-002 — Preservar fidelidade e identidade do paciente

- Estado: `TODO`. Prioridade: P1. Dono: engenharia do consumidor, com validação de requisitos pelo owner do produto. Risco/gate: T3 / G3. Dependências: HISO-004, HISO-008.
- WHAT/WHERE/HOW: validar associação dos valores à fonte e paciente, exigir seleção inequívoca em homônimos e impedir IDs não verificados de entrarem na memória confirmada. Substituir seleção ambígua do primeiro `.find` por vínculo explícito suportado no contrato.
- Aceite: P07/P08/P09 fechados; troca de valores entre pacientes é sinalizada mesmo com os mesmos números; dois nomes iguais não escolhem automaticamente um ID; rascunho não contamina memória confirmada. Mudança de schema de tarefa/ID tem migração e revisão próprias.
- Evidência: casos negativos/positivos com homônimos, números e memória sintéticos. Encaminha F06/F07.

### PISO-003 — Recuperar processamento e envio com estado durável

- Estado: `TODO`. Prioridade: P1. Dono: engenharia do consumidor. Risco/gate: T3 / G3. Dependências: HISO-004, HISO-008, PISO-004.
- WHAT/WHERE/HOW: separar recebido/processando/processado/falha recuperável/resposta entregue em `assistant`/`store`; retries limitados por mensagem e disponibilidade da fila. Falha de append não pode rejeitar permanentemente a cadeia global de processamento.
- Aceite: P02/P03/P11 fechados; falha transitória de transcrição/envio permite recuperação sem perder entrada e sem duplicar ativação. Resultado externo incerto usa idempotency key quando suportada ou estado explícito de revisão; não prometer exactly-once do provedor.
- Evidência: falhas injetadas, reinício, replay, fila recuperada e efeitos por ID. Encaminha F02/F08.

### PISO-004 — Recuperar journal truncado sem perder histórico válido

- Estado: `TODO`. Prioridade: P1. Dono: engenharia do consumidor. Risco/gate: T3 / G3. Dependências: HISO-004, HISO-008.
- WHAT/WHERE/HOW: especificar durabilidade e recuperação JSONL/media em `store`, incluindo escrita, sync, prefixo válido, registro incompleto final e relação entre evento/arquivo. Preservar D4 e cópia original antes de qualquer migração.
- Aceite: P04 fechado; cauda incompleta pode ser isolada com evidência e prefixo recuperado; corrupção no meio exige diagnóstico sem descarte silencioso. Reconstrução mantém tarefas/notas/confirmação/pausa. Teste de queda de processo não é prova de queda elétrica física.
- Evidência: fixtures de truncamento/corrupção, recuperação/restart e hashes de originais. Encaminha F03 e pré-requisito de restore.

### PISO-005 — Serializar disparos de lembretes

- Estado: `TODO`. Prioridade: P1. Dono: engenharia do consumidor. Risco/gate: T3 / G3. Dependências: PISO-001, PISO-003.
- WHAT/WHERE/HOW: tornar tick/reserva por tarefa-janelamento seguro contra chamadas simultâneas, persistindo tentativa/resultado com política para envio incerto. Evitar race read→send→append.
- Aceite: P05 fechado; dois ticks concorrentes não iniciam duas entregas da mesma janela. Preservar quatro repetições/intervalo aprovado, ACK e snooze; restart não zera contagem. Falha externa não gera loop ilimitado ou declaração enganosa de exactly-once.
- Evidência: relógio sintético, concorrência, queda/replay e efeitos por tarefa/janela. Encaminha F04.

### PISO-006 — Fazer pausa e saúde responderem a falhas de transporte

- Estado: `TODO`. Prioridade: P1. Dono: engenharia do consumidor. Risco/gate: T3 / G3. Dependências: PISO-003, PISO-005, HISO-011.
- WHAT/WHERE/HOW: limitar request/recepção de mídia/envio em `whatsapp`/`transcriber`; abortar recursos; tornar pausa administrável fora da fila bloqueada e revalidar pausa antes de cada efeito. Definir readiness, progresso de fila e shutdown limitado.
- Aceite: P06/P10 fechados; servidor pendurado não bloqueia pausa indefinidamente; pausa reconhecida impede o próximo efeito ainda não iniciado de tick em andamento. Health/readiness detectam ausência de progresso, sem reportar 200 saudável apenas por processo vivo. Entrada pendente não é apagada ao pausar.
- Evidência: servidor sintético lento/travado, mídia excessiva, pausa concorrente, restart e shutdown. Encaminha F05/F09; adapter de modelo segue HISO-011.

### PISO-007 — Comprovar hardening do artefato do consumidor

- Estado: `TODO`. Prioridade: P1. Dono: operação do consumidor, com revisão de segurança. Risco/gate: T3 / G3. Dependências: HISO-007, PISO-006.
- WHAT/WHERE/HOW: implementar candidato sem shell, usuário não root, filesystem read-only com volumes explícitos e filtro efetivo de egress na infraestrutura. Ajustar deploy/env e rotas autorizadas de WhatsApp/Whisper/modelo.
- Aceite: controles comprovados na imagem e rede reais; tentativa de destino não autorizado bloqueada pela infraestrutura, não apenas pela allowlist da aplicação. Segredos e dados fora do artefato; sem operação HIS/prontuário/consulta automática. Não usar teste de bundle como prova de isolamento de container.
- Evidência: build/image inspection e negativos de runtime/rede em ambiente sintético próprio. Encaminha F10 e barra 0368.

### PISO-008 — Comprovar backup, restore e recebimento de alerta

- Estado: `TODO`. Prioridade: P1. Dono: operação do consumidor. Risco/gate: T2 / G1 para provas; T3 se alterar contrato de segurança/estado. Dependências: PISO-004, PISO-006, PISO-007.
- WHAT/WHERE/HOW: procedimento de backup/restore do journal e mídia, em volumes sintéticos separados; induzir indisponibilidade/falha e verificar alerta num receptor sintético próprio. Não enviar mensagens a pessoas nesta tarefa.
- Aceite: restore reconstrói notas, pacientes, tarefas, confirmação, pausa e hashes de mídia; não depende de apagar o original. Alerta chega ao receptor de teste com motivo e identificação segura. Entrega ao responsável real e ensaio administrativo ficam no gate do piloto.
- Evidência: inventário/hashes antes/depois, restore/restart e receipt sintético. Encaminha F03/F05/F11; métricas prometidas sem execução não contam como prova.

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
