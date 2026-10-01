# CVG — Direção dos programas e plano do Operational Harness

Data: 30/09/2026 · Autor: Ricardo Akinaga (com Claude Code)

> **Fonte da verdade** para direcionar a construção dos programas da CVG. Versão viva e editável: [documento online](https://claude.ai/code/artifact/dad8a1f0-8303-47cb-93d1-62e21b6966e2). Auditoria que originou esta decisão: [auditoria do harness](https://claude.ai/code/artifact/0caa6c4b-425a-4849-b4e1-9db511fb3f46). Em caso de divergência entre esta cópia e o documento online, o Ricardo decide qual prevalece e atualiza a outra.

## Decisão central

**O CVG Operational Harness deixa de ser uma plataforma genérica de agentes e passa a ser o Assistente de Plantão da CVG: um assistente no WhatsApp que recebe o que a equipe consegue mandar no meio do plantão (áudio, foto, texto), devolve tudo organizado, lembra, cobra e acompanha cada pendência até ela aparecer registrada no HIS.** Ele não escreve no HIS e, por construção, não tem poder para estragar sistema ou servidor.

Este documento é a fonte da verdade para direcionar todos os programas da CVG. Em caso de conflito com planos, backlogs ou roadmaps anteriores, vale este documento.

**O que muda, em resumo:**

- **cvg-his-v4** é o sistema principal e a fonte da verdade de todo dado clínico, operacional e financeiro. Segue com a equipe atual rumo ao release.
- **cvg-operational-harness** muda de missão: vira o Assistente de Plantão e a torre de pendências. O plano de 13 gates e as frentes abertas são encerrados.
- **cvg-diagnostic-hub-v2** e **cvg-corp** deixam de crescer como produtos separados. O que tiverem de útil serve de referência para o HIS e, depois, de fonte de eventos para o assistente.
- **DeskcommCRM / secretária** é o atendimento ao tutor e entra depois, como mais uma porta de entrada de pendências.
- **cvg-trainee-vet** segue como produto separado de educação, em ritmo próprio.

**A aposta que precisa ser provada primeiro:** os plantonistas usam um assistente no WhatsApp para registrar e acompanhar o plantão. Se em duas semanas de piloto eles não usarem, paramos antes de construir o resto.

## Como chegamos aqui

A conversa começou como uma auditoria técnica do harness e terminou na dor real do hospital. Cada etapa corrigiu a anterior.

| Etapa                        | O que se pensava                                                | O que ficou claro                                                                                                                                                                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Auditoria do harness      | Medir a qualidade do repositório                                | Nota geral 53/100 e prontidão 20/100. Código bom e bem testado (2.305 testes passando), mas 220 de 312 commits são documentação e o programa estava travado em aprovações e certificações. [Auditoria completa](https://claude.ai/code/artifact/0caa6c4b-425a-4849-b4e1-9db511fb3f46). |
| 2. “O que ele vai resolver?” | Plataforma neutra para vários produtos                          | Sozinho, não resolve problema de negócio nenhum: é infraestrutura sem consumidor.                                                                                                                                                                                                      |
| 3. Os quatro produtos        | Harness serviria HIS, secretária, hub, corp e trainee           | Nenhum produto prioritário dependia dele. O cvg-corp ainda tinha um motor de agentes próprio, duplicado.                                                                                                                                                                               |
| 4. Temporal como referência  | Sugestão do Codex                                               | Bom motor de durabilidade, mas só vale se o problema for durabilidade. Ficou para depois.                                                                                                                                                                                              |
| 5. O HIS como foco           | O cvg-his-v4 é o produto real, em pre-release, com outra equipe | O padrão “auditar em vez de usar” se repetia em todos os repositórios, inclusive três auditorias do HIS em 24 horas.                                                                                                                                                                   |
| 6. A hora extra              | —                                                               | O tempo disponível é o de um gestor depois de um dia inteiro de trabalho. Isso limita o que dá para manter.                                                                                                                                                                            |
| 7. A dor real                | Processo ideal: protocolos, circuito fechado, I-PASS            | No mundo real as pessoas não registram, prometem e esquecem, não passam o plantão. **O gargalo é a entrada do registro.**                                                                                                                                                              |
| 8. O assistente              | Agente tipo Hermes ou OpenClaw que escreve no sistema           | Melhor: um assistente que organiza, lembra e cobra, com o HIS como fonte da verdade e **sem poder** de escrever nele ou mexer no servidor.                                                                                                                                             |

**Por que o Ricardo faz hora extra:** como gestor, ele é hoje a torre de controle humana do hospital. Cada falha da cadeia volta para ele resolver. A hora extra existe para construir algo que faça esse acompanhamento no lugar dele.

**Por que o harness existe:** para ter um assistente de IA com freio. Hermes e OpenClaw têm poder demais para um hospital; o harness é o cérebro que ajuda sem conseguir fazer estrago. No caminho, ele se perdeu em certificar a si mesmo. Este documento devolve o harness ao motivo original.

## A dor real do hospital

O problema não é falta de sistema nem de protocolo: é que **informação se perde entre pessoas** numa cadeia longa, e qualquer elo quebrado vira um problema grave.

**A cadeia:** cliente → paciente → atendimento → serviço (exame, internação, cirurgia) → resultado e laudo → conduta → comunicação ao tutor → entrega. Ela passa por dezenas de pessoas: recepção, veterinários, especialistas, laboratório da clínica médica, laboratório da internação, imagem, enfermagem e os plantonistas de cada turno.

**As falhas do dia a dia, como acontecem de verdade:**

- O plantonista fala com o tutor, mas não passa a informação para o próximo plantonista.
- O exame é solicitado, mas não é identificado ou não é lançado na comanda.
- O paciente internado não é evoluído; nada é anotado no prontuário.
- O especialista roda o exame e não lauda.
- Alguém diz que vai fazer e não faz.
- Alguém faz e não anota em lugar nenhum.

**A causa raiz:** registrar exige sentar no computador e escrever. Num plantão dinâmico isso não cabe, então o registro fica para depois e cai no esquecimento. Sem registro, nenhum processo, alarme ou sistema consegue acompanhar o que não sabe que existe.

**A consequência:** a memória do hospital fica na cabeça das pessoas, e o gestor vira quem lembra, cobra e tapa os buracos.

**Mundo ideal × mundo real.** Os protocolos (passagem estruturada, circuito fechado, certificações) estão corretos, mas pressupõem pessoas com tempo e disciplina que o plantão não dá. A solução precisa funcionar com as pessoas como elas são: registrar tem que ser mais fácil do que esquecer, e quem lembra e cobra tem que ser o sistema.

## Princípios que valem para todos os programas

1. **Funcionar com as pessoas reais.** Nenhuma solução pode depender de alguém sentar no computador no meio do plantão. Registrar precisa ser mais fácil do que esquecer.
2. **O HIS é a fonte da verdade.** Todo dado clínico, operacional e financeiro vive no cvg-his-v4. Os outros programas leem, alimentam ou ajudam, mas não mantêm uma versão paralela da verdade.
3. **A memória fica no sistema, não na cabeça.** Toda promessa, pendência e exame pedido vira algo persistente, com dono e prazo, que só some quando foi concluído.
4. **O sistema cobra para que o gestor não precise.** Lembrete para o dono, depois o supervisor, depois o gestor. Em escada, para não virar ruído.
5. **Processo determinístico no centro, IA na borda.** Regras, prazos e escalonamento são fixos e previsíveis. A IA só entra para transformar áudio, foto e texto solto em informação organizada, e quem confirma é um humano.
6. **Poder zero por construção.** O assistente não escreve no HIS, não executa comando, não mexe no servidor e não fala com tutor. A segurança vem da arquitetura, não de pedir ao modelo para se comportar.
7. **Fecha quando está registrado.** Uma pendência só é dada como concluída quando o registro aparece no HIS, não quando alguém clica em “feito”.
8. **Começar pequeno, com gente usando.** Um setor, poucos usuários, poucas regras. Melhor imperfeito e em uso do que perfeito e parado.
9. **O ideal é bússola, não portão.** Protocolos e certificações orientam a direção; não são condição para começar.
10. **Caber no tempo real do gestor.** O plano precisa funcionar em horas extras. Agentes executam; decisões humanas são agrupadas numa sessão semanal curta.

## Mapa do ecossistema

```text
Toda informação acaba no HIS; o assistente cobra até ela chegar lá

  ┌──────────────┐       ┌───────────────────────────┐      ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
  │   Gestor     │       │  Plantonistas e equipe    │        Tutores
  │ recebe só o  │       │ WhatsApp: áudio, foto,    │      │ DeskcommCRM       │
  │ que escalou  │       │ texto                     │        (fase 5)
  └──────▲───────┘       └──────┬─────────────▲──────┘      └ ─ ─ ─ ─┬ ─ ─ ─ ─ ┘
         │ escala   áudio, foto,│             │lembretes e           ┆ conversas
         │          texto       ▼             │cobranças             ┆
         │            ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓            ┆
         └────────────┃      ASSISTENTE DE PLANTÃO        ┃◀┄┄┄┄┄┄┄┄┄┄┄┘
                      ┃     cvg-operational-harness       ┃
                      ┃ organiza · lembra · cobra · passa ┃┄┄┄┄┄┄┄┄┄┐
                      ┃ o plantão                         ┃         ┆
                      ┗━━━━━━━━━━━━━━━━┯━━━━━━━━━━━━━━━━━━┛         ┆
                                       │ consulta somente leitura   ┆
                                       ▼                            ▼
  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ┐     ┌───────────────────────────┐   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
    corp e           ┄┄┄▶ │        cvg-his-v4         │     cvg-trainee-vet
  │ diagnostic-hub  │     │     fonte da verdade      │   │ educação, ritmo   │
    arquivados;           │  a equipe registra aqui   │     próprio; recebe
  │ referência HIS  │     └───────────────────────────┘   │ temas recorrentes │
  └ ─ ─ ─ ─ ─ ─ ─ ─ ┘                                     └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘

Linhas e caixas tracejadas: relações futuras ou de referência.
```

O plantonista manda o que consegue pelo WhatsApp e registra no HIS quando dá. O assistente lê o HIS para saber o que já foi registrado e cobra o que falta, escalando ao gestor só o que passou do prazo. Linhas tracejadas são relações futuras ou de referência.

## Papel de cada programa

Cada programa resolve uma parte da dor. A tabela é a referência para decidir o que entra em cada repositório.

| Programa                                 | Papel no ecossistema                                     | Dor que resolve                                                                                  | Estado em 30/09/2026                                                                                                    | Decisão                                                                                              | Não deve                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **cvg-his-v4**                           | Sistema principal e fonte da verdade (substitui o Vetus) | Registro clínico, agenda, internação, exames, prescrição, caixa, comanda, financeiro             | Pre-release, equipe própria; já tem passagem de plantão, tarefas de workflow, ciclo de laboratório, WhatsApp e API keys | **Foco principal.** Seguir para o release. Expor API de leitura e eventos para o assistente          | Virar assistente ou torre de pendências; receber escrita automática de IA                                |
| **cvg-operational-harness**              | Assistente de Plantão e torre de pendências              | Gargalo da entrada; esquecimento; promessas não cumpridas; plantão que não passa; laudo sem dono | Readiness 20/100 como plataforma genérica; 2.305 testes passando; frentes abertas travadas                              | **Mudar a missão** (este documento). Encerrar o plano de 13 gates                                    | Escrever no HIS; executar comando; falar com tutor; virar plataforma multi-produto antes de provar valor |
| **DeskcommCRM / cvg-agent-secretary-v2** | Atendimento ao tutor (WhatsApp, recepção)                | Mensagens de tutor sem resposta ou sem registro                                                  | Secretária no fim da fila; DeskcommCRM é fork de CRM com WhatsApp                                                       | **Depois.** Vira porta de entrada: conversa com tutor gera pendência no assistente                   | Duplicar cadastro de tutor e paciente fora do HIS                                                        |
| **cvg-diagnostic-hub-v2**                | Referência de fluxo de exames                            | Exame sem acompanhamento, laudo sem ciência                                                      | Último commit em 07/09; o HIS já tem módulo `diagnostics`                                                               | **Absorver no HIS** como referência de UX e fluxo. Depois, se continuar vivo, vira fonte de eventos  | Manter um segundo cadastro de exames paralelo ao HIS                                                     |
| **cvg-corp**                             | Sistema veterinário paralelo                             | Sobrepõe-se ao HIS (agenda, pacientes, estoque, financeiro)                                      | Último commit em 17/09; tem motor de agentes próprio                                                                    | **Arquivar como produto.** Ideias úteis migram para o HIS ou o harness                               | Competir com o HIS; manter um segundo motor de agentes                                                   |
| **cvg-trainee-vet**                      | Educação continuada digital                              | Formação da equipe (casos fictícios, quizzes, simulação)                                         | Último commit em 11/09                                                                                                  | **Ritmo próprio**, com foco em conteúdo. Pode receber, no futuro, temas vindos de falhas recorrentes | Usar dado real de paciente; certificar competência prática                                               |

Observação sobre o cvg-corp e o diagnostic-hub: a decisão acima assume que foram tentativas anteriores substituídas pelo HIS. Se algum deles ainda for usado no hospital, a decisão deve ser revista (ver Decisões em aberto).

## O Assistente de Plantão

Um assistente pessoal do plantonista no WhatsApp: recebe tudo, organiza, lembra e cobra até o registro existir no HIS.

### O que ele faz

| Capacidade                           | Exemplo no plantão                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| **Recebe qualquer entrada**          | Áudio de 30 segundos andando no corredor, foto de uma guia ou folha de papel, texto solto                     |
| **Devolve mastigado**                | Evolução organizada e pronta para colar no HIS; lista do que foi pedido e do que ficou pendente               |
| **Transforma promessa em pendência** | “Vou ligar pro tutor às 16h” vira um lembrete com hora e dono                                                 |
| **Rotinas (cron)**                   | “Evolução dos internados às 10h e às 22h”; “conferir laudos pendentes no fim do turno”                        |
| **Agenda do plantonista**            | “O que é meu agora e o que está atrasado”, sob pedido ou no início do turno                                   |
| **Passagem de plantão**              | Monta o resumo a partir das notas e pendências do turno e entrega para quem entra, que dá ciência item a item |
| **Cobra até estar registrado**       | Lê o HIS; quando a evolução ou o laudo aparece, para de cobrar sozinho                                        |
| **Escala**                           | Dono → supervisor → gestor, com prazos por tipo de pendência                                                  |
| **Responde perguntas sobre o HIS**   | “Quais exames do Thor ainda estão sem laudo?” (somente leitura)                                               |

### O que ele não pode fazer, por construção

| Não pode                                         | Como é garantido                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Escrever, alterar ou apagar no HIS               | Credencial do HIS somente leitura, com escopo mínimo                           |
| Executar comando, shell, código ou script        | Não existe ferramenta para isso; só ferramentas de uma lista fechada no código |
| Mexer em arquivos, no servidor ou na VPS         | Container sem shell, sem root, com disco somente leitura                       |
| Acessar a internet livremente                    | Saída de rede liberada só para o provedor de IA, o WhatsApp e a API do HIS     |
| Instalar plugins ou mudar a própria configuração | Configuração fixa no deploy; o modelo não tem acesso a ela                     |
| Falar com tutor                                  | Só conversa com números da equipe cadastrados                                  |
| Decidir conduta clínica ou prescrever            | Só organiza e lembra; quem decide e registra no HIS é o veterinário            |

Se um áudio, foto ou texto trouxer instruções maliciosas, o pior resultado possível é uma nota ou um lembrete errado. Não há ferramenta perigosa para ser sequestrada.

### Um ciclo completo

1. O plantonista manda: 🎤 “Thor do leito 3 vomitou duas vezes, pedi hemograma e bioquímico, vou ligar pro tutor às 16h.”
2. O assistente identifica o Thor entre os internados ativos do HIS e responde com: evolução organizada pronta para colar; exames pedidos (lembrete de lançar na comanda); pendência “ligar para o tutor às 16h”. Botões: Confirmar / Corrigir.
3. O plantonista confirma. As pendências ficam abertas no assistente.
4. Quando der, o plantonista cola a evolução no HIS (celular ou computador).
5. O assistente lê o HIS: a evolução apareceu, a pendência fecha. Os exames sem laudo seguem acompanhados.
6. 16h05, sem registro da ligação: “Ligou para o tutor do Thor?”. Resposta 🎤 “liguei, tutor ciente”: a pendência vira “registrar o contato no HIS”.
7. Troca de plantão: as pendências abertas do Thor vão para quem entra, que dá ciência. O que não for aceito continua com quem saiu e sobe para o supervisor.

### Três tipos de regra da torre de pendências

- **Expectativa:** o sistema cria a pendência do que deveria acontecer. Internou → evolução por turno. Exame pedido → laudo com prazo. Laudo liberado → ciência de quem pediu.
- **Reconciliação:** o sistema cruza fontes e acha o buraco. Exame pedido sem lançamento na comanda. Exame realizado sem laudo. Conversa com tutor sem anotação no prontuário.
- **Promessa:** tudo que alguém disse que vai fazer vira pendência com dono e hora.

## Arquitetura-alvo do harness

```text
Poder zero: o assistente só alcança ferramentas de uma lista fechada

                     ┌──────────────────────────┐
                     │   WhatsApp da equipe     │
                     │ só números cadastrados   │
                     └────────────▲─┬───────────┘
 ┌ Assistente de Plantão ─────────┼─┼──────────────────┐
 │ sem shell · sem root · disco somente leitura ·      │
 │ rede por lista                 │ ▼                  │
 │  ┌──────────────────────────────────────────────┐   │
 │  │ Canal (channel-gateway)                      │◀┐ │
 │  │ recebe e envia · confere assinatura ·        │ │ │
 │  │ não duplica                                  │ │ │
 │  └──────────────────────┬───────────────────────┘ │ │
 │  ┌──────────────────────▼───────────────────────┐ │ │    ┌──────────────────────┐
 │  │ Entender (model-gateway + runtime)           │◀┼─┼───▶│ Provedor de IA       │
 │  │ transcreve o áudio · extrai paciente,        │ │ │    │ transcrição e texto  │
 │  │ evolução, promessas                          │ │ │    └──────────────────────┘
 │  └──────────────────────┬───────────────────────┘ │ │
 │  ┏━━━━━━━━━━━━━━━━━━━━━━▼━━━━━━━━━━━━━━━━━━━━━━━┓ │ │    ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
 │  ┃ Policy (policy-engine)                       ┃┄┼┄┼┄┄┄▶  NÃO EXISTE
 │  ┃ só ferramentas da lista fechada; nega o resto┃ │ │    │ escrever no HIS ·    │
 │  ┗━━━━━━━━━━━━━━━━━━━━━━┯━━━━━━━━━━━━━━━━━━━━━━━┛ │ │      shell · arquivos ·
 │  ┌──────────────────────▼───────────────────────┐ │ │    │ internet livre ·     │
 │  │ Ferramentas permitidas                       │ │ │      falar com tutor
 │  │ nota · pendência · lembrete                  │─┼─┼───▶└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
 │  │ consulta ao HIS · mensagem à equipe          │ │ │    ┌──────────────────────┐
 │  └──────────┬───────────────────────────────────┘ │ │    │ cvg-his-v4           │
 │  ┌──────────▼──────────────┐ ┌──────────────────┐ │ │    │ API somente leitura  │
 │  │ Pendências e auditoria  │ │ Worker           │─┘ │    │ credencial de escopo │
 │  │ PostgreSQL; notas       │ │ lembretes,       │   │    │ mínimo               │
 │  │ apagadas em N dias      │ │ rotinas, escala  │   │    └──────────────────────┘
 │  └─────────────────────────┘ └──────────────────┘   │
 └─────────────────────────────────────────────────────┘

A seta de "Ferramentas permitidas" leva à consulta somente leitura do cvg-his-v4.
```

Toda mensagem passa por canal, entendimento e policy antes de chegar a uma ferramenta. Como as ferramentas perigosas não existem no código, nem um modelo enganado consegue escrever no HIS, rodar comando ou mexer no servidor. A saída de rede do container só alcança o WhatsApp, o provedor de IA e a API de leitura do HIS.

## Planejamento por fases

```text
A aposta é testada na semana 3, antes de construir o resto

Semana 1       Fase 0 · Reorientação
               ADR, encerrar frentes antigas, barra proporcional, corrigir o piso de risco
                   │
Semanas 2–3    ★ Fase 1 · Caderno de plantão no WhatsApp
               áudio vira nota organizada, texto para colar no HIS e lembretes; 2 plantonistas
                   │
                   ◆ Os plantonistas usam?   não: parar e entender o porquê
                   │
Semanas 4–5    Fase 2 · Rotinas e passagem de plantão
               rotinas por turno, passagem com aceite item a item, escala ao supervisor
                   │
                   ◆ API de leitura do HIS pronta?   não: segue com fechamento manual
                   │
Semanas 6–8    Fase 3 · Leitura do HIS
               identifica o paciente; a pendência fecha quando o registro aparece no HIS
                   │
Semanas 9–11   Fase 4 · Reconciliação e visão do gestor
               exame sem comanda ou sem laudo, resumo diário ao gestor, segundo setor
                   │
Semana 12+     Fase 5 · Novas portas
               DeskcommCRM, foto de guia, eventos do HIS em tempo real, mais setores
```

A fase 1 é a mais importante: ela testa se os plantonistas usam o assistente antes de qualquer integração. As semanas são estimativas para ritmo de horas extras e não são promessa de data. O detalhe de cada fase vem na seção seguinte.

## Detalhe de cada fase

As semanas são estimativas para um ritmo de horas extras, com agentes executando. Cada fase termina num ponto de decisão: seguir, ajustar ou parar.

### Fase 0 — Reorientação (semana 1)

**Objetivo:** o repositório passa a trabalhar para a nova missão, e nada antigo compete por atenção.

- Registrar a decisão numa ADR curta que aponta para este documento.
- Encerrar as frentes abertas (UP91, AUD0592, PR-301, SPECs 0157–0175 em revisão, certificação) com o estado `SUPERSEDED` e o motivo.
- Substituir os 13 gates pela barra proporcional deste documento.
- Congelar os módulos que a nova missão não usa (ver seção “O que congelar”).
- Avisar o Codex pelo arquivo de coordenação.
- Corrigir o bug do piso de risco no `policy-engine` (regra `ALLOW` que pula a aprovação de alto risco).
- Responder as decisões em aberto D1–D4.

**Aceite:** ADR commitada; ledgers apontando para a nova missão; nenhuma frente antiga em andamento; teste do piso de risco passando.

### Fase 1 — Caderno de plantão no WhatsApp (semanas 2–3)

**Objetivo:** provar a aposta principal. Os plantonistas usam?

- Número de WhatsApp da equipe ligado ao assistente, aceitando só números cadastrados.
- Áudio → transcrição → nota organizada por paciente, com texto pronto para colar no HIS.
- Texto e foto aceitos; foto só guardada e anexada à nota (leitura automática fica para depois).
- Promessas viram lembretes com hora (“vou ligar às 16h”).
- Comandos simples: “minhas pendências”, “feito”, “adiar 30 min”.
- Paciente identificado pelo que o plantonista falar (nome e leito), sem consultar o HIS ainda; o assistente pergunta quando estiver ambíguo.
- Notas apagadas automaticamente depois de N dias.
- Piloto com 2 plantonistas da internação.

**Aceite:** um plantonista consegue registrar por áudio, receber o texto organizado e ser lembrado na hora certa, sem ajuda.

**Não entra:** leitura do HIS, escalonamento, painel do gestor, passagem de plantão.

**Ponto de decisão:** se, em duas semanas, os pilotos não usarem na maior parte dos turnos, parar e entender por quê antes de construir mais.

### Fase 2 — Rotinas e passagem de plantão (semanas 4–5)

**Objetivo:** o sistema passa o plantão, não a pessoa.

- Rotinas por turno configuradas pelo gestor (exemplo: evolução dos internados às 10h e às 22h).
- Escala de plantão cadastrada (no início, uma lista simples mantida pelo gestor).
- Na troca de turno: resumo do plantão montado a partir das notas e pendências, enviado a quem entra; aceite item a item.
- Pendência não aceita continua com quem saiu e sobe para o supervisor.
- Escalonamento em escada: dono → supervisor, com prazos por tipo.

**Aceite:** numa troca de plantão real, todas as pendências abertas chegam a quem entra e ficam com dono.

**Não entra:** leitura do HIS, escalonamento ao gestor.

### Fase 3 — Leitura do HIS (semanas 6–8)

**Objetivo:** o HIS confirma o que foi feito, e o assistente para de depender de alguém dizer “feito”.

- API de leitura do HIS: internados ativos, evoluções por período, pedidos de exame e laudos, escala.
- Paciente identificado contra os internados ativos (nome, espécie, tutor e leito na confirmação).
- Pendência fecha sozinha quando o registro aparece no HIS.
- Regras de expectativa: evolução por turno para todo internado; laudo com prazo para todo exame pedido; ciência de quem pediu para todo laudo liberado.
- Consulta pelo WhatsApp: “exames do Thor sem laudo”.

**Dependência:** a equipe do HIS expõe a API de leitura. Se não for possível na janela, o assistente segue com fechamento manual e a fase é replanejada.

**Aceite:** uma evolução registrada no HIS fecha a pendência correspondente em até alguns minutos, sem ação do plantonista.

### Fase 4 — Reconciliação e visão do gestor (semanas 9–11)

**Objetivo:** achar os buracos que ninguém registrou e dar ao gestor a visão do todo.

- Regras de reconciliação: exame pedido sem lançamento na comanda; exame realizado sem laudo.
- Escalonamento até o gestor, só para o que passou de supervisor.
- Resumo diário para o gestor no WhatsApp; painel simples por setor e por pessoa.
- Segundo setor no piloto (por exemplo, laboratório ou imagem).

**Aceite:** o gestor recebe por dia só o que realmente precisa dele, e o painel mostra atrasos por setor.

### Fase 5 — Novas portas (a partir da semana 12)

Em ordem de valor, uma de cada vez:

1. DeskcommCRM: conversa com tutor sobre paciente internado vira pendência para o veterinário responsável.
2. Leitura de foto (guias, folhas de papel) para pré-preencher a nota.
3. Eventos do HIS em tempo real (event-bus/webhooks) no lugar de consultas periódicas.
4. Mais setores e mais tipos de regra.
5. Temas recorrentes de falha enviados ao cvg-trainee-vet como sugestão de conteúdo.

## Backlog inicial — fases 0 e 1

Ordem de execução de cima para baixo. “Agente” significa Codex ou Claude Code sob claim; “Ricardo” são decisões que só ele toma.

| ID     | Fase | Tarefa                                                                                                   | Quem             | Aceite                                                                                        |
| ------ | ---- | -------------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------- |
| AP-001 | 0    | ADR “Missão: Assistente de Plantão” apontando para este documento                                        | Agente           | ADR commitada em `docs/`                                                                      |
| AP-002 | 0    | Marcar frentes antigas como `SUPERSEDED` nos ledgers (runtime state, log, backlog, 0356, 0367)           | Agente           | Ledgers apontam para a ADR; nada antigo em andamento                                          |
| AP-003 | 0    | Aviso na coordenação: Codex encerra UP91, AUD0592 e PR-301                                               | Agente           | Entrada no `agent_coordination.md`                                                            |
| AP-004 | 0    | Barra proporcional de produção substitui os 13 gates (0354)                                              | Agente           | Documento curto, 8 itens, aprovado pelo Ricardo                                               |
| AP-005 | 0    | Corrigir o piso de risco: regra `ALLOW` não pode dispensar aprovação de `HIGH_RISK_WRITE`/`ADMIN`        | Agente           | Teste negativo novo passando; suíte verde                                                     |
| AP-006 | 0    | Responder D1–D4 (WhatsApp, provedor de IA, pilotos, retenção)                                            | Ricardo          | Respostas registradas na ADR                                                                  |
| AP-007 | 1    | Adapter de WhatsApp para a equipe, com lista de números permitidos                                       | Agente           | Mensagem de número não cadastrado é ignorada e registrada                                     |
| AP-008 | 1    | Transcrição de áudio (provedor decidido em D2)                                                           | Agente           | Áudio de 60 s com jargão veterinário transcrito com qualidade aceitável em 10 áudios de teste |
| AP-009 | 1    | Extração estruturada: paciente, evolução, pedidos, promessas (schema fixo)                               | Agente           | 20 casos sintéticos com saída correta; números e doses repetidos literalmente                 |
| AP-010 | 1    | Resposta com texto pronto para colar no HIS + botões Confirmar/Corrigir                                  | Agente           | Fluxo completo em teste ponta a ponta                                                         |
| AP-011 | 1    | Pendências com dono, hora e estado; lembrete na hora certa                                               | Agente           | Lembrete chega em até 1 min do horário; persiste após reinício do serviço                     |
| AP-012 | 1    | Comandos “minhas pendências”, “feito”, “adiar”                                                           | Agente           | Cada comando com teste                                                                        |
| AP-013 | 1    | Apagamento automático de notas e áudios após N dias (D4)                                                 | Agente           | Teste de expurgo; nada além do prazo                                                          |
| AP-014 | 1    | Deploy mínimo endurecido: container sem shell e sem root, disco somente leitura, saída de rede por lista | Agente           | Checklist de segurança da seção “Barra proporcional”                                          |
| AP-015 | 1    | Guia de uma página para os plantonistas (como mandar, o que esperar)                                     | Ricardo + agente | Lido pelos 2 pilotos                                                                          |
| AP-016 | 1    | Piloto de 2 semanas com 2 plantonistas; registro de uso por turno                                        | Ricardo          | Dados de uso coletados; decisão seguir/ajustar/parar                                          |

## O que congelar, reaproveitar e corrigir no harness

Nada é apagado. “Congelar” significa: não recebe trabalho novo e não entra na barra de produção. Os testes continuam rodando.

| Parte do código                                                       | Decisão                      | Uso na nova missão                                                        |
| --------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------- |
| `channel-gateway` (webhook com assinatura, inbox, effect journal)     | **Reaproveitar**             | Entrada e saída do WhatsApp sem duplicar mensagens                        |
| `model-gateway` (proteção de rede, limites)                           | **Reaproveitar**             | Chamadas ao provedor de IA e de transcrição                               |
| `policy-engine` + `policy`                                            | **Reaproveitar e corrigir**  | Lista fechada de ferramentas; corrigir o bug do `ALLOW`                   |
| `harness`, `orchestrator`, `agent-runtime`                            | **Reaproveitar o núcleo**    | Interpretar a mensagem e escolher a ferramenta, com orçamento e paradas   |
| `persistence` (PostgreSQL, RLS, outbox, leases)                       | **Reaproveitar**             | Pendências, notas, lembretes e auditoria duráveis                         |
| `apps/worker` + sweeps                                                | **Reaproveitar**             | Disparo de lembretes, rotinas por turno, escalonamento                    |
| `observability`                                                       | **Reaproveitar**             | Logs e métricas de uso do piloto                                          |
| `approval-engine`                                                     | **Simplificar**              | O “Confirmar” do plantonista; sem efeitos externos sensíveis por enquanto |
| `conversation`, `agent-core`                                          | **Avaliar na fase 1**        | Manter só o que servir ao diálogo com o plantonista                       |
| `apps/api` (`server.ts` com 5.531 linhas)                             | **Congelar, salvo o mínimo** | Só health e endpoints do assistente; dividir quando precisar mexer        |
| `apps/web` (console)                                                  | **Congelar**                 | Volta na fase 4 como painel do gestor, se o WhatsApp não bastar           |
| `platform` (Control Center, Test Lab, publish/rollback, multi-tenant) | **Congelar**                 | Uma só organização: a CVG                                                 |
| `rag`                                                                 | **Congelar**                 | Respostas com fonte aprovada ficam para depois                            |
| `agent-evals`, `chaos`                                                | **Manter rodando**           | Ganham casos novos de transcrição e extração                              |
| `legacy/` (secretária)                                                | **Congelar**                 | Referência para a fase 5 (DeskcommCRM)                                    |
| Certificação (`certify`, `phase10-*`, 13 gates)                       | **Encerrar**                 | Substituída pela barra proporcional e pelo CI simples                     |
| `docs/04_audit/evidence` (88 MB)                                      | **Arquivar fora do caminho** | Histórico; não é lido no dia a dia                                        |

**Correções que entram mesmo com a mudança de missão:**

- Piso de risco do `policy-engine` (AP-005).
- Três dependências com alerta HIGH: undici, fast-uri e brace-expansion.
- Composição do entrypoint: o `main.ts` publicado não liga sessão nem identidade persistente; só importa se o painel web voltar.

## Barra proporcional de produção

Substitui as 13 condições do plano 0354, que eram padrão enterprise. Vale para o assistente entrar em uso com a equipe da CVG. Cada item é verificado uma vez antes do piloto e revisto quando algo relevante muda.

| #   | Condição                                                                                                                                             | Como se verifica                                                                         |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | **Só a equipe fala com o assistente.** Lista de números permitidos; o resto é ignorado                                                               | Teste com número não cadastrado                                                          |
| 2   | **Poder zero por construção.** Sem ferramenta de escrita no HIS, shell, arquivo ou rede livre                                                        | Revisão da lista de ferramentas; container sem shell e sem root; saída de rede por lista |
| 3   | **HIS somente leitura.** Credencial com escopo mínimo                                                                                                | Tentativa de escrita recusada pelo HIS                                                   |
| 4   | **Segredos fora do código e da imagem**                                                                                                              | Varredura de segredos no CI; segredos só por variável ou cofre do servidor               |
| 5   | **LGPD básica.** Contrato de tratamento com o provedor de IA (ou transcrição local); notas e áudios apagados após N dias; registro do que é guardado | Documento de uma página + teste de expurgo                                               |
| 6   | **Backup testado** das pendências e da auditoria                                                                                                     | Um restore feito e registrado                                                            |
| 7   | **Alguém sabe quando quebra.** Alerta se o assistente parar de responder ou de disparar lembretes                                                    | Teste de parada com alerta recebido                                                      |
| 8   | **Botão de desligar.** O gestor desliga o assistente em um passo, sem perder as pendências                                                           | Teste do desligamento e da retomada                                                      |

O que deixa de ser exigido para começar: pentest externo, PITR com RPO/RTO formal, on-call escalonado, certificação com 16 gates, IdP corporativo com MFA para o console e 0 itens P1 no backlog. Esses itens voltam a ser avaliados se o assistente passar a escrever no HIS, se for usado por outra organização ou se o painel web abrir para a internet.

## Riscos e mitigações

| Risco                                             | Por que importa                                          | Mitigação                                                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Os plantonistas não usam**                      | É a aposta inteira; sem uso, nada mais funciona          | Fase 1 existe para testar isso primeiro, com critério de parada em duas semanas; guia de uma página; começar com quem tem boa vontade       |
| **Paciente errado**                               | Lembrete ou nota no paciente errado confunde a equipe    | Na fase 1, o assistente pergunta quando houver dúvida; na fase 3, confere contra os internados do HIS e mostra nome, espécie, tutor e leito |
| **Número ou dose mal transcrito**                 | Erro de valor em texto que será colado no prontuário     | Valores repetidos literalmente na confirmação; prescrição fora do escopo; o veterinário revisa antes de colar                               |
| **Fadiga de alarme**                              | Se tudo apita, ninguém escuta                            | Escada dono → supervisor → gestor; poucas regras no início; prioridade por tipo; revisão semanal do que gerou ruído                         |
| **LGPD**                                          | Áudio clínico enviado a um provedor externo              | Contrato de tratamento ou transcrição local (Whisper); apagamento automático; só números da equipe                                          |
| **Banimento do número de WhatsApp**               | APIs não oficiais (WAHA, Evolution) podem ser bloqueadas | Usar a API oficial do WhatsApp Business para a equipe (decisão D1)                                                                          |
| **Equipe do HIS sem tempo para a API de leitura** | A fase 3 depende disso                                   | Pedido pequeno e cedo; enquanto não vier, fechamento manual (“feito”)                                                                       |
| **O harness volta a crescer em processo**         | Foi o que o travou antes                                 | Regras de trabalho deste documento; nenhuma auditoria antes do fim da fase 2                                                                |
| **Prompt injection por áudio, foto ou texto**     | Alguém tenta fazer o assistente agir fora do papel       | Poder zero por construção: o pior caso é uma nota ou um lembrete errado                                                                     |
| **Dependência de uma pessoa**                     | Se o Ricardo parar, tudo para                            | Documento como fonte da verdade; agentes seguem o backlog; sessão semanal curta                                                             |

## Regras de trabalho

O que travou o harness não foi o código, foi o processo. Estas regras valem para todos os repositórios da CVG.

**Com os agentes (Codex, Claude Code, Opus, Fable):**

1. **Agentes implementam e corrigem.** Relatórios, planos, roadmaps e auditorias só quando o Ricardo pedir.
2. **Uma revisão por mudança,** no máximo duas. Se a segunda revisão ainda achar problema, a mudança vai para a sessão semanal.
3. **Nada de auditoria do harness antes do fim da fase 2.** A próxima avaliação vem do uso real: quantos registros, quantas pendências fechadas no prazo, o que os plantonistas reclamaram.
4. **Commit pequeno, só dos próprios arquivos,** seguindo `agent_coordination.md`.
5. **Um backlog vigente:** o deste documento. Backlogs anteriores viram histórico.
6. **Toda tarefa amarrada a uma fase.** O que não serve à fase atual espera.

**Com o tempo do Ricardo:**

1. **Uma sessão de decisões por semana,** com hora marcada e até uma hora. Fora dela, decisões esperam.
2. **Uma meta por semana.** Exemplo: “esta semana, o piloto da fase 1 começa”.
3. **O que só o Ricardo pode fazer vem primeiro:** decisões, regras do hospital, conversa com a equipe e com os pilotos.
4. **Ritmo de horas extras é o ritmo do plano.** Atraso não é motivo para ampliar processo.

**Como medir se está funcionando:**

| Métrica                                        | Onde se mede              | Direção esperada    |
| ---------------------------------------------- | ------------------------- | ------------------- |
| Registros por plantonista por turno            | Assistente                | Subir e estabilizar |
| Pendências fechadas no prazo                   | Assistente                | Subir               |
| Evoluções atrasadas por turno                  | Assistente + HIS (fase 3) | Cair                |
| Laudos sem ciência há mais de X horas          | Assistente + HIS (fase 3) | Cair                |
| Escalonamentos que chegam ao gestor por semana | Assistente                | Cair                |
| Tempo do gestor gasto cobrando a equipe        | Relato do Ricardo         | Cair                |

## Decisões em aberto

Só o Ricardo pode tomar. D1–D4 bloqueiam a fase 1; as demais podem esperar a fase indicada.

- [ ] **D1 — WhatsApp da equipe.** API oficial do WhatsApp Business (recomendado, sem risco de banimento) ou DeskcommCRM com WAHA/Evolution? _Bloqueia a fase 1._
- [ ] **D2 — Provedor de IA e transcrição.** Provedor externo com contrato de tratamento de dados, ou transcrição local (Whisper) e modelo externo só para organizar o texto? _Bloqueia a fase 1._
- [ ] **D3 — Pilotos.** Quais dois plantonistas da internação começam, e em quais turnos? _Bloqueia a fase 1._
- [ ] **D4 — Retenção.** Por quantos dias notas e áudios ficam guardados no assistente (sugestão: 7 dias depois de registrados no HIS)? _Bloqueia a fase 1._
- [ ] **D5 — As cinco coisas que mais se esquecem no plantão,** na lista real do hospital. Define as primeiras regras e rotinas. _Fase 2._
- [ ] **D6 — Escada de escalonamento.** Quem é supervisor de cada turno e setor, e em quanto tempo cada tipo de pendência sobe. _Fase 2._
- [ ] **D7 — API de leitura do HIS.** Conversa com a equipe do HIS sobre internados, evoluções, pedidos, laudos e escala. _Fase 3, mas deve começar já._
- [ ] **D8 — cvg-corp e cvg-diagnostic-hub-v2.** Confirmar que foram substituídos pelo HIS e podem ser arquivados como produtos. _Sem prazo; não bloqueia o assistente._
- [ ] **D9 — Prazos de laudo** por tipo de exame (laboratório da clínica médica, laboratório da internação, imagem) e o que conta como resultado crítico. _Fase 3._
