# PAR-X02 BUILD, fatia 4 — helper do Landlock na CI (SPEC 0288)

Task `AUD0625-PAR-X02-SPEC-DF-20261029`, Claude DF (Opus), 30/10/2026. A revisão fica com uma sessão não autora. Recibo `human-decisions-20`. Base: fatia 3 (`3e9cff07a`). Produção `NO_GO`.

## Mudança

No passo `Enable sandbox host capabilities` do `verify.yml`, o mesmo passo que já instala o bubblewrap, entram duas ações:

- compilar o helper estático a partir de `packages/sandbox/native/cvg-landlock-exec.c`, com `-Wall -Wextra -Werror`;
- exigir `--probe` com ABI ≥ 3.

Um runner sem Landlock falha nesse passo, com a causa no log (`Landlock ABI on this runner: none`), em vez de falhar tarde no gate de unidade, onde os testes do helper e do lançamento sob Landlock rodam. Nenhum passo novo nem renomeado, nenhuma dependência nova, e o lockfile não muda.

## O que não muda (D-C)

A imagem de produção segue sem bubblewrap e sem helper, e `PROCESS` continua `unavailable` lá. Levar a execução contida à imagem pede SPEC própria junto com o servidor (U10).

## Prova local

O script do passo, rodado com `RUNNER_TEMP` numa pasta descartável, compilou o binário estático e respondeu `Landlock ABI on this runner: 8` (rc 0). O YAML continua válido e passa no prettier. A prova no runner real é a primeira barra REM21 do PR que levar esta branch.
