# A59-05 / F05 — triagem atual do lockfile

- Data: 29/09/2026; estado `TRIAGED / BUILD_WAITING_LOCKFILE_CLAIM / NO_GO`.
- Baseline lida: `package-lock.json` SHA-256
  `3bcb581b47e69246c4905d922db8a5a235e0bfd1ec20f82ac4c70a1f59c4062e`;
  nenhum arquivo de dependência foi alterado.
- Comando em Node 22.23.2: `npm audit --json --package-lock-only --omit=dev`.
  Saída 1 esperada pelo finding alto; [JSON bruto](production-audit.json)
  SHA-256 `fd709bfd647ed6a1465aa29d80129dbb2d2d91befb55d59b4beadf1f401f19a4`.

O audit produtivo reportou **um pacote afetado, severidade alta**:
`fast-uri` 3.1.6. `npm ls fast-uri undici --all --json` confirmou o caminho
produtivo `fastify → @fastify/ajv-compiler → fast-uri` e a cópia raiz
3.1.6; o lockfile também contém `undici` 7.29.0 sob a dependência de
desenvolvimento `jsdom`, ausente do audit com `--omit=dev`.

As duas entradas oficiais de `fast-uri` marcam 3.1.6 como afetada e 3.1.7
como corrigida: [authority injection](https://github.com/advisories/GHSA-qw65-cvwx-89v3)
e [host confusion](https://github.com/advisories/GHSA-58mr-gqgx-xq4g).
O advisory de [Undici](https://github.com/advisories/GHSA-3wwx-pv8p-q78v)
marca 7.29.0 como afetada e 7.29.1 como corrigida. A presença no lockfile
não demonstra que o produto aciona os vetores descritos; a triagem não
executou PoC nem testou o WebSocket embutido no Node.

**Próximo corte:** quando PR-L04 liberar `package-lock.json`, registrar
claim exclusivo de `PR-205`, atualizar a menor resolução compatível,
executar `npm ls`, audit completo/produtivo, typecheck, lint, testes de
validação/URI, PostgreSQL, E2E e build em Node 22 no candidato integrado.
Adjudicar qualquer advisory residual sem rebaixar o gate. A PR-L04 detém
trechos próprios do lockfile no quadro de coordenação; por isso não houve
`npm install`/`npm ci` ou BUILD F05 nesta rodada. Produção permanece `NO_GO`.
