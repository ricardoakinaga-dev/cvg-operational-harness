# PAR-X01 fatia 1 — peças puras do serviço de subprocesso

Base: SPEC 0286 aprovada (recibo `human-decisions-19.json`, hash `6c15c089…`). Código em `packages/sandbox/src/process-service/`.

- `env.ts` (I2): mapa fechado por consumidor; nome só em maiúsculas (`http_proxy` e afins recusados pelo formato), nomes do perfil (`HOME`, `PATH`, `PWD`, `TMPDIR`, `LANG`, `LC_ALL`, `TZ`) e de carregador/injeção/proxy sempre recusados mesmo se a lista os trouxer; teto de entradas, de valor e total; valor UTF-8 sem NUL; cópia congelada; nunca lê `process.env`. `checkEnvAllowlist` valida a lista na composição.
- `limits.ts` (I7/I8): seis limites obrigatórios, inteiros seguros, dentro dos tetos do host, graça dentro do orçamento de limpeza.
- `status.ts` (I6): leitor do `--json-status-fd`: enquadra objetos por profundidade (também multilinha, com chaves dentro de strings), valida `child-pid`, `pid-namespace` e `exit-code`, recusa segundo documento do mesmo tipo, excesso de bytes e lixo; falha é permanente.
- `procfs.ts` (I5/I9): `scanPidNamespace` por inode do namespace (entradas ilegíveis do mesmo uid contam como não verificadas, de outro uid são ignoradas, ausência de `/proc` não prova nada), `readStartTime`/`sameProcess` (campo 22 depois do último `)`).
- `types.ts`, `errors.ts`: contrato do §4 e `ProcessServiceError` (código, sem valores na mensagem).

## Provas

- 73 testes (`par-x01-process-service-core.test.ts`): env (shape, nomes proibidos, lista por consumidor, tetos, UTF-8, não plano), limites (cada campo, tetos inclusivos, graça), status (partições, multilinha, 13 formas inválidas, falha permanente), `/proc` (raiz falsa com membros, exclusão, uid, ausência, `comm` com parênteses) e `/proc` real (o processo de teste é membro do próprio namespace).
- Mutação (`mutate-x.py s1`): 41 mutantes, 41 mortos. Três sobreviveram na 1ª rodada: dois por teste fraco (limite mínimo de limpeza mascarado pela regra da graça; falha permanente do status), um era código morto (checagem de objeto depois de um enquadramento que só começa em `{`), removido.
- typecheck, eslint e prettier limpos. Nenhum arquivo catalogado em `skip-catalog`/`mutation-manifest` foi tocado (não há entradas de `packages/sandbox` nesta base).

## Limites

Sem motor ainda: nenhum processo é criado por estas peças. Cobertura 100% por arquivo não se aplica a `packages/sandbox` (só harness, contracts, orchestrator e agent-runtime), e esta fatia não toca `packages/harness`.
