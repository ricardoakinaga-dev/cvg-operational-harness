# REM21-008 — BUILD/AUDIT local

## Resultado

- task: `REM21-008` / achados `A21-F08`, `A21-F21`;
- autorização: `G21-1`, somente local, sintética e descartável;
- status: `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- run: `run-rem21-008-final-bar-4`;
- candidate: `d9ae236ca252e8648bedffef3f9be98fe71d9b40d2d7013507e913413f47f6f0`;
- runtime: Node `22.23.2`, npm `10.9.8`;
- manifesto da barra: `PASS`, sem falhas, 32/32 gates `PASS`;
- certificação Phase 10: `NO_GO`, porque provider, canal, IdP e signoff
  humano não foram disponibilizados; esse resultado não foi convertido em
  `GO`;
- produção, G21-5, G21-6, I1 e freeze: continuam fechados.

O manifesto bruto permanece inspecionável em
`/tmp/rem21-008-final-bar4.txzigk/ci-bar-manifest.json` nesta estação. O
resumo candidate/run-bound e os hashes relevantes estão versionados nesta
pasta.

## Barra fresca

Comando executado em Node 22, usando PostgreSQL descartável em
`127.0.0.1:55434`, `PHASE4A_DISPOSABLE_PG=1`, Chromium local e Docker sem push:

```text
npx playwright install chromium
node scripts/ci-bar.mjs init
node scripts/ci-bar.mjs gate <runtime|install|readiness|format|typecheck|lint|build|unit|coverage|coverage-critical|mutation|skip|worker-startup|postgres|phase2|phase3|phase4a|phase4a-identity|chaos|evals|load|restore|docs|e2e|image|sbom|licenses|security|certify|certification-verify|diff>
node scripts/ci-bar.mjs gate artifacts
node scripts/ci-bar.mjs finalize
```

Resultados materiais:

- unit: 312 arquivos, 2.218 testes, zero falhas e zero skips;
- PostgreSQL: 35 arquivos, 257 testes, zero falhas e zero skips;
- coverage: 92,29% statements, 87,46% branches, 95,00% functions,
  93,22% lines;
- coverage crítica: `PASS`, todos os grupos no threshold vigente;
- mutation guard vigente: 3/3 mutantes mortos;
- chaos: 16/16 cenários;
- evals: 56 cenários, task success 100%, policy/unsafe/hallucination/schema
  failure 0%;
- load sintético: 10.000 eventos processados, perda e duplicação zero;
- restore sintético: digest, outbox e isolamento de tenant preservados;
- E2E Chromium: 12 arquivos, sem falhas;
- imagem: `sha256:1492aec8f82c838516201938f44692ca0eb6d82e22a1c364d4930511a6b42f45`,
  usuário `cvg`, smoke `v22.23.2`, sem push;
- `certification:verify`: `PASS`, com o mesmo run/candidate;
- `diff:check`: `PASS`; upload remoto do GitHub Actions não foi alegado.

## Reduções encontradas e corrigidas durante a rodada

As três primeiras execuções finais foram preservadas como diagnósticos fora da
evidência final: a primeira expôs target de imagem/licenças/run ID; a segunda
expôs a remoção indevida do PostgreSQL durante a certificação; a terceira
expôs três hashes de origem stale no catálogo de skips. A quarta execução foi
feita depois das correções e fechou sem falhas. Nenhum teste foi removido,
nenhum threshold foi reduzido e nenhum skip foi ocultado.

## Limitações e decisão

Load/restore são ensaios in-memory/sintéticos e não qualificam RPO/RTO ou
capacidade de produção. A certificação mecânica local não substitui CI remoto,
crítica I1, freeze candidate-bound ou gates externos. REM21-008 está verificada
localmente; a única decisão operacional possível nesta rodada é manter
produção `NO_GO` e avançar para Discovery/PRD/SPEC de `REM21-012`.
