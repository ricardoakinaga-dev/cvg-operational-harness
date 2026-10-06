# AUD-0589 — verificação executada

- Candidato: `eff8e0d8974f2c3222eb4602e4a37ff73c708245`.
- `apps/api/src/server.ts`: SHA-256 `76a588fbc40640638ede9a6c0f79b0926b7750557a06e9f36659150482fc38fa`, inalterado.
- Perfil: Node `v24.20.0`, identidade confiável sintética, store em memória, API via `Fastify.inject`, sem PostgreSQL/IdP/provider/canal externos.

## Execuções

- Rota dinâmica, antes do patch: 61 templates, 108 pares; 98 protegidos deram 401 nos três cenários negativos; cookie desconhecido também convertia as respostas das oito probes públicas GET/HEAD para 401. Bootstrap assinado 200 e replay 401. Registro: `exploratory-results.json`.
- Rota dinâmica, depois do patch: 61 templates, 108 pares; os mesmos 98 protegidos deram 401 nos três cenários negativos; as oito probes públicas preservaram exatamente seus status sem cookie: health/live/ready 200, métricas 404 por configuração. Cookie válido: 3/3 controles 200; logout sem cookie 200, zero revogações. Registro: `probe-results.json`, `run.log`.
- `./node_modules/.bin/vitest run apps/api/src/__tests__/operator-session-public-routes.test.ts apps/api/src/__tests__/operator-session.test.ts apps/api/src/__tests__/operator-session-hook.test.ts apps/api/src/__tests__/identity-composition-wiring.test.ts --reporter=verbose`: 4 arquivos e 27 testes PASS. Saída: `focused-tests.log`.
- `npm test -- --reporter=dot`: exit 0; 307 arquivos PASS, 20 skipped; 2.241 testes PASS, 162 skipped; duração 261,06 s. Os skips de PostgreSQL permaneceram sem execução deliberada contra as portas compartilhadas. O comando executado foi no Node 24.20.0.
- `npm run typecheck`: exit 0; saída em `typecheck.log`.
- `npm run lint`: exit 0; saída em `eslint.log`.
- `npm run format:check`: exit 0, todos os arquivos formatados; saída em `format-check.log`.
- `git diff --check`: exit 0; registro em `diff-check.log`.
- `npm run docs:check-links`: exit 0; zero links quebrados, zero alvos removidos sem tratamento, higiene `EVIDENCE_HYGIENE_OK` com 613 JSON parseáveis e 231 artefatos vazios catalogados; saída em `docs-check.log`.

Uma chamada inicial a `npm run format` retornou “Missing script”; a leitura de `package.json` mostrou que o nome existente é `format:check`, executado e aprovado acima. Isso foi erro de seleção do comando, não falha do gate.

## Crítica independente

Pauli e Pascal receberam pacotes de revisão I1 com contexto não herdado, mas não retornaram findings nem veredito antes de serem fechados após repetidas esperas. Os detalhes estão em `I1-first-attempt.md` e `I1-second-attempt.md`. A segunda tentativa teve sentinel do líder em 190 arquivos hash-bound: nenhum mudou; HEAD permaneceu o mesmo. Isso comprova ausência de mutação nos caminhos medidos, não substitui a revisão ausente.
