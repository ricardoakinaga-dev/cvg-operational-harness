# PAR-X02, fase 1 — resultado

Task `AUD0625-PAR-X02-SPEC-DF-20261029`, Claude DF (Opus), 29/10/2026. Só SPEC e testes RED. Sem BUILD e sem recibo T3 ainda. Produção `NO_GO`.

- SPEC: [0288](../../../02_spec/0288_par_x02_landlock_ruleset_and_honest_containment.md), `PROPOSED_FOR_HUMAN_T3_REVIEW`, com as decisões D-A a D-D e a T-1.
- Base: `claude/aud0625-par-x01-07` @ `d83918312` (fatia 1 do X01, aprovada pelo DF).
- Teste: `tests/aud0625-par-x02-red.test.ts`, com 2 controles que passam e 3 alvos `it.fails`. Rodando os `it.fails` como `it`:
  - o gate devolve `allowed` em `IN_PROCESS` e em `WORKSPACE` com `requireLandlock` e o Landlock reportado (`expected 'allowed' to be 'unavailable'`);
  - a capacidade não tem `landlockAbi`, porque vem da versão do kernel.
- Sonda local, só leitura: `landlock_create_ruleset(NULL, 0, VERSION)` responde **ABI 8** no kernel 7.0 desta máquina, com o LSM `landlock` ativo.
- Fato de implantação: a imagem `runtime` (distroless) não tem bubblewrap, então `PROCESS` é `unavailable` no contêiner de produção (decisão D-C).
