# 0010 — Casos de Uso

## UC-01 — Receber mensagem e criar sessao

- Ator: tutor.
- Objetivo: iniciar atendimento rastreavel.
- Gatilho: chegada de mensagem por canal conectado.
- Fluxo principal: adapter recebe mensagem, agent runtime cria ou retoma conversa, session manager cria sessao, mensagem e registrada.
- Excecoes: canal indisponivel, mensagem duplicada, contato sem telefone valido.
- Resultado esperado: conversa e sessao registradas com correlation id.

## UC-02 — Identificar intencao

- Ator: Esmeralda V2.
- Objetivo: classificar o tipo de demanda.
- Gatilho: nova mensagem em sessao ativa.
- Fluxo principal: runtime envia contexto ao workflow, workflow classifica intencao, registra decisao e proximo passo.
- Excecoes: mensagem ambigua, baixa confianca, conteudo sensivel.
- Resultado esperado: intencao classificada ou handoff solicitado.

## UC-03 — Identificar tutor e pet

- Ator: Esmeralda V2 e recepcao quando necessario.
- Objetivo: vincular atendimento a contato e paciente.
- Gatilho: intencao exige dados de tutor ou pet.
- Fluxo principal: tool busca tutor por telefone, busca paciente, cria drafts se nao encontrar, coleta dados faltantes.
- Excecoes: multiplos tutores, multiplos pets, dados conflitantes.
- Resultado esperado: contato e paciente identificados ou draft criado.

## UC-04 — Rodar triagem inicial

- Ator: Triage Agent.
- Objetivo: classificar urgencia operacional sem diagnosticar.
- Gatilho: tutor descreve sintoma, urgencia ou necessidade de atendimento.
- Fluxo principal: agente coleta sinais basicos, aplica classificacao operacional, orienta emergencia quando necessario e registra safety event.
- Excecoes: risco alto, informacao insuficiente, pedido de diagnostico ou prescricao.
- Resultado esperado: risco operacional classificado e proximo passo seguro definido.

## UC-05 — Sugerir agendamento

- Ator: Scheduling Agent.
- Objetivo: sugerir horario ou criar draft de consulta.
- Gatilho: intencao de agendamento.
- Fluxo principal: agente coleta dados, consulta slots disponiveis, sugere alternativas e cria appointment draft.
- Excecoes: agenda indisponivel, regra de confirmacao ausente, procedimento sensivel.
- Resultado esperado: sugestao registrada ou approval request criado.

## UC-06 — Solicitar aprovacao humana

- Ator: Esmeralda V2 e operador humano.
- Objetivo: impedir execucao sensivel sem validacao.
- Gatilho: acao exige permissao, regra incompleta ou risco alto.
- Fluxo principal: runtime cria approval request com resumo, evidencias e acao proposta; humano aprova, rejeita ou assume.
- Excecoes: timeout de aprovacao, operador indisponivel.
- Resultado esperado: decisao humana auditada.

## UC-07 — Criar resumo de handoff

- Ator: Handoff Agent.
- Objetivo: transferir contexto de forma clara.
- Gatilho: escalonamento humano ou risco fora do escopo da agente.
- Fluxo principal: agente resume tutor, pet, intencao, dados coletados, risco, tools usadas, pendencias e recomendacao de proximo passo.
- Excecoes: conversa muito longa, dados conflitantes.
- Resultado esperado: handoff summary registrado e entregue ao humano.

## UC-08 — Criar tarefa interna

- Ator: Task Agent.
- Objetivo: converter pendencia em tarefa rastreavel.
- Gatilho: necessidade de retorno, follow-up, confirmacao ou acao interna.
- Fluxo principal: agente cria task com titulo, contexto, prioridade, responsavel sugerido e prazo quando houver.
- Excecoes: prioridade indefinida, responsavel nao definido.
- Resultado esperado: tarefa registrada e vinculada a sessao.

## UC-09 — Responder duvida institucional

- Ator: Reception Agent.
- Objetivo: responder perguntas simples com seguranca.
- Gatilho: pergunta sobre horario, localizacao, orientacoes administrativas ou informacao institucional.
- Fluxo principal: agente consulta base institucional quando disponivel, responde com informacao autorizada e registra fonte.
- Excecoes: conteudo nao encontrado, duvida medica, risco de informacao desatualizada.
- Resultado esperado: resposta segura ou handoff.
