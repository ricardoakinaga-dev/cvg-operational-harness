# SPEC-PR204-001 — contrato de configuração no boot de produção

- Trilha: **T3** (fronteira de segurança, identidade e configuração pública).
- Estado: `BUILD_T3_APPROVED_USER / SYNTHETIC_ONLY` em 27/09/2026. BUILD
  controlado autorizado; deploy, dado real e promoção não autorizados.
- Task: [PR-204](../03_build/0356_production_backlog_2026-09-26.md).
  Recon: [AUD-0581](../04_audit/0581_production_boot_configuration_gap_2026-09-27.md).
- Baseline de produto: [PRD 0027](../01_prd/0027_harness_refoundation.md)
  exige governança, approval e falha explícita; [plano 0354](../03_build/0354_production_executive_plan_2026-09-26.md)
  exige um digest e uma configuração para o GO. O novo consumidor ainda
  depende do discovery PR-101, então esta fatia corrige a fronteira técnica
  sem selecionar produto, provider, canal ou tenant real.

## Problema e contrato alvo

`parseEnv` valida parte do perfil de produção, mas a API descarta seu
resultado; o builder reinterpreta `process.env` e opções. O worker tem
parsers próprios e continua proibido em produção. A web congela flags no
bundle, sem gate que impeça um artefato de simulação. As quatro flags
`ENABLE_REAL_*` não autorizam nem compõem capacidades. `OPENAI_API_KEY` é
exigido mesmo sem provider ativo. A [auditoria 0581](../04_audit/0581_production_boot_configuration_gap_2026-09-27.md)
separa o que foi reproduzido no parser do que permanece hipótese de boot.

O contrato alvo tem **um snapshot imutável e tipado por processo** (API e
worker) e **um manifesto validado por build web**. Todas as decisões de
segurança consomem esse snapshot; nenhuma segunda leitura de variável de
ambiente ou opção injetada pode enfraquecer um invariante de produção.
Opções de teste continuam possíveis sob `NODE_ENV=test`, com tipo ou factory
próprios; passar `production` junto com override inseguro deve abortar
antes de abrir listener, pool, browser endpoint ou poller. Um erro informa
o nome do campo e a regra, sem segredo, token ou URL com credencial.

## Matriz de processo e artefato

| Perfil            | Exigência de produção                                                                                                                                                                                                                                                                                                                                                                     | Comportamento de falha                                                                                                                                              |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API               | `API_PERSISTENCE_MODE=postgres`, `POSTGRES_RLS_ENFORCEMENT=true`, `OUTBOX_DURABLE_INBOUND=true`, `API_REQUIRE_HTTPS=true`, origem HTTPS explícita permitida, identidade `trusted` explícita, store/issuer autorizados e preflight de roles da [SPEC 0144](0144_trusted_operator_session_production.md). O modo de serving recebe só credenciais runtime; migration ocorre em job externo. | Configuração ausente, contraditória ou override inseguro aborta antes de `listen`; falha de preflight aborta antes de aceitar tráfego.                              |
| Worker            | `NODE_ENV` deve ser explícito e válido em qualquer execução. Modos controlados exigem exatamente `development` ou `test` e continuam recusando `production`. Um futuro worker produtivo precisa de SPEC/PRD de provider, canal e efeitos próprios, além de RLS, fila durável, identidade de tenant e policy/approval.                                                                     | Perfil ausente/inválido, seletor ausente/desconhecido ou tentativa de modo controlado em produção aborta antes de polling. PR-204 não liga provider nem canal real. |
| Web               | Bundle de produção fixa identidade `trusted`, `VITE_CVG_CONTROLLED_TEST=false`, sem bootstrap de simulação nem segredo embutido. Origem da API e política HTTPS seguem a [SPEC 0150](0150_cross_origin_operator_console.md) após sua aprovação.                                                                                                                                           | Build/empacotamento falha se flags de teste/simulação estiverem presentes; um bundle assim não recebe selo de candidato.                                            |
| Gateway de modelo | Segredo é exigido somente se um adapter real autorizado for composto. A composição continua determinística enquanto D-05/PR-501 estiverem abertos. A composição produtiva de provider externo não pode usar `requiresApiKey: false` sem método alternativo de autenticação aprovado e testado.                                                                                            | Chave presente não ativa provider; provider externo selecionado sem autenticação válida aborta antes da primeira requisição.                                        |

Para identidade OIDC, exigir os segredos e keyrings **efetivamente usados**
pelo caminho selecionado: state/cookie pendente, rate limit distribuído e
credenciais do client conforme a SPEC 0144. O composition root deve escolher
um único caminho de autenticação. Com OIDC configurado, compor o resolver de
sessão OIDC antes da guarda de identidade; não criar nem exigir o resolver
HMAC de bootstrap. Sem OIDC, exigir o contrato HMAC legado somente nos
perfis em que ele ainda é permitido; em produção, OIDC corporativo e MFA são
obrigatórios para GO. A ausência de qualquer segredo efetivamente usado
continua falha fechada. Nenhum valor secreto entra no manifesto de build,
log de erro ou métrica.

## Flags e migração de segredo

1. `ENABLE_REAL_CHANNELS`, `ENABLE_REAL_RAG`, `ENABLE_REAL_PAYMENTS` e
   `ENABLE_REAL_MEDICAL_RECORDS` com valor `true` devem falhar no perfil de
   produção enquanto não houver composição, aprovação e prova próprias.
   `false` não é prova de que outro caminho de runtime esteja desligado:
   auditar também os pontos de composição. Valores inválidos falham no
   parse, sem conversão permissiva. Pagamentos, prontuário e ação clínica
   definitiva continuam fora do escopo do programa mesmo após esta SPEC.
2. Introduzir `MODEL_PROVIDER_API_KEY` como nome neutro. No release de
   compatibilidade B1, aceitar `OPENAI_API_KEY` isolado ou os dois nomes
   apenas quando os valores forem iguais, sem registrar/comparar valores em
   logs. Nome novo isolado também é válido em B1. Em B2, após drenagem
   comprovada de todas as réplicas antigas, recusar o nome legado em
   produção; em dev/test, mantê-lo por um ciclo com aviso **sem valor**.
   Rejeitar nomes coexistentes com valores diferentes em qualquer perfil.
   Não exigir chave quando o provider real não estiver composto; quando
   estiver, exigir a nova chave vinda de cofre, sem default nem placeholder
   e rejeitar `requiresApiKey: false` para provider externo sem autenticação
   alternativa aprovada. Atualizar `.env.example`, documentação e testes no
   mesmo BUILD.
3. A configuração efetiva e o bundle devem expor somente um resumo não
   sensível verificável (versão do schema, perfil, capacidades autorizadas,
   IDs de keyring e digest de campos não secretos). Nunca hash simples de
   segredo como suposta redação: valores de baixa entropia poderiam ser
   adivinhados. O certificado vincula esse resumo ao mesmo digest de imagem
   e ao ambiente de staging, sem promover um valor local a produção.

## Implementação e rollout propostos

1. Criar builders puros de configuração por processo e validação de build
   web. `main.ts` recebe o snapshot e o passa ao composition root; os
   módulos deixam de reler `process.env` para decisões de segurança.
   Opções internas não substituem flags de produção; se forem necessárias
   em teste, a factory de teste deve ser explícita e indisponível no
   entrypoint publicado.
2. Preservar os guards e preflights mais restritivos existentes, inclusive
   rejeição de DDL/auto-migration no serving e de IdP local em produção no
   branch OIDC. Integrar esse branch depois da liberação da PR-L04 antes de
   certificar; a implementação da PR-204 deve comparar a matriz com a API
   integrada, não apenas com o checkout anterior.
3. Rollout do nome de segredo: A é o binário atual, que exige
   `OPENAI_API_KEY` em produção. B1 aceita a variável antiga e a nova;
   primeiro publicar B1 usando apenas a antiga, depois injetar ambas com
   valor igual pelo cofre e verificar todas as réplicas. Só após drenar A
   e certificar B1, remover a variável antiga e iniciar B2, que a recusa.
   O rollback de B2 volta somente a B1, sem reintroduzir A. Um rollback
   até A exige drenar B1/B2, restaurar a configuração antiga e provar boot
   antes de aceitar tráfego; não é canary simultâneo. Testar cada transição
   e o rollback em staging sintético, inclusive conflito entre valores.
   Não publicar bundle web ou worker produtivo até seus gates próprios;
   artefato de simulação nunca é candidato.

## Negativos e critérios de aceite

- Testes de tabela para cada campo obrigatório e cada `ENABLE_REAL_*`:
  ausente, inválido, `true` sem capacidade, combinação contraditória e
  placeholder de segredo. Provar também que `false` não suprime um adapter
  real selecionado por outro caminho.
- Testes **do entrypoint publicado** em Node 22, com ambiente e opções
  divergentes: PostgreSQL ausente, RLS desligado, inbound não durável,
  identidade implícita/simulação, HTTPS/origem inválidos, credencial DDL no
  serving, keyring necessária ausente e preflight PostgreSQL falho. Cada
  caso encerra antes de listener ou poller, sem logar segredo. O positivo
  usa apenas banco/IdP sintéticos descartáveis. O positivo OIDC deve subir
  sem `CVG_OPERATOR_IDENTITY_KEYRING`, com todos os segredos OIDC realmente
  usados; retirar qualquer um deles deve abortar. No perfil de produção, o
  emissor sintético HTTPS deve exercitar o contrato corporativo futuro, não
  habilitar o Keycloak local proibido pela SPEC 0144; esse positivo depende
  da integração PR-301 correspondente antes do aceite final.
- Testes de cada seletor de worker sob `production` e de cada modo
  controlado com `NODE_ENV` ausente ou inválido: todos recusados antes do
  runner. Só `development` ou `test` explícitos permitem perfil controlado.
  Positivos com fixtures garantem que esses dois perfis continuam operáveis.
  Um futuro modo real exige gate novo; esta SPEC não o declara pronto.
- Testes do **bundle final**, não só de uma função de config: flags de
  simulação ou `VITE_CVG_CONTROLLED_TEST=true` impedem build de produção;
  bundle aprovado não contém token de bootstrap, segredo ou fallback para
  API relativa quando a SPEC 0150 estiver em vigor.
- Testes de alias em A/B1/B2: nome antigo isolado, novo isolado, ambos
  iguais em B1, ambos diferentes rejeitados, antigo rejeitado em B2,
  rollback B2→B1 e retomada de A só após troca explícita de configuração.
  Cobrir provider ausente sem chave, provider externo sem autenticação,
  `requiresApiKey: false` externo sem método alternativo, erro e logs sem
  valor secreto.
- `typecheck`, `lint`, formatação, `npm test`, `test:postgres`, E2E,
  `skip:governance`, links/higiene e negativos de boot verdes em Node 22.
  Reemitir certificação e Verify/Security sobre o SHA **integrado** depois
  da PR-L04; conferir a configuração sem segredos do mesmo candidato.

## Gate

I1 (crítica independente somente leitura) rejeitou quatro pontos P1: perfil
ausente do worker, dependência HMAC antes da composição OIDC, transição de
segredo incompatível com rollback e override de autenticação do provider
externo. A revisão incluiu os negativos, a ordem da composição e o rollout
A/B1/B2 acima. I2, em contexto novo, retornou
`ACCEPT_SPEC_REVIEW_READY`; não executou testes nem aprovou BUILD.

O usuário aprovou explicitamente a SPEC 0151 para BUILD T3 em 27/09/2026,
com dados sintéticos, após I2 `ACCEPT_SPEC_REVIEW_READY`. O resultado do
BUILD e seus gates serão registrados separadamente; a aprovação não libera
deploy nem altera as decisões de produto abaixo.
A escolha do IdP corporativo, D-05/PR-501, política de dados, SPEC 0150,
infraestrutura e decisão humana T4 de release continuam gates separados.
Aceite local desta SPEC ou do BUILD não satisfaz as 13 condições de GO do
[plano 0354](../03_build/0354_production_executive_plan_2026-09-26.md).
