# 0143 — SPEC curta: build completo antes do E2E em checkout limpo

- Task: PR-010, CI remoto e certificação reproduzível em
  [0356](../03_build/0356_production_backlog_2026-09-26.md).
- Trilha: T2 da [constituição](../07_agents/AGENTS.md); correção de build
  local sem alteração de contrato público ou efeito externo.
- Estado: `BUILD_LOCAL_AUTHORIZED` para a regra abaixo. Produção `NO_GO`.

## Recon

`npm run certify` no worktree limpo `aud0578-cert-20260927` passou os gates
format, typecheck, lint, build, unit (2.306 testes), cobertura, segurança,
startup e PostgreSQL. O E2E abriu o overlay do Vite: não encontrou
`@cvg/shared` importado pelo web. O workspace declara `dist/index.js` como
export, mas `npm run build` só executava typecheck e build web; não gerava
`packages/shared/dist`. No workspace de desenvolvimento esse diretório
existia de builds anteriores, ocultando a dependência do ambiente.

`npm run build:harness` em checkout limpo gerou o `dist` necessário; em
seguida, o mesmo E2E passou 12/12 sem mudar o código da aplicação. O CI
remoto executa `npm run build` no gate build, e a certificação também.

## Regra e aceite

1. `npm run build` deve executar typecheck, `build:harness -- --force` e build
   web nessa ordem, de modo que o E2E funcione após `npm ci` sem artefatos
   residuais e recupere saídas ausentes mesmo com cache incremental presente.
   Preservar os comandos internos existentes e as restrições do runtime.
2. Verificar o `build` em checkout limpo e `test:e2e` 12/12 em Node 22.
   Reexecutar certificação completa e `certification:verify` sobre candidato
   commitado, além de Verify/Security remotos no mesmo SHA.
3. Conferir que os quatro PNGs históricos AUD19-013 permanecem idênticos.
4. Ajustar o contrato `tests/workspace-scripts.test.js` para exigir a nova
   sequência do script `build`; a asserção antiga deve falhar antes do ajuste.

## Execução e provas

- Primeiro ensaio: `typecheck -> build:harness -> build:web` passou em Node
  22, mas ao mover `packages/shared/dist` para um backup fora do worktree e
  repetir o build, o cache incremental não recriou `dist/index.js`. O comando
  de build foi ajustado para forçar a emissão dos pacotes do harness.
- Segundo ensaio: `npm run build` com `--force` recriou
  `packages/shared/dist/index.js` e concluiu o bundle web com exit 0.
- O teste `tests/workspace-scripts.test.js` falhou na suíte local e no Verify
  remoto porque exigia o comando `build` antigo. A asserção foi atualizada
  para a sequência nova e o teste focado passou 2/2.
- No checkout limpo, `npm run build:harness` seguido de `npm run test:e2e`
  passou 12/12. A falha anterior do E2E era o overlay Vite para
  `@cvg/shared`, e não um defeito visual dos snapshots.
- Certificação completa do novo candidato, verificador e remoto pendentes.
