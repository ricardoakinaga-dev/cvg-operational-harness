# Notas de BUILD do PAR-X01 (não alteram a SPEC 0286)

A SPEC 0286 está vinculada ao recibo `human-decisions-19.json` pelo hash `6c15c089…fce` (commit `00bad5288`). Observações posteriores entram aqui, sem editar o corpo vinculado:

- XP06 (revisão do DF): teste explícito de que nomes em minúsculas (`http_proxy`, `https_proxy`, `no_proxy`) são recusados pelo próprio formato do regex do I2, para ninguém afrouxá-lo depois. Entra no teste da fatia 1.

## Fatiamento efetivo do BUILD (mesmo conteúdo do §7, ordem ajustada para revisar peças puras antes do motor)

1. **Peças puras:** tipos, erros, ambiente fechado, limites, leitor do canal de status, observação por `/proc` (este SHA).
2. **Motor:** `createProcessService` oneshot, supervisor, degraus de kill, `--json-status-fd`, prova de limpeza, causa única.
3. **Migração do shell:** `runContained` como adaptador fino, abort em voo, guarda de fronteira I1 (só `packages/**` e `apps/**`).
4. **Persistente e `dispose`.**

`ProcessLaunchRequest` ganha `handle: SandboxHandle` (a concessão do gate que `prepareProcessLaunch` já exige), campo que o esboço do §4 não listava.

Fato verificado para o I6: o fd de status é fechado dentro do sandbox (um payload que escreve no fd recebe `Bad file descriptor`), então só o bubblewrap escreve nele (`probe-status-fd-closed.mjs`).
