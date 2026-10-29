# PAR-X02 BUILD, fatia 1 — helper nativo (SPEC 0288)

Task `AUD0625-PAR-X02-SPEC-DF-20261029`, Claude DF (Opus), 29/10/2026. Esta é a implementação; a revisão independente fica com uma sessão não autora. Produção `NO_GO`.

## Autorização

Recibo [human-decisions-20](../USER-DECISIONS-20261028/human-decisions-20.json), sha256 `49c80831…`: D-A (helper C), D-B (ABI ≥ 3), D-C (imagem de produção sem mudança) e D-D. A [SPEC 0288](../../../02_spec/0288_par_x02_landlock_ruleset_and_honest_containment.md) (sha `a9e1f54c…`) não mudou depois da aprovação.

## Mudança

`packages/sandbox/native/cvg-landlock-exec.c`, compilado com `cc -O2 -Wall -Wextra -Werror`, sem dependências além da libc e dos cabeçalhos do kernel.
- `--probe`: o ABI vem de `landlock_create_ruleset(NULL, 0, VERSION)`.
- Modo de aplicação, em ordem:
  1. lê as regras do fd privado (teto de 64 KiB e de 256 regras), com caminho absoluto, sem `.`/`..` e máscara dentro dos direitos tratados;
  2. em arquivo, mascara para direitos de arquivo;
  3. cria o ruleset com FS pelo ABI, mais rede TCP negada (ABI ≥ 4) e escopo de sinal e unix abstrato (ABI ≥ 6);
  4. chama `PR_SET_NO_NEW_PRIVS` e `landlock_restrict_self`;
  5. escreve o status, fecha os dois fds e faz `execv` de um caminho absoluto.
- Qualquer falha anterior escreve `applied:false` com o código e sai com 125; o payload nunca roda.
- `MIN_ABI` só é ajustável na compilação, pelos testes; não há override em execução.

## Provas (kernel 7.0, ABI 8)

`packages/sandbox/src/__tests__/par-x02-landlock-helper.test.ts`, 7 testes:
- XL01: o probe devolve ABI ≥ 3; um binário com `-DMIN_ABI=99` recusa com `abi_too_low` e não roda o payload.
- XL03: a escrita no workspace passa; fora dele, `Permission denied` sem arquivo criado. Controle: a mesma escrita sem o helper passa.
- XL05: 10 regras inválidas, cada uma com o código esperado e nenhuma execução; corpo maior que o teto dá `rules_too_large`; payload relativo dá `usage`.
- XL06: o payload não herda o fd de status nem o de regras.
- TCP connect negado (ABI ≥ 4).

Mutações (8/8 mortas):
- sem `restrict_self`;
- fd de status herdado; fd de regras herdado;
- sem validação de caminho;
- direito desconhecido aceito; ABI mínimo ignorado;
- arquivo sem máscara;
- corpo grande truncado em vez de recusado.

Na primeira rodada, o mutante do fd herdado sobreviveu: o teste XL06 usava `2>/dev/null`, que o próprio Landlock negava, então o teste não provava nada. O teste foi corrigido.

## Falta (próximas fatias)

- Fatia 2: `landlockAbi` em `SandboxCapabilities`, probe pelo helper e gate com D-D.
- Fatia 3: integração ao lançamento do X01 (depende da fatia 3 da 07), XL04 e mutações do status.
- Fatia 4: build do helper na CI. A imagem de produção não muda (D-C).
