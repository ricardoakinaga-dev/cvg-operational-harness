# 0139 — SPEC curta: fonte determinística no E2E visual

- Task: PR-009, fatia 2 de [0356](../03_build/0356_production_backlog_2026-09-26.md).
- Trilha: T2 da [constituição](../07_agents/AGENTS.md); correção local e reversível sem alteração de contrato público. A instrução de implementar o planejamento autoriza esta fatia; produção continua `NO_GO`.
- Estado: `BUILD_LOCAL_AUTHORIZED` para a regra abaixo.

## Recon

O Verify do PR #1, run `36290974112`, passou os gates anteriores e falhou no screenshot `console-mobile.png`: 9.077 pixels diferentes (~3%) nas três tentativas. Reproduzi em Ubuntu Noble isolado e comparei baseline, imagem atual e diff. O layout, cartões e medidas coincidem; os textos aparecem com peso regular no fallback, enquanto o baseline apresenta títulos em negrito. `apps/web/src/styles.css` pede pesos 750/850, começa por `Inter` sem fonte empacotada e declara `font-synthesis: none`. Em ambiente sem a face de peso requerida, o navegador fica impedido de sintetizar peso. Permitir síntese de peso reduziu o diff estável para 7.206 pixels, ainda acima do limite. `fc-match Inter` resolve para Noto Sans no host e WenQuanYi no Ubuntu, confirmando que a fonte de fallback é diferente entre ambientes.

## Regra e aceite

1. Empacotar a fonte variável Inter como dependência do web e carregá-la localmente antes de `styles.css`; usar a família carregada no CSS. Permitir síntese de peso apenas como fallback para eventual falha da fonte. Preservar cores, espaçamentos e o limite visual `maxDiffPixelRatio: 0.02`. A fonte deve ser self-hosted, versionada e licenciada pelo próprio pacote.
2. Reexecutar o E2E no Ubuntu isolado e no host, com os três viewports; confirmar que a comparação visual e as asserções de overflow, foco e tamanho passam. Atualizar snapshots apenas se a nova face tornar o baseline anterior incompatível, após inspeção visual e sem tocar evidência histórica em `docs/04_audit/evidence`.
3. Conferir que os quatro PNGs históricos da SPEC 0137 continuam idênticos. Rodar os gates T2 e reemitir certificação para o candidato atualizado; Verify e Security remotos devem passar no mesmo SHA antes de encerrar PR-010/011.
4. Registrar a dependência da fonte no contrato de estrutura 0305, preservando
   as demais permissões e proibições da aplicação web.

## Execução e provas

- `@fontsource-variable/inter@5.3.0` instalado no workspace web, sob licença
  OFL-1.1; `main.tsx` importa `wght.css` antes do CSS da aplicação. A família
  `Inter Variable` passou a ser a primeira do tema; `font-synthesis: weight`
  serve apenas como fallback.
- As imagens mobile e tablet foram atualizadas no Ubuntu Noble isolado depois
  de inspeção visual. A execução seguinte, sem atualização de snapshot, passou
  2/2 no container com o mesmo limite de 2%. No host, `npm run test:e2e`
  passou 12/12 com os novos snapshots.
- Os quatro PNGs de `AUD19-013` conservaram seus SHA-256:
  `56a6085a74b8fca22e060cc85c01e3ffc869e9d4954a024db53b738c6aa14d99`,
  `7746703eae181611182d39079f814bd06a1e049c284d73891ca9834f3ee39c81`,
  `67b9b69886a33cf6379b8d6c2dd92a3df528928be4c3e545513c3c4a90bf6c58`,
  `73024c3422d5f3dc575dd1ba6c4220500c7d6d20ad9de4fd556618fcbdbd949b`.
- A primeira suíte completa falhou somente em
  `tests/repository-structure.test.js`: a dependência da fonte faltava no
  allowlist de 0305. O contrato foi atualizado para incluir apenas
  `@fontsource-variable/inter`; as demais 2.305 asserções passaram. O gate
  completo será repetido.
- Typecheck, lint, suites PostgreSQL, certificação e Verify remoto do novo
  candidato serão registrados nos ledgers após a execução. Esta fatia não
  encerra JUnit/runId nem jornadas da PR-009.
