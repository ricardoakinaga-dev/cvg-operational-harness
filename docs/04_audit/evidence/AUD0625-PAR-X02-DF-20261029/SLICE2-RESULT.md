# PAR-X02 BUILD, fatia 2 — capacidades honestas e gate (SPEC 0288)

Task `AUD0625-PAR-X02-SPEC-DF-20261029`, Claude DF (Opus), 29/10/2026. Esta é a implementação; a revisão fica com uma sessão não autora. Recibo `human-decisions-20`. Base: X01 fatias 3+4 (`f6236c0c4`, 07), mesclada nesta branch. Produção `NO_GO`.

## Mudança

- `capabilities.ts`:
  - `SandboxCapabilities.landlockAbi?` (T-1). `landlock` só é true com um ABI confirmado pelo helper ≥ `LANDLOCK_MIN_ABI` (3, D-B). A versão do kernel deixa de contar.
  - `SandboxProbe.probeLandlockAbi?()` é opcional. `probeLandlock()` continua por compatibilidade, mas sozinho nunca liga o `landlock`.
  - `probeLandlockAbiWith(helper)` roda `--probe` só com caminho absoluto, `env: {}` e `cwd: '/'`, e lê o ABI pelo fd 3.
  - `createHostProbe({ landlockHelper })`: sem helper configurado, o host é honestamente sem Landlock.
- `gate.ts`:
  - `requireLandlock` em `IN_PROCESS` e `WORKSPACE` é sempre `unavailable` (D-D).
  - Em `PROCESS`, só concede com `landlock` confirmado.
  - A nota do journal diz "Landlock não se aplica em processo" (XL07).
- `index.ts`: exporta `createHostProbe`, `LANDLOCK_MIN_ABI` e `probeLandlockAbiWith`.

## Testes

- `tests/aud0625-par-x02-red.test.ts`: os 3 alvos da fase 1 mais 5 casos de BUILD.
  - O alvo 1 foi reescrito para o que o título diz: só a versão do kernel não vale como Landlock. A asserção da fase 1 esperava um ABI de um probe sem helper.
  - Os casos novos: ABI abaixo do piso, ABI no piso, probe que lança ou devolve lixo, PROCESS com e sem Landlock, nota do journal.
- `par-x02-landlock-helper.test.ts`: o probe pelo helper REAL (ABI ≥ 3, `landlock` true), sem helper falso, caminho relativo ou inexistente nunca confiado.
- `pdsh-011`: o probe sintético do fixture ganhou `probeLandlockAbi`, porque o contrato antigo, por boolean, era o defeito.
- Consumidores `pdsh-013` (shell) e `pdsh-016` (exame) do harness passam.
- `packages/sandbox`, os testes do X01 e o X02: 221 passam, com o typecheck da raiz verde.
