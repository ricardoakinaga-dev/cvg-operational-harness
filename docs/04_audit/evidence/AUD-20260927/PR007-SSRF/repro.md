# PR-007 / SPEC 0146 — reprodução controlada do lookup SSRF

- Data: 27/09/2026; Node `v22.23.2`; Vitest `v4.1.11`.
- Matriz original: [fonte do teste](ssrf-bound-transport.repro.ts.txt), SHA-256 `6c2b0c81919fd3e8b525d4293fd1b092aa9e0673f9118bd36301cf29b749d185`. Para reproduzir em uma branch autorizada, coloque esse conteúdo em `tests/ssrf-bound-transport.test.ts` e rode `npx vitest run tests/ssrf-bound-transport.test.ts --no-file-parallelism`.
- Resultado observado antes de qualquer correção: 8 testes, 2 PASS (bloqueios de entrada inválida) e 6 FAIL. Os casos de requisição ao loopback, corpo/headers e abort dos dois transportes lançaram `TypeError: Invalid IP address: undefined` em `pinnedLookup` linha 99. O hostname `allowed.example` foi usado apenas como autoridade HTTP; o endereço de conexão fornecido era `127.0.0.1`.
- Arquivos afetados: `packages/model-gateway/src/providers/ssrf-node.ts` e `packages/channel-gateway/src/adapters/ssrf-node.ts`. Nenhum código de segurança foi modificado; [SPEC 0146](../../../../02_spec/0146_pinned_ssrf_lookup_node22.md) aguarda revisão humana T3.
