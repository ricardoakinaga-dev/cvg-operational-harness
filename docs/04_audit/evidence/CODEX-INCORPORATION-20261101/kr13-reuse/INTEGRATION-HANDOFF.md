# Entrega da primitive interna de cleanup

Task `CODEX-INCORPORATION:KR13-NATIVE-REPORT-INTAKE`. Implementação privada revisada, sem promoção para fontes canônicas. A base é `c8be3a5168b1304ba4e3dc3d79a91c66ce494637`; a candidata física é `/mnt/dados/cvg-work/codex-incorporation-20261101/cleanup-candidate`.

O [patch seletivo](code-freeze-r1/implementation.patch) altera somente `packages/harness/src/kernel/host.ts` e acrescenta `packages/harness/src/__tests__/managed-native-cleanup-intake.test.ts`. SHA-256 do patch e hashes dos arquivos estão no [manifesto congelado](code-freeze-r1/manifest.json). `.kr13`, dependências, caches e outputs privados não fazem parte da entrega. Não aplicar o patch inteiro de outro K04 ou substituir o host: esta adaptação preserva os controles e o hook de overflow da onda8.

A mudança faz observadores concorrentes aguardarem o mesmo cleanup; conserva ordem inversa e invocação única, mantém ownership quando o coordinator não demonstra settlement e produz um relatório interno imutável das falhas assentadas. A API legada continua `dispose(): Promise<void>` e não passa a lançar falha de cleanup. O erro primário do boot permanece separado. Os helpers novos ficam fora dos barrels públicos.

Autoridade: SPEC0222 aprovada com ajustes; [HOW R2](how-review-r2.json) aprovado tecnicamente antes da cópia e claim nominal anterior à criação. [Revisão de código independente](code-review-r1/review.json): `APPROVE_SCOPED_CODE_R1`, zero obrigatórios, por crítico não autor e com contexto novo. O [texto recebido](code-review-r1/review-intake.txt) preserva seus limites e conferências.

Verificação executada em Node22: 19 testes focais, 100 regressões do kernel, typecheck, lint, formato e build passaram. Os brutos, argv, exits, duração e limites estão em `checks/` e nas cópias do freeze. O primeiro erro de preparação sparse e o RED funcional foram preservados. A revisão examinou esses resultados sem executar uma segunda campanha.

O integrador deve reconciliar o handoff e a candidata composta, preservar os deltas concorrentes, conferir o patch na base escolhida e executar a qualificação exigida para essa composição. Não houve certificação global, PostgreSQL ou E2E nesta unidade. Não há autorização de merge, push ou produção. O coordinator dos testes é fixture: real owner, producer tracker, gerações/leases, fechamento de admissão, cancelamento e encerramento de árvore continuam pendentes. Esta entrega não fecha KR13/PAR-K04 nem concede recibo funcional de paridade.
