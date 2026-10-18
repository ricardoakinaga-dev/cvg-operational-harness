# 0198 — SPEC: PDSH-013 — Tool `shell` limitada (argv puro, contenção PROCESS, timeout, aprovação)

- Task: `PARE-DSH-20261011`, cartão `PDSH-013` (plano [0375](../03_build/0375_plano_pareamento_motor_dsh.md), Onda 2).
- Trilha T3; depende de [0195](0195_pdsh010_sandbox_seam.md) (PDSH-010 `DONE`), [0196](0196_pdsh011_sandbox_local.md) (PDSH-011 `DONE`) e usa o confinamento de path estabelecido em [0197](0197_pdsh012_fs_tool.md) (PDSH-012 `DONE`).
- Invariantes: ADR-011 (um spine de governança — a shell tool é uma capability registrada no registry existente, não um segundo runtime), ADR-005 (policy governs effects), ADR-010 (`boundary:products`), fail-closed, produção `NO_GO`, sem dado real, `products/**` intocado, `apps/**`/`legacy/**` intocados.

## Objetivo

Entregar a capability `shell.run` como `ToolDefinition` pronta para composição: execução de comandos **contidos** (namespace bubblewrap de PDSH-011) com **argv puro** (nunca string de shell, nunca interpolação, nunca shell de login), **timeout**, **cwd confinado ao workspace do tenant**, **gate de intenção** e **aprovação obrigatória**. Toda execução passa pela seam de sandbox de PDSH-010 (`sandbox: 'PROCESS'` declarado no descriptor): sem gate o kernel para (`UNSAFE_REQUEST`); com o gate local de PDSH-011, `PROCESS` exige bubblewrap real — **nunca** downgrade silencioso.

Este cartão entrega a capability e sua contenção. O catálogo gerado que a publica é PDSH-014.

## Decisões de design

### 1. Fábrica e runner injetado

```ts
// packages/sandbox/src/shell-tool.ts — exportado pela raiz @cvg/sandbox
export function createShellTool(options: ShellToolOptions): ToolDefinition
```

```ts
export interface ShellRunRequest {
  /** Pure argv array — never a shell string, never interpolated. */
  readonly argv: readonly string[]
  /** Absolute directory, already confined to the workspace root. */
  readonly cwd: string
  readonly timeoutMs: number
  readonly maxOutputBytes: number
  readonly stdin?: string
}

export interface ShellRunResult {
  readonly exitCode: number | 'timeout' | 'spawn_failed'
  readonly stdout: string
  readonly stderr: string
  readonly truncated: boolean
}

export interface ShellToolOptions {
  /** Absolute tenant workspace root; cwd is confined to it by realpath. */
  readonly workspaceRoot: string
  /**
   * Execution backend. Defaults to `runContained` (PDSH-011) with a
   * PROCESS handle built from `workspaceRoot`; tests inject a fake.
   */
  readonly run?: (request: ShellRunRequest) => Promise<ShellRunResult>
  readonly limits?: Partial<ShellLimits>
}
```

O vínculo ao workspace acontece **na composição** (mesmo modelo de PDSH-012): o `SandboxHandle` do kernel não é repassado ao corpo da tool, então o runner default constrói o próprio handle `PROCESS` (`allowSubprocess: true`, `allowNetwork: false`, raiz = `workspaceRoot`) a partir da raiz vinculada e delega a `runContained`. A raiz é validada no boot da fábrica (absoluta, existe, é diretório, `realpath` aplicado) — igual a `createFsTools`.

### 2. Descriptor

| Tool        | `sideEffect` | `sandbox` | `risk` | `idempotent` | `requiresApproval` | Intent gate |
| ----------- | ------------ | --------- | ------ | ------------ | ------------------ | ----------- |
| `shell.run` | `WRITE`      | `PROCESS` | `HIGH` | `false`      | **`true`**         | **sim**     |

- `sandbox: 'PROCESS'`: o kernel exige a porta de PDSH-010 **e** o modo PROCESS do gate de PDSH-011 (bubblewrap). Sem gate → `UNSAFE_REQUEST`; gate sem bubblewrap → `unavailable` → `UNSAFE_REQUEST`. Fail-closed, sem downgrade.
- `requiresApproval: true` no descriptor: **toda** chamada de shell exige approval (o gate de approval do kernel, `control.approvals`, decide; esta tool não duplica a decisão). Perfis que queiram negar por completo usam a política (`DENY`) ou `denyModes` do gate — "política por perfil" é resolvida pelos mecanismos existentes, não por campo novo.
- `sideEffect: 'WRITE'`: pior caso de um comando é mutar o workspace; classificação conservadora para a matriz de risco.

### 3. Input e validação (fail-closed, `REJECTED` antes de qualquer spawn)

```ts
// input de shell.run
{
  argv: string[]            // obrigatório
  cwd?: string              // relativo ao workspace; default '.'
  timeoutMs?: number        // clamp em limits
  stdin?: string            // opcional
  intent: string            // obrigatório (gate de intenção)
}
```

Recusas (`ToolResult.status: 'REJECTED'`, nada executa):

1. `argv` ausente, não-array, vazio, com elemento não-string, elemento vazio ou com NUL; contagem > `maxArgs`; argumento > `maxArgLength`; bytes totais > `maxTotalArgBytes`;
2. **qualquer tentativa de comando como string** (`command`/`cmd`/string em `argv[0]` quando o input traz um campo de string): a tool aceita **apenas** o array — não existe caminho de interpolação, `sh -c` ou shell de login (o runner default executa o programa diretamente via bwrap, sem wrapper);
3. `cwd` absoluto, com `..` que escapa, symlink que resolve fora da raiz (mesmo confinamento de path de PDSH-017 §3, extraído para módulo interno compartilhado) ou que não existe como diretório;
4. `intent` ausente/vazia ou > `maxIntentLength`;
5. `stdin` > `maxStdinBytes`.

`timeoutMs` e `maxOutputBytes` não são recusados: são **clampados** aos limites (valor inválido → default).

### 4. Execução e mapeamento de resultado

Ordem: validação → confinamento de `cwd` → intent gate → `run(argv, cwd, timeout, …)` → mapeamento.

- `exitCode: 'spawn_failed'` → `FAILED` (falha de contenção/lançamento — bubblewrap ausente ou recusou o namespace; nunca vira exit code normal);
- `exitCode: 'timeout'` → `FAILED` (`command timed out after <ms>ms`);
- `exitCode: number` (qualquer, inclusive ≠ 0) → `SUCCEEDED` com `{ exitCode, stdout, stderr, truncated }` — exit ≠ 0 é **sinal legítimo** do comando (ex.: `grep` sem match), a interpretação é do consumidor; a tool não converte exit code em falha de governança.

Auditoria: o input completo (incluindo `intent` e `argv`) vai para o log `tool/call` do kernel (I5); o ledger de efeitos cobre `operationKey`; o approval request carrega `tool.description` como summary. Journal dedicado de shell **não** é exigido neste cartão (diferente de `fs.write`/`fs.edit`): o approval + audit log + effect journal do kernel já governam a chamada; um journal de comandos pode acompanhar o catálogo (PDSH-014) se o host precisar.

### 5. Limites (defaults)

```ts
export interface ShellLimits {
  readonly maxArgs: number // 32
  readonly maxArgLength: number // 4096
  readonly maxTotalArgBytes: number // 32768
  readonly maxTimeoutMs: number // 120_000 (clamp; default 30_000)
  readonly defaultTimeoutMs: number // 30_000
  readonly maxOutputBytes: number // 1 MiB (teto absoluto 8 MiB)
  readonly maxStdinBytes: number // 1 MiB (teto absoluto 8 MiB)
  readonly maxIntentLength: number // 200
}
```

Rede: o namespace de PDSH-011 é `--unshare-net` — **nenhum** comando desta tool alcança a rede (`EGRESS` continua nunca concedido aqui; upload/download de exames é PDSH-016). Root é read-only; somente o workspace do tenant é gravável.

### 6. O que este cartão NÃO faz

- **Não** publica catálogo (PDSH-014).
- **Não** concede `EGRESS`/rede (PDSH-016).
- **Não** decide approval (gates existentes do kernel).
- **Não** muda `kernel/pipeline.ts`, os contratos de SPEC 0195 ou o gate local de SPEC 0196.
- **Não** introduz shell de login, `sh -c` como wrapper, interpolação ou expansão de variáveis — por construção (o runner executa o argv recebido diretamente via bwrap, sem caminho alternativo), não por filtro de strings. O argv do chamador roda como está dentro do namespace; a contenção é o sandbox, não uma allowlist de binários (essa política, se o host precisar, acompanha o catálogo — PDSH-014).
- **Não** exige journal dedicado de comandos (ver §4).

## Critérios de pronto (plano 0375)

- [x] `createShellTool` em `packages/sandbox`, exportada por `@cvg/sandbox`, com `sandbox: 'PROCESS'`, `requiresApproval: true` e argv puro.
- [x] Validação fail-closed: string de comando, argv malformado, cwd que escapa/não existe, intent ausente → `REJECTED` sem spawn; timeout/stdout clampados.
- [x] Mapeamento: `spawn_failed`/`timeout` → `FAILED`; exit code numérico → `SUCCEEDED` com o exit code exposto.
- [x] Guards: escapes de cwd; intent ausente; comando-string recusado; runner default real com bubblewrap (fumaça, `skipIf` host sem bwrap); runner injetado para casos sem host.
- [x] Integração `createOperationalHarness` + `createLocalSandboxGate`: comando aprovado executa no workspace (`COMPLETED`); sem approval → `APPROVAL_REQUIRED`; sem gate → `UNSAFE_REQUEST`.
- [x] `@cvg/sandbox` PUBLIC_API/consumer-surface: `createShellTool` publicado.
- [x] Verdes: guards + suíte completa, `tsc --noEmit`, `eslint`, prettier, `docs:check-links`.

## Verificação

- `npx vitest run packages/sandbox packages/harness/src/__tests__/pdsh-013-shell-integration.test.ts`.
- `npx tsc -p tsconfig.typecheck.json --noEmit`; `npm run lint`; prettier; `npm run docs:check-links`.
- Suíte completa sem regressão (guards PDSH-010 7/7, PDSH-011 25+4, PDSH-012 15+4, PDSH-004 6/6 intactos).

## Fora de escopo

PDSH-014..016, `products/**`, push/deploy/release.

## Notas de fechamento (BUILD, 12/10/2026)

- **Entregue**: `packages/sandbox/src/shell-tool.ts` (`createShellTool` — tool `shell.run`), exportada por `@cvg/sandbox`; confinamento de path extraído para módulo interno compartilhado `packages/sandbox/src/confine.ts` (usado por `fs-tools` e `shell-tool`, sem mudança de comportamento — guarda fs 15/15 intacta); guards `pdsh-013-shell-tool.test.ts` (18 testes) e integração `pdsh-013-shell-integration.test.ts` (4 testes) via `createOperationalHarness` + `createLocalSandboxGate`; `createShellTool` publicado em `PUBLIC_API.md` (linha na tabela de entry points + 3 linhas novas na seção `supported-exports`) e no `consumers-public-surface.test.ts` (PINNED: +`createShellTool`). Suíte completa **350 files / 2917 passed**; `tsc`, `eslint`, prettier, `docs:check-links` verdes; guards PDSH-010 (7/7), PDSH-011 (25+4), PDSH-012 (15+4) e PDSH-004 (6/6) intactos.
- **Deviations declaradas**:
  1. _Runner injetável com default real_: o corpo da tool não recebe o `SandboxHandle` do kernel (mesma restrição de PDSH-012), então o runner **default** constrói o próprio handle `PROCESS` a partir da raiz vinculada na composição e delega a `runContained` (SPEC 0196); `ShellToolOptions.run` permite injetar um backend para testes sem host. A contenção primária continua sendo o gate `PROCESS` do kernel (sem gate → `UNSAFE_REQUEST` antes do corpo).
  2. _Exit ≠ 0 é `SUCCEEDED`_: exit code numérico (qualquer) vira `SUCCEEDED` com `{ exitCode, stdout, stderr, truncated }` — exit ≠ 0 é sinal legítimo do comando (ex.: `grep` sem match); a tool não converte exit code em falha de governança. `spawn_failed`/`timeout` → `FAILED` (falhas de contenção/lançamento, nunca exit codes).
  3. _Sem journal dedicado de comandos_: diferente de `fs.write`/`fs.edit`, `shell.run` não exige journal próprio — approval obrigatório (`requiresApproval: true`) + audit log `tool/call` (I5, inclui `argv` e `intent`) + effect ledger do kernel governam a chamada; um journal de comandos pode acompanhar o catálogo (PDSH-014) se o host precisar.
  4. _Sem allowlist de binários_: o argv do chamador roda como está dentro do namespace (a contenção é o sandbox, não um filtro de strings); política de binários permitidos, se necessária, é escopo do catálogo (PDSH-014).
- **Lockfile**: intocado (sem novas dependências).
