# REM21-014 — DISCOVERY

## Identidade

- task: `REM21-014`;
- achado: `A21-F16`;
- origem: `AUD20-015` e auditoria consolidada
  `0566_comprehensive_repository_audit_2026-09-21.md`;
- autorização: `G21-1`, somente local, sintética e descartável;
- dependências verificadas: `REM21-005` e `REM21-008` concluídas localmente;
- produção: `NO_GO`.

## Baseline observado

O repositório já possui uma base visual útil, mas a qualificação vigente não
fecha o achado `A21-F16`:

- `playwright.config.ts` declara somente o projeto `chromium`;
- o web server da suíte E2E injeta explicitamente
  `VITE_CVG_WEB_IDENTITY_MODE=simulation` e
  `VITE_CVG_CONTROLLED_TEST=true`;
- `tests/e2e/ux-accessibility.spec.ts` cobre axe, teclado, overflow, estados de
  erro/vazio, troca de tenant e reduced motion, mas edita
  `ID do operador`, `Papel operacional` e `Tenant ID` no browser;
- a checagem axe filtra apenas violações `serious` e `critical`; violações
  `moderate` não são bloqueantes;
- o workflow instala somente Chromium e o gate E2E não tem um relatório
  específico para uma matriz trusted de browsers;
- Firefox e WebKit estão disponíveis nesta estação, porém nunca foram
  executados pelo contrato vigente;
- a cobertura unitária de `REM21-005` já prova sessão confiável, expiração,
  logout, foco de reautenticação e ausência de headers de simulação, mas isso
  ainda não foi exercitado no navegador com a matriz declarada.

O baseline local Chromium existente passou `6/6` no arquivo de UX. Esse fato é
somente caracterização: não promove a evidência antiga a qualificação de
browser, não prova sessão confiável e não fecha o achado.

## Risco e fronteira

O risco principal é confundir um shell visual correto com autoridade de browser
qualificada. Uma suíte pode passar enquanto a identidade é autoafirmada por
headers editáveis, enquanto um browser declarado nunca foi executado, ou
enquanto uma violação axe moderada fica invisível. O contrato deve usar a
composição trusted já implementada, com token assinado sintético, cookie de
sessão HttpOnly e store em memória descartável. O token é um fixture local,
não uma IdP real nem autoridade produtiva.

## Decisão de discovery

Qualificar uma suíte dedicada `REM21-014` em configuração separada da suíte
histórica:

1. declarar explicitamente Chromium, Firefox e WebKit;
2. iniciar API e web em modo `trusted`, com key ring sintético e session store
   local, sem headers de identidade editáveis;
3. provar login/bootstrap, expiração, reautenticação, logout, recovery, role
   authorization, isolamento de tenant e limpeza de estado antigo;
4. executar axe WCAG 2A/2AA bloqueando qualquer impacto `moderate`, `serious`
   ou `critical`, além de teclado/foco, contraste, reduced motion e overflow;
5. emitir report bound a `runId`, `candidateId`, Node 22, browsers declarados,
   `production=false` e `realData=false`, rejeitando skips e resultados
   parciais;
6. conectar o report a um gate CI separado e instalar os três browsers no
   workflow.

## Fora do escopo

Não entram IdP, provider, canal, dados reais, cookies de produção, usuários
reais, teste de dispositivo físico, visual signoff humano, disponibilidade
externa, confirmação/cancelamento/reagendamento de consulta ou qualquer ação
clínica, financeira ou de prontuário. A matriz considera os três browsers
Playwright instaláveis no ambiente local/CI; nenhuma exclusão de browser é
necessária nesta rodada. Se o CI não conseguir instalar um browser, o gate
falha e a limitação deve ser registrada, nunca convertida em skip.
