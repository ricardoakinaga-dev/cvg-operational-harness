# Delta de ledgers proposto ao Lead — CONT-20261018-D9EF / CODEX100

Transcrito pelo lead a partir do relatório final do executor. O harness bloqueia
arquivos `.md` gravados por subagentes, por isso o executor entregou o texto na
mensagem. O executor não editou nenhum ledger compartilhado.

Fontes: `checkpoint.json`, `validation-r2.json`, `case-results.json`,
`source-freeze-r2.json` e `identity-freeze.json` desta pasta. Commits `65874c32`
e `c17ab934` na branch `codex/codex100-sdk-admission-20261018`, promovidos ao
root pelo lead.

## Resultado da unidade

- `DX100-G02:ADMIT-SDK-PROFILE-AND-ACCEPTANCE`: `COMPLETED_LOCAL` em 18/10/2026.
- Lacunas da porta anterior: R1-F14, R2-F01, R2-F02 e R2-F03 fechadas. R2-F04 fechada
  em parte: um pedido sem script em que o SDK bloqueia segue `INVALID_CAPTURE`, de
  forma fail-closed, nunca PASS.
- Requalificações com source-freeze-r2: DIAG-PY-RPC, DIAG-TS-ECHO e DIAG-TS-LARGE
  PASS; DIAG-TS-ABORT `KNOWN_SIGNAL_TERMINATION`, como esperado.
- Sete artefatos readquiridos como dados (7.116.743 bytes), hashes iguais aos
  autenticados; 301 extraídos e 169 do merge Python iguais byte a byte; sem import
  nem installer.
- Admissão estática e DIAG-PY-STAGE PASS, com quatro negativos recusados; identity
  freeze `ebfb308f…`; TypeScript 5.9.2 qualificado em contenção e dez emitidos
  selados.
- 19 casos SDK, uma vez cada, em série, sem retry: 19 `PASS_CLIENT_OBSERVATION`,
  0 MISMATCH, 0 INVALID_CAPTURE. São fatos do cliente: 0 recibos funcionais e 0
  crédito de paridade.
- Revisão: R1 REVISE (1 obrigatório, R1-F01), reparo agrupado offline 1/1 e R2
  APPROVE sem obrigatórios.
- Orçamento: 8/12 serviços, 19/19 vagas de caso, 2/2 revisões, 1/1 reparo, 0
  retries. A leitura 12+19 foi ratificada pelo lead
  (`lead-budget-ratification-20261018.json`).
- SPEC0239 aprovada pelo usuário, sem BUILD: depende de 0029 → 0030 → 0031
  qualificadas.

## Próxima ação

`DX100-G02:BIND-SDK-OBSERVATIONS-TO-COVERAGE`, documental, sem serviço. Liga as
observações aos 11 contratos selecionados dos 44, mantém os outros 33 abertos, revê
as seis lacunas SDK e prepara o HOW do próximo perfil. Continuam abertos: wheel e
npm distribuídos, Codex CLI real, tsup e typecheck, outras plataformas, e um peer
que responda a pedido sem script, para que o known-bad bloqueante vire MISMATCH.

## Descobertas

- O Node 24 mapeia anéis `anon_inode:[io_uring]` (rw-s, sem exec); o classificador
  de `/proc/maps` precisou reconhecê-los.
- Com o peer congelado, um pedido sem script deixa o SDK Python bloqueado sem
  timeout em `waiter.get()`.
- O `child.kill()` do `finally` de `exec.ts` produz término por sinal em SDKTS02,
  03, 07 e 08.
- Sem `pyproject` no perfil, o SDK Python reporta a versão `0+unknown`.
