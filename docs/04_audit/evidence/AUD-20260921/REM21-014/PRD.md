# REM21-014 — PRD

## Objetivo

Fechar a qualificação local de UX, acessibilidade e suporte de browser para o
console web sem aceitar autoridade de operador simulada por campos ou headers.
O resultado deve dizer exatamente quais browsers foram executados, quais
journeys passaram e quais limites continuam externos.

## Usuários e resultado

O operador de homologação precisa conseguir usar o console com teclado,
contraste legível e reduced motion, perceber loading/erro/expiração e recuperar
uma sessão sem ver dados de outro tenant. A equipe de engenharia precisa de um
gate repetível que falhe quando um browser declarado não executa ou quando uma
violação de acessibilidade moderada ou maior aparece.

## Requisitos de aceite

1. A matriz declarada contém `chromium`, `firefox` e `webkit`; cada browser
   executa pelo menos uma spec e termina com `passed`, sem `skipped`, `todo`,
   `flaky` ou browser ausente.
2. A composição qualificada roda com `VITE_CVG_WEB_IDENTITY_MODE=trusted` e
   `CVG_IDENTITY_MODE=trusted`; o browser obtém uma sessão por bootstrap
   assinado sintético e cookie HttpOnly. Nenhuma spec qualificada edita
   operador, papel ou tenant para obter autoridade, nem envia
   `x-operator-id`, `x-operator-role`, `x-tenant-id` ou token bruto após o
   bootstrap.
3. Login/bootstrap, logout, sessão expirada, foco de reautenticação e recovery
   com novo bootstrap passam em cada browser declarado.
4. Operator, Approver, Supervisor e Admin preservam as affordances de
   autorização do console; a UI não oferece ação sensível habilitada para um
   papel sem permissão. O payload usado para criar estados da UI é sintético e
   não altera a autoridade da sessão.
5. A troca de tenant por rotação de sessão remove o snapshot anterior e não
   deixa identidade ou dados do tenant A na tela do tenant B.
6. Axe com tags WCAG 2A/2AA bloqueia toda violação de impacto `moderate`,
   `serious` ou `critical`; o report também registra qualquer `minor` para
   revisão. A suíte prova contraste, foco visível, skip link, keyboard-only,
   reduced motion e ausência de overflow horizontal nos viewports declarados.
7. O report é verificável offline, ligado ao mesmo `runId`/`candidateId` do
   gate, Node 22, `production=false`, `realData=false`, browsers executados e
   resultado por browser. A ausência do report ou qualquer binding incorreto
   falha fechado.

## Não requisitos

Não há claim de cobertura de IdP, browser físico, leitor de tela completo,
dispositivo móvel real, performance produtiva, retenção ou disponibilidade de
serviços externos. A fixture de sessão em memória é apenas local e descartável.

## Critério de decisão

`VERIFIED_LOCAL / FINAL_CERT_DEFERRED` somente depois de dois runs do gate com
o mesmo `runId` e `candidateId`, os três browsers passando e evidência
hashada. A barra integral, I1, freeze, signoff e produção continuam `NO_GO`.
