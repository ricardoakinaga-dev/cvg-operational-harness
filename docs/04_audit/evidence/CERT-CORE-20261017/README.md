# CERT-CORE-20261017 — certificação local da linha estável do núcleo

- Task `CERT-CORE-20261017-F5` (Claude Code, sessão `f5`). Pedido do usuário em 17/10/2026: testar aqui, no ambiente local, se o motor está pronto para produção, sem subir nada em construção.
- Candidata: branch local `candidate/core-20261017`, commit `5a199668` = `c2bdb684` (código de `ca565391` + deploy on-premises e documentos) + correção de build e lint. **Sem o trabalho em andamento do PARE100** (`38f3e18d` e a branch do Codex ficam fora).
- Tudo rodou em worktrees isolados em `/home/ricardo/cvg-candidates/`, com PostgreSQL descartável próprio e portas próprias; nada foi publicado. Resumo legível por máquina: [summary.json](summary.json).

## Primeira rodada: `c2bdb684` → `NO_GO`

| Verificação                      | Resultado                                                                                                                                                                                                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run certify` (16 gates)     | 15 PASS, **lint FAIL**: helper `sleep` não usado em `packages/agent-runtime/src/__tests__/pdsh-031-slice3e1.test.ts` ([log](raw/lint-c2bdb684.log), [certify](raw/certify-c2bdb684.log))                                                                                                                                  |
| Build da imagem de produção      | **FALHA** desde `ca565391`: `scripts/build-runtime.mjs` não incluía `src/**/*.json` (TS6307 em `session-event-schemas.v1.json`, que derruba `contracts` e todos os dependentes) e não listava `packages/sandbox`, dependência do `channel-gateway` desde PDSH-016 ([erros](raw/image-build-c2bdb684-errors.log); só com a primeira correção: [erros](raw/image-build-json-fix-only-errors.log)) |

O CI teria reprovado esse código: `scripts/ci-bar.mjs` e o job `image-scan` constroem a imagem. Ele só nunca foi publicado. A correção do JSON existia na branch do Codex (F-BUILD-001), mas a do `sandbox` não existia em lugar nenhum.

## Segunda rodada: `5a199668` → `CONDITIONAL_GO / AAA_CONTROLLED`

Correção mínima, sem mudar comportamento nem contrato: `src/**/*.json` e `packages/sandbox` no build da imagem; remoção do helper não usado.

| Verificação                                             | Resultado                                                                                                                                         |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run certify`                                       | **16/16 PASS**: unit 3.468/3.468, PostgreSQL 302/302, E2E 12/12, zero skips; cobertura, SBOM, licenças, segurança ([log](raw/certify-5a199668.log)) |
| Imagens `runtime` e `web`                               | Compilam a partir do commit da candidata                                                                                                          |
| Smoke da pilha de produção (imagem endurecida, PG real) | **22/22 PASS** ([json](raw/production-stack-smoke-5a199668.json))                                                                                |
| Restore com cadeia de auditoria                         | **PASS**, 16 eventos ([json](raw/restore-audit-chain-5a199668.json))                                                                            |
| Trivy 0.69.3 na imagem                                  | 0 segredos; 1 HIGH sem correção publicada (`CVE-2026-84782`, `libssl3`), aceita pela política A4                                                  |
| Gitleaks v8.28.0 (`ca565391..5a199668`)                 | 0 achados                                                                                                                                         |

`CONDITIONAL_GO` é o máximo que a certificação local concede: provider de modelo, canal e IdP reais ficam `NOT_VALIDATED`, e a assinatura humana fica `PENDING`.

## Barra 0373 nesta candidata

| #   | Condição                     | Situação                                                                    |
| --- | ---------------------------- | --------------------------------------------------------------------------- |
| 1   | Conformidade                 | PASS (suíte de conformidade dentro do unit verde)                           |
| 2   | Suítes verdes                | PASS                                                                        |
| 3   | Pilha real em modo produção  | PASS local (smoke 22/22)                                                    |
| 4   | Operadores entram            | PASS local (login 200, protegida 200, sem sessão 401)                       |
| 5   | CI remoto no mesmo commit    | **PENDENTE**: exige push da branch candidata, com autorização do usuário    |
| 6   | Segredos e dependências      | PASS (gitleaks 0, audit PASS; 1 HIGH sem correção aceito)                   |
| 7   | Imagem endurecida            | PASS local                                                                  |
| 8   | Backup testado               | PASS local                                                                  |
| 9   | Alerta                       | PASS local (alerta assinado entregue; receptor do Telegram com testes)      |
| 10  | Botão de desligar            | PASS local (pausa retém, retomada drena)                                    |

O GO de produção ainda exige as dez condições no mesmo commit e na mesma imagem **no servidor real** (C9), mais a reauditoria C10.
