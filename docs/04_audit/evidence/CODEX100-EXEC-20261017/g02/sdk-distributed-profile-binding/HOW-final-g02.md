# HOW final do DX100-G02 — perfis de fonte e distribuído

Unidade `DX100-G02:BIND-SDK-DISTRIBUTED-PROFILE`, T1 documental, 20/10/2026. Este texto
resume o estado do cartão DX100-G02 depois dos dois perfis de observação do SDK. Os
números vêm do [mapa v7](coverage-observed-v7.json) e da
[revisão das lacunas v7](gaps-review-v7.json). O
[mapa v6](../sdk-continuation-3-binding/coverage-observed-v6.json) e o
[HOW v3](../sdk-continuation-3-binding/HOW-next-profile-v3.md) seguem intocados.

Observação de cliente não é paridade: 0 recibos funcionais e 0 crédito de paridade. Os 509
registros do catálogo seguem `NOT_RUN`.

## Estado final do mapa

- Os 44 contratos fonte estão `OBSERVED_CLIENT_PARTIAL`; nenhum segue
  `OPEN_REQUIRED_FUTURE_PROFILE`.
  - 33 vêm do perfil de referência, que é a fonte do SDK do pin contra peers sintéticos
    (mapas v1 a v6).
  - 11 passam a observados com o perfil distribuído keyless: PY19, PY20 e PK01 a PK09.
  - O PY02 tem observações nos dois perfis.
- Nenhum contrato cobre o requisito inteiro.
- O perfil distribuído consumiu 16 casos `PASS_CLIENT_OBSERVATION`: 10 do DP-1, 1 da DP-1R
  (o DP-PK07B) e 5 do DP-2.
  - Os 45 braços mirados ficaram distinguidos, com 50 de 50 partes creditadas.
  - O DP-PK07A (`INVALID_CAPTURE` por defeito de fixture) não foi consumido; o DP-PK07B o
    substitui por decisão do Lead.
- Todo resultado do perfil distribuído leva o pin 0.153.4 e `NO_BUILD_LINK_DECLARED`. Isso
  vale para observações, braços e resíduos resolvidos. A Q1 adotou esse pin como separado da
  fonte.
  - Nenhum vínculo de build liga os artefatos publicados à fonte do pin nem ao CLI
    compilado.
  - Há um vínculo de dependência, não de build: o wheel A1 é o que o `uv.lock` da fonte do
    pin prescreve (sha256 igual; condição da Q1).
- Ressalvas que valem para o crédito:
  - o PY19.B02 vale só por `api.steps_exact`;
  - a forma `REAL_CLI_KEYLESS` do DP-PY02P vem da declaração do caso;
  - o PK07.B03 se apoia no stderr do passo 10 do DP-PK07B, com caminho e sha registrados. A
    condição "win32 (.exe)" desse braço só é vista pelos caminhos do PK07.B01;
  - `child.program_followed` é predicado de sanidade;
  - no PK06 e no PK08 vale a leitura corrigida do R2-F03 do DP-1: a espera de 5 s do
    NO_SIGNAL não foi exercida nos casos, e a checagem a posteriori cobre só o primeiro
    nível de `/work`;
  - o vocabulário D3 da C3-2 não é qualificado pelo DP-2.
- Lacunas: as seis seguem `OPEN`.
  - GAP-PROVENANCE (3/3) e GAP-PLATFORM-PACKAGING (12/12) mudam o rótulo de progresso
    para observação parcial no perfil distribuído, com o mesmo rótulo nas duas.
  - As outras quatro não mudam.
- Resíduos do plano distribuído (48): 14 resolvidos, 10 fechados sem observação
  (inalcançáveis ou sem artefato no pin) e 24 abertos. Pedem decisão nova 20: os 18
  abertos que dependem de decisão e os 2 sem artefato no pin, que só uma escolha de outro
  pin destravaria.
- Resíduos do v6 com destino "perfil distribuído" (9):
  - 3 resolvidos: R-PY02-2, R-TS01-3 e R-TS09-3. Os dois de TypeScript foram observados no
    SDK publicado, não na fonte.
  - 1 parcial: R-PY02-4. O lado do PY02.B07 (codex_bin explícito com codex-path instalado)
    não foi mirado por caso.
  - 5 abertos. O R-PY05-3 teve o destino corrigido para o CLI compilado do pin (versão
    0.0.0), porque o binário publicado se declara 0.153.4.

## O cartão G02 pode fechar?

Ainda não. O recorte SDK do G02 terminou o que estava planejado: os perfis de fonte e
distribuído estão ligados. O que resta desse recorte cabe sem decisão nova do usuário ou
depende de uma das decisões listadas mais abaixo. O cartão, porém, tem um aceite mais amplo
que o recorte SDK e depende do DX100-G01.

O aceite do cartão no [0386](../../../../../03_build/0386_backlog_paridade_codex.md) está
assim:

| Aceite do cartão                   | Estado                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Fonte e executável vinculados      | Sustentado. Referência: CLI compilado do pin 8d9f6466, ELF atestado ([aceite](../../g02-reference-acceptance.json)), e SDK da fonte. Distribuído: pin 0.153.4 por decisão explícita (Q1), sem vínculo de build e com o vínculo de dependência A1↔`uv.lock`.                                                                                                        |
| Cada requisito com oráculo e dono  | Só no recorte SDK: 44 contratos com oráculo (G01) e observação parcial, e cada item aberto com destino e quem decide. No cartão, "requisito" é o do catálogo (recibo por requisito; 487+22 `NOT_RUN`). O G01 tem 54 eixos sem cenário próprio, os oráculos i64 estão `INCOMPLETE` e os 11 edges de ID seguem `OPEN` ([replan](../id-settlement-replan/REPORT.md)). |
| Desconhecidos persistem sem PASS   | Sustentado: 0 recibos; resíduos abertos e lacunas `OPEN` registrados.                                                                                                                                                                                                                                                                                              |
| Driver sem credenciais nem sessões | Sustentado. Todos os drivers e observações foram keyless e sem rede. As aquisições usaram rede autorizada (Q2), sem credencial.                                                                                                                                                                                                                                    |

O "Como" do cartão pede também testes reais ou keyless por família, plataformas e acessos
T4. O plano de runners e acesso da próxima seção é a proposta desta unidade para isso.

Para fechar o cartão, o Lead precisa cumprir cinco condições. Nenhuma depende de decisão
nova do usuário:

1. Fechar o DX100-G01 antes, que segue `IN_PROGRESS` com 54 eixos `OPEN`. A alternativa é
   registrar por que o G02 pode fechar antes da sua dependência.
2. Aceitar um destino para os oráculos i64 `INCOMPLETE` e os 11 edges de ID do wire. A
   sugestão é o DX100-A01, dono do protocolo app-server.
3. Aceitar, ou trocar, o plano de runners e acesso por família abaixo.
4. Dar dono aos itens que cabem sem decisão nova: uma unidade posterior do G02 ou os cartões
   donos, conforme o mapa da seção "O que fica para outros cartões".
5. Ancorar os seis commits das admissões DP e levar à main as pastas que estão fora de
   qualquer ref.
   - Os commits são 9bb9184cc, 3ca3fd3b0, 0ab937df5, 44bb8b4d8, c0e877e16 e c9b9650bf. A
     âncora pode ser ref, tag ou bundle registrado, por decisão do Lead.
   - As pastas fora de ref são: `sdk-continuation-3-1-admission`,
     `sdk-continuation-3-2-admission`, `sdk-continuation-3-binding`,
     `sdk-distributed-acquisition`, `sdk-distributed-profile-spec`, as três admissões DP e
     esta unidade.
   - As demais pastas g02, inclusive o v5, já estão em origin/main `24b1bbc8`.

## Plano de runners e acesso por família

| Família                                   | Runner já observado                                                                                     | Acesso que falta                                                                                                                  | Quem decide                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| SDK Python (PY01 a PY18)                  | Fonte do pin, keyless, contra peers sintéticos (CPython 3.12.3, pydantic 2.13.4)                        | Turn, login e modelo reais (T4); BUILD nativo; outras versões de pydantic (Q5); capacidade nova de harness                        | Usuário; Lead na capacidade |
| Empacotamento Python (PY02, PY19 e PY20)  | Perfil distribuído keyless em linux-x64: wheel e binário publicados 0.153.4, contidos                   | Outras plataformas; aquisição e TLS do bootstrap; instaladores; outro pin ou vínculo de build                                     | Usuário                     |
| SDK TypeScript (TS01 a TS15)              | Fonte do pin, keyless (Node v24.20.0); resolvedor também no SDK TS publicado                            | Injeção de falha de fs e do lado Node (capacidade nova); testemunha privilegiada (Q4); outras versões de Node (Q5)                | Lead; usuário na Q4 e na Q5 |
| Wrappers e resolvedores npm (PK01 a PK09) | Perfil distribuído keyless em linux-x64, com árvores publicadas, filhos sintéticos e shim de plataforma | Windows, macOS e arm64 reais; instaladores; proxy real com provider (T4); assinaturas e attestations (aquisição); testemunha (Q4) | Usuário                     |
| Protocolo e wire (11 edges de ID, i64)    | CLI compilado do pin, keyless                                                                           | Destino dos oráculos `INCOMPLETE` e dos edges                                                                                     | Lead                        |

## O que fica para outros cartões

- **DX100-D01** (SDK público e tipos de eventos, T3): GAP-PY-API e GAP-TS-LANGUAGE. Faltam
  a qualificação com recibo e os ciclos de vida reais.
- **DX100-A01** (envelopes app-server, T3): GAP-PY-RPC e GAP-GENERATED. Faltam a semântica
  real do protocolo e os modelos gerados frente ao runtime. Pela condição 2, também os 11
  edges de ID e os oráculos i64.
- **DX100-Z02** (empacotamento por plataforma, T3 e T4): GAP-PROVENANCE e
  GAP-PLATFORM-PACKAGING. Faltam assinatura e attestation, vínculo de build, outras
  plataformas, instaladores e bootstrap.
- **BUILD nativo** (SPEC0239 aprovada; cadeia 0029, 0030 e 0031 não autorizada): os 5
  resíduos `OPEN_NATIVE` do v6.
- **Recibos por requisito**: ficam com os cartões de qualificação. O G02 não emite recibo.
- **Itens que cabem sem decisão nova**, se o G02 fechar antes deles. Eles vão para o cartão
  dono da lacuna do contrato:
  - para o Z02: R-PY02-4 (lado do PY02.B07), R-PK02-2, R-PK05-3 e R-PK09-3;
  - para o A01: R-PY05-3, R-PY08-2 e R-PY18-1;
  - para o D01: R-TS05-2, V6-PY02-ENV e R-PY13-4.

## O que ainda cabe sem decisão nova do usuário

Estes itens precisam só do Lead. Enquanto houver unidade desta lista, o cache distribuído
deve ser mantido; apagá-lo pediria uma aquisição nova.

- **Perfil distribuído, unidade posterior:**
  - o lado do PY02.B07, com codex_bin explícito e codex-path instalado (R-PY02-4 do v6);
  - permissão negada no stat (R-PK02-2);
  - o marcador pnpm na raiz (R-PK05-3);
  - o bundle e o typecheck do SDK TS publicado (R-PK09-3);
  - a leitura com processo real (R-PY08-2) e a precedência dos overrides na CLI (R-TS05-2).
    Esses dois só valem se houver caminho keyless; se não houver, vão para o T4.
- **Perfil de referência com o CLI compilado do pin:** o ramo de runtime 0.0.0 do
  CheckoutCapabilities (R-PY05-3).
- **Continuação do perfil de fonte:**
  - a cópia do os.environ do driver (V6-PY02-ENV);
  - os modelos gerados restantes (R-PY18-1);
  - o known_bad "pular o cleanup" do PY13 (R-PY13-4). O registro de threads por
    `threading.local`, que é o pré-requisito, está na pilha Python do DP-2. Reusá-la pede
    requalificar antes o vocabulário D3, com as DIAG da C3-2, porque o DP-2 não o
    qualificou e nenhum crédito vem dele.

Sem caminho determinístico e sem plano ficam:

- 6 resíduos do v6;
- 2 do plano distribuído (R-PK02-3 e R-PK05-5);
- o ramo kill com filho lento, que não se induz sem falha injetada (R-PY02-4 do plano
  distribuído, igual ao R-PY02-3 do v6).

## Decisões do usuário que ainda destravariam algo

Cada item traz o ganho em resíduos, contratos e braços. Os braços contados são os que
ainda têm um lado aberto nomeado pelo resíduo; vários deles já estão distinguidos nas
outras condições. Os números vêm de `decisions_that_would_unlock` do v7.

1. **Gate T4.** Abrir turn, login, modelo ou credencial reais num perfil autorizado.
   - Ganho: 7 resíduos em 7 contratos (PK08, PY02, PY13, PY14, PY16, PY17 e PY19).
   - Braços: PY02.B11, PY13.B13 e PY19.B05.
2. **Plataformas.** Dar acesso a Windows, macOS e arm64, e adquirir os assets dessas
   plataformas.
   - Ganho: 6 itens em 6 contratos (PK01, PK03, PK07, PY02, PY19 e PY20). A chave PATH do
     Windows aparece nos dois planos.
   - Braços: PK03.B02, PK07.B03, PY02.B10, PY19.B04 e PY20.B04.
3. **Rever a Q4.** Permitir uma testemunha privilegiada (ptrace ou fanotify) só dentro da
   contenção.
   - Ganho: 3 resíduos em 3 contratos (PK06, PK08 e TS12).
   - Braços: PK06.B03 e PK08.B02, mais o término do filho pré-abortado do TS12.
   - Não alcança o R-PK02-3 nem o R-PK05-5. Produzir a mudança de fs entre as chamadas
     seria injeção, isto é, capacidade nova.
4. **Q5.** Autorizar outras versões de pydantic e de Node.
   - Ganho: 2 resíduos em 2 contratos (PY18 e TS12), sem braço nomeado.
5. **Aquisição nova com rede.** Trazer as entradas do bootstrap do PY20 e as assinaturas e
   attestations do registro.
   - Ganho: 3 resíduos em 2 contratos (PY20 e PK09).
   - Braços: PY20.B04 e PK09.B03.
6. **Identidade TLS de github.com no sandbox (T3).** Serve para o download do bootstrap e só
   faz sentido depois da aquisição acima.
   - Ganho: 1 resíduo no PY20 (PY20.B04).
7. **Instaladores e build.** Autorizar pip, npm, pnpm, bun e o build do wheel numa unidade
   própria.
   - Ganho: 3 resíduos em 3 contratos (PK04, PK05 e PY20).
   - Braços: PK04.B03 e PY20.B04.
8. **BUILD nativo da SPEC0239.** Autorizar a cadeia 0029, 0030 e 0031.
   - Ganho: 5 resíduos em 5 contratos (PY05, PY10, PY12, PY13 e PY14), sem braço nomeado.
9. **Outro pin.** Rever a Q1 e a Q2 e escolher uma versão em que o pacote Python
   openai-codex esteja publicado, com a aquisição dele.
   - Ganho: 2 resíduos no PY19 (R-PY19-4 e R-PY19-5).
   - Braço: PY19.B05.
10. **Vínculo de build.** Rever a Q1 e exigir build reproduzível da 0.153.4 a partir da
    fonte do pin.
    - Nenhum resíduo do plano o pede.
    - Ganho: troca o `NO_BUILD_LINK_DECLARED` dos 12 contratos do perfil distribuído e a
      fronteira de vínculo de build da GAP-PROVENANCE.
    - Os braços de identidade PY19.B05 e PK09.B03 passariam a julgar o vínculo, não só a
      versão.

Fica de fora uma decisão que não é do usuário. A capacidade nova de harness (injeção de
falha de fs e do lado Node) é decisão do Lead, numa unidade própria; o usuário só entra, por
T3, se ela mudar a postura de contenção. Ela renderia 11 resíduos em 6 contratos (PY13, PY18,
TS03, TS10, TS11 e TS12), com os braços TS03.B03, TS03.B05, TS10.B01, TS10.B03, TS10.B05,
TS10.B06, TS11.B05 e TS12.B03.

Nenhuma dessas decisões fecha uma lacuna sozinha. Uma lacuna só deixa `OPEN` com
qualificação e recibo de todo o requisito dos donos.

## Ordem da limpeza

As worktrees DP são hoje a única âncora dos seis commits das admissões: nenhuma ref os
contém. A limpeza segue esta ordem:

1. Ancorar os commits (condição 5).
2. Só depois disso, apagar as worktrees e os runtimes privados das unidades DP.
3. Manter o cache distribuído enquanto houver unidade da seção "O que ainda cabe sem decisão
   nova do usuário".
