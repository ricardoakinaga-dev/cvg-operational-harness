# Próximo perfil SDK do DX100-G02 — HOW v3, depois da continuação 3

A continuação 3 do perfil de fonte foi executada em dois sub-lotes: C3-1, com 14 casos
TypeScript, e C3-2, com 13 casos Python. Este documento diz o que resta do perfil de
fonte depois dela e separa o que exige decisão nova do que não exige. É uma proposta:
não registra execução, não concede BUILD e não muda o catálogo de 509 obrigações. A
versão anterior é o [HOW v2](../sdk-batch-2b2-binding/HOW-next-profile-v2.md).

## Ponto de partida

- **Mapa:** o [mapa v6](coverage-observed-v6.json) tem 33 contratos
  `OBSERVED_CLIENT_PARTIAL` e 11 `OPEN_REQUIRED_FUTURE_PROFILE`. Os 11 abertos são
  PY19, PY20 e PK01 a PK09, todos do perfil distribuído. A continuação 3 não mudou o
  status de nenhuma linha, como o plano projetava. O v5 e as versões anteriores não
  foram editados.
- **Braços:** a continuação 3 liga 45 braços e 58 partes da tabela `arm_discrimination`
  congelada. Foram creditadas 57 partes.
  - A parte sem crédito é o known_bad "pular o cleanup" do PY13.B17 no C3-PY13ER. Ela
    depende da regra de zero chamadas do E3-07, cujo guarda não é creditado: o registro
    de threads perdia threads com ident reusado (DV-C32-01), e o Lead decidiu não
    creditar o guarda ao aceitar a C3-2.
  - Os dois braços abertos explícitos do v5, PY05.B10 e PY13.B06, passaram a
    distinguidos.
  - Foram fechados 13 braços que tinham escopo parcial no v5: os 11 do 2B, mais TS07.B03
    e TS07.B04, que vinham do 2A.
  - Duas leituras do v5 foram reforçadas. No TS05.B04, a criação e o cleanup do schema,
    antes só inferidos da fonte, passam a ser testemunhados. No PY13.B18, o v5 tinha só a
    observação positiva, e agora a exceção engolida ou a rota mantida são distinguidas.
  - O rótulo do PY17.B04 mudou de sentido. O "não registra fila" do v5 vinha da resposta
    apiKey, que não tem loginId. Na variante com loginId, a fila é registrada antes do
    RuntimeError; na resposta apiKey o caso segue sem fila a registrar.
  - Três braços com escopo parcial no v5 não estavam no plano. O lado que falta de cada
    um está em `arms_v5_partial_not_targeted_remaining` do v6:

    | Braço    | Lado que falta                                           | Destino                                  |
    | -------- | -------------------------------------------------------- | ---------------------------------------- |
    | PY02.B02 | Ramo "sem prefixo de PATH" (R-PY02-4)                    | Perfil distribuído (já decidido)         |
    | PY02.B02 | Cópia versus uso do `os.environ` do driver (V6-PY02-ENV) | Perfil de fonte, sem decisão nova        |
    | PY02.B07 | Ramo que pula o prefixo de PATH (R-PY02-4)               | Perfil distribuído (já decidido)         |
    | PY02.B07 | Cópia versus uso do `os.environ` do driver (V6-PY02-ENV) | Perfil de fonte, sem decisão nova        |
    | TS03.B03 | `mkdtemp` rejeita (R-TS03-2)                             | Capacidade nova de harness (fs injetado) |

  - O TS12.B01 do C3-TS12 cobre o aborto durante a execução. O término do filho
    pré-abortado segue NOT_WITNESSED (R-TS12-5).

- **Lacunas:** as [seis lacunas](gaps-review-v6.json) seguem OPEN, com as mesmas
  contagens do v5:
  - GAP-PY-API 13/13;
  - GAP-PY-RPC 11/11;
  - GAP-GENERATED 4/4;
  - GAP-PROVENANCE 1/3;
  - GAP-TS-LANGUAGE 15/15;
  - GAP-PLATFORM-PACKAGING 1/12.

  A continuação 3 só acrescenta braços a contratos já observados, e nenhum requisito
  tem qualificação com recibo.

- **Resíduos do plano:** são 77. A continuação 3 resolveu 34 e resolveu parcialmente 1
  (R-PY18-1). Seguem abertos 39 e fecharam sem observação 3. O R-PY13-4 está entre os
  abertos: o item dele não avançou, e o crédito do PY13.B18 é ganho lateral. Fora do
  plano, o v6 acrescenta o item V6-PY02-ENV. A tabela por resíduo está em `residuals_c3`
  do v6.
- **Decisões do usuário em 19/10/2026**
  ([registro](../sdk-batch-2b2-binding/user-decision-distributed-profile-20261019.json)):
  - Q1 adota a release 0.153.4 como pin separado;
  - Q2 autoriza uma aquisição só da lista do Codex;
  - Q3 aceita o modo keyless;
  - Q4 negou a testemunha privilegiada do TS12 (`CAP_SYS_ADMIN` com fanotify ou
    `CAP_SYS_PTRACE`);
  - Q5 (outras versões de pydantic e de Node) não foi autorizada.

## O que resta do perfil de fonte

### Sem decisão nova

| Item                                                                 | Origem                                       | Destino                                                                                          |
| -------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Known_bad "pular o cleanup" do PY13.B17 julgado MISMATCH             | R-PY13-4 (o item não avançou)                | Continuação seguinte do perfil de fonte, depois do C32-ADM/R1-F01 inteiro                        |
| Demais modelos gerados fora dos exercitados (o C3-PY18 cobriu dois)  | R-PY18-1 (parte)                             | Continuação seguinte do perfil de fonte                                                          |
| Cópia versus uso do `os.environ` do driver no PY02.B02 e no PY02.B07 | V6-PY02-ENV (fora do plano; `client.py:258`) | Continuação seguinte do perfil de fonte, com uma sonda do `os.environ` do driver depois do start |

Pré-requisitos de qualquer reuso da pilha Python, vindos da R1 do C3-2:

- **C32-ADM/R1-F01**, com o texto inteiro em
  `../sdk-continuation-3-2-admission/next-task.json#/carry_over[id=C32-ADM/R1-F01]`.
  Tem quatro itens:
  1. registro de threads por `threading.local` (ou equivalente), com autoteste do driver
     usando dois threads em sequência com ident reusado;
  2. controle negativo do avaliador: zero chamadas com o thread vigiado no
     `THREAD_REGISTRY` dá INVALID_CAPTURE pela regra 4;
  3. a regra de zero chamadas também é recusada quando algum frame (`HOOK_EVENT`,
     `EXCEPTHOOK_RECORD`) traz o thread vigiado, e o `THREAD_REGISTRY` publica a mesma
     união usada no `WAIT_RESULT`;
  4. adjudicação e BIND não creditam o guarda nem o `thread_started` como provados.
- **C32-ADM/R1-F03:** fechar `WAIT_APIS` na lista do D3-05.
- **C32-ADM/DV-C32-02:** gravar `case_plan_file` no manifesto, com autoteste sobre o
  manifesto real.

Se o driver TypeScript for reusado, valem também C31-ADM/R1-F02 (sonda do getter) e
C31-ADM/R1-F03 (subchaves do vocabulário).

### Sem decisão nova e sem caminho determinístico

São seis resíduos `OUT_NONDETERMINISTIC`:

- R-TS10-4: forma B natural do ENOENT;
- R-TS11-3: ordem entre EOF e exit;
- R-TS11-5: stderr tardio;
- R-TS12-2: aborto depois do EOF;
- R-PY10-1: corrida natural do PY10.B04;
- R-PY13-5: corrida natural do PY13.B17.

Seguem registrados como abertos, sem plano. O lado forçado foi observado só em três
deles:

- R-PY10-1, com o bloqueio do loop no 2B;
- R-PY13-5, com a ordem forçada no 2B-PY13E e no C3-PY13ER;
- R-TS10-4, só por injeção de falha no 2A.

R-TS11-3, R-TS11-5 e R-TS12-2 não têm lado forçado observado (`forced_side_observed`
no v6).

### Já decidido: perfil distribuído

As decisões Q1, Q2 e Q3 já foram tomadas, então estes itens não pedem decisão nova:

- os 11 contratos abertos: PY19, PY20 e PK01 a PK09;
- os resíduos R-TS01-3, R-TS05-2, R-TS09-3, R-PY02-2, R-PY02-3, R-PY02-4, R-PY05-3,
  R-PY08-2 e R-PY16-2;
- os restos do v5 que já iam ao perfil distribuído: PY01 (tempo real de inicialização e
  KeyboardInterrupt no init), PY06 (CLI real no lugar do peer), PY09 (sobrecarga e sleep
  reais) e PY11 (início versus junção no servidor).

A especificação desse perfil está em andamento em
`../sdk-distributed-profile-spec/`, outra unidade. Esta unidade não a leu como entrada
nem a editou.

Duas ressalvas:

- Se algum desses itens exigir turn real, com chamada a modelo, ele passa ao gate T4
  separado que a Q3 cita. É o caso possível do R-PY16-2.
- No linux-x64, PY20, PK01, PK03, PK04 e PK07 só se cobrem em parte. As outras
  plataformas ficam na linha "Plataforma" abaixo.

### Exige decisão nova

| Grupo                                               | Resíduos                                                                                                       | Quem decide e o que falta                                                                                                                                                                                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Capacidade nova de harness                          | R-TS03-2, R-TS03-3, R-TS10-1, R-TS10-2, R-TS10-3, R-TS11-4, R-TS11-6, R-TS12-3, R-TS12-4, R-PY13-6, R-PY18-2   | Ficaram fora da continuação 3 por regra da unidade, não por decisão do usuário. Exigem unidade própria que especifique a capacidade, autorizada pelo Lead; hoje a regra do coordenador nega capacidade nova. Se o mecanismo mudar a postura de contenção, também T3 do usuário |
| Testemunha privilegiada do TS12                     | R-TS12-5 (término do filho pré-abortado, NOT_WITNESSED)                                                        | Usuário: rever a Q4, negada em 19/10/2026, ou levar a um perfil de plataforma                                                                                                                                                                                                  |
| Outras versões de dependência                       | R-TS12-6 (Node), R-PY18-3 (pydantic)                                                                           | Usuário: Q5, aquisição com rede, não autorizada                                                                                                                                                                                                                                |
| Gate T4 (turn real, chamada a modelo ou login real) | R-PY13-8 (timeout real de 30 s), R-PY14-2 (ordenações reais do servidor), R-PY17-2 (login real)                | Usuário: gate T4 próprio, fora deste plano                                                                                                                                                                                                                                     |
| BUILD nativo e portas duráveis                      | R-PY05-4, R-PY10-2, R-PY12-2, R-PY13-7, R-PY14-3 e o PY07 (cenário governado EQ02/SPEC0239)                    | BUILD nativo: SPEC0239 aprovada, BUILD não autorizado; depende de 0029 → 0030 → 0031                                                                                                                                                                                           |
| Plataforma                                          | R-PY02-5 (PATH no Windows), o PK03 (Windows) e as outras cinco plataformas do PY20, do PK01, do PK04 e do PK07 | Acesso a outras plataformas; só linux-x64 é local                                                                                                                                                                                                                              |

Mudança em relação ao HOW v2: lá, a injeção de falha de fs e do lado Node estava em "O
que cabe sem decisão nova". Aqui fica em "Exige decisão nova", porque é mecanismo novo
de harness e precisa de unidade própria autorizada.

### Fechados sem observação

Estes resíduos estão registrados no v6 e não pedem trabalho:

- R-PY04-1: não há default diferente de None nos modelos do pin.
- R-PY15-2: inalcançável pela API pública do pin.
- R-TS11-2: já observado no 2A.

## Ordem proposta

1. **Perfil distribuído no linux-x64.** Já tem decisão (Q1 a Q3) e está em
   especificação em outra unidade. É o próximo passo com ganho real de contratos: os 11
   abertos.
2. **Continuação 4 do perfil de fonte, pequena e opcional,** depois do C32-ADM/R1-F01
   inteiro e dos outros pré-requisitos. Teria três itens:
   - a parte do PY13.B17 (R-PY13-4);
   - o escopo aberto do R-PY18-1;
   - o lado do `os.environ` do PY02.B02 e do PY02.B07 (V6-PY02-ENV).

   Nenhuma linha muda de status. O Lead decide se vale uma unidade própria ou se esses
   itens entram no próximo SPECIFY que reusar a pilha Python. A
   [próxima unidade](next-task.json) registra as opções.

3. **Pacote de decisão para o grupo "Exige decisão nova",** só se o usuário ou o Lead
   quiserem avançar nesses itens. Nenhum bloqueia os itens 1 e 2.

## Limites

Observação de cliente não é paridade. Recibos funcionais e crédito de paridade seguem
em 0. As 509 obrigações do catálogo continuam `NOT_RUN`. A SPEC0239 foi aprovada pelo
usuário
([decisão](../../g04/native-journey-recovery-plan/user-decision-20261018.json)), mas o
BUILD nativo segue não autorizado nesta trilha.
