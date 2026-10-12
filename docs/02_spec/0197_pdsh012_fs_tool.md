# 0197 — SPEC: PDSH-012 — Tool `fs` (leitura livre no workspace do tenant; escrita/edit com gate de intenção, journal e auditoria)

- Task: `PARE-DSH-20261011`, cartão `PDSH-012` (plano [0375](../03_build/0375_plano_pareamento_motor_dsh.md), Onda 2).
- Trilha T3; depende de [0195](0195_pdsh010_sandbox_seam.md) (PDSH-010 `DONE`) e [0196](0196_pdsh011_sandbox_local.md) (PDSH-011 `DONE`).
- Invariantes: ADR-011 (um spine de governança — a tool fs é uma capability registrada no registry existente, não um segundo runtime), ADR-005 (policy governs effects), ADR-010 (`boundary:products`), fail-closed, produção `NO_GO`, sem dado real, `products/**` intocado, `apps/**`/`legacy/**` intocados.

## Objetivo

Entregar as capabilities `fs.read`, `fs.list`, `fs.write` e `fs.edit` como `ToolDefinition`s prontas para composição: leitura e listagem livres **dentro** do workspace do tenant; escrita e edição protegidas por **gate de intenção** (declaração explícita de intenção no input), **journal de escrita pré-mutação** e **auditoria** correlacionada. Toda execução passa pela seam de sandbox de PDSH-010 (`sandbox: 'WORKSPACE'` declarado no descriptor) e pela contenção de path desta tool (defense in depth: a gate concede o modo; a tool confina cada path).

Este cartão entrega as capabilities e o confinamento de path. O catálogo gerado que as publica é PDSH-014; egress de arquivos por canal aprovado é PDSH-016.

## Decisões de design

### 1. Fábrica e vínculo de workspace

```ts
// packages/sandbox/src/fs-tools.ts — exportado pela raiz @cvg/sandbox
export function createFsTools(
  options: FsToolsOptions
): readonly ToolDefinition[]
```

```ts
export interface FsWriteJournalEntry {
  readonly tenantId: string
  readonly operationKey: string
  readonly toolId: string // fs.write | fs.edit
  readonly path: string // relativo ao workspace, normalizado
  readonly intent: string // declaração livre, limitada
  readonly action: 'write' | 'edit'
  readonly bytes: number // tamanho do conteúdo resultante
  readonly sha256: string // hash do conteúdo resultante
  readonly recordedAt: string // ISO-8601, ANTES da mutação
}

export interface FsWriteJournal {
  record(entry: FsWriteJournalEntry): Promise<void>
}

export interface FsToolsOptions {
  /** Raiz do workspace do tenant; todo path é confinado a ela por realpath. */
  readonly workspaceRoot: string
  /** Journal de escrita; ver requireWriteJournal. */
  readonly writeJournal?: FsWriteJournal
  /** Quando true, escrita/edit sem journal configurado é REJECTED (fail-closed). */
  readonly requireWriteJournal?: boolean
  /** Limites com defaults; expostos para composição e testes. */
  readonly limits?: Partial<FsLimits>
}
```

O vínculo ao workspace acontece **na composição** (o host cria a tool com o `workspaceRoot` do tenant). O `SandboxHandle` não é repassado ao corpo da tool pelo kernel (PDSH-010 grava-o em `call.sandboxHandle`), então a tool não depende do handle para achar a raiz — ela revalida o confinamento por conta própria. A raiz é validada no boot da fábrica (absoluta, existe, é diretório, `realpath` aplicado).

### 2. Descriptor e matriz

| Tool       | `sideEffect` | `sandbox`   | `risk`   | `idempotent` | Intent gate | Journal |
| ---------- | ------------ | ----------- | -------- | ------------ | ----------- | ------- |
| `fs.read`  | `READ`       | `WORKSPACE` | `LOW`    | `true`       | não         | não     |
| `fs.list`  | `READ`       | `WORKSPACE` | `LOW`    | `true`       | não         | não     |
| `fs.write` | `WRITE`      | `WORKSPACE` | `MEDIUM` | `false`      | **sim**     | **sim** |
| `fs.edit`  | `WRITE`      | `WORKSPACE` | `MEDIUM` | `false`      | **sim**     | **sim** |

- `sandbox: 'WORKSPACE'` em todas: qualquer toque no fs do tenant exige a porta de PDSH-010 — sem gate configurado o kernel para (`UNSAFE_REQUEST`); com gate local de PDSH-011, `WORKSPACE` exige base válida.
- `requiresApproval: false` no descriptor: a exigência de approval, quando o perfil do agente/política pedir, é decidida pelos gates de policy/approval existentes do kernel — esta tool não duplica essa decisão.

### 3. Confinamento de path (defense in depth)

Toda operação resolve o path sob `workspaceRoot` e recusa (fail-closed, `ToolResult.status: 'REJECTED'`):

1. path vazio, não-string, ou absoluto;
2. path com comprimento > `limits.maxPathLength` (default 4096);
3. resolução `path.resolve(root, rel)` que escapa da raiz (`..`);
4. `realpath` final (após symlinks) fora da raiz — inclusive symlink apontando para fora;
5. componente oculto `.cvg-fs-tmp-*` no path final (namespace interno da escrita atômica).

`fs.write` e `fs.edit` usam escrita atômica: arquivo temporário `.cvg-fs-tmp-<rand>` no mesmo diretório + `rename`. O temp é removido em qualquer falha.

### 4. Gate de intenção (escrita/edit)

`fs.write` e `fs.edit` exigem no input:

- `path: string` (relativo ao workspace);
- `intent: string` — declaração do porquê da mutação; não vazia, ≤ 200 chars após trim. Intent ausente/vazia/longa → `REJECTED` **antes** de qualquer I/O de escrita e antes do journal;
- `fs.write`: `content: string` (UTF-8; ≤ `limits.maxWriteBytes`, default 1 MiB);
- `fs.edit`: `find: string` (não vazio) e `replace: string` — o `find` deve ocorrer **exatamente uma vez** no arquivo (0 ocorrências ou >1 → `FAILED` com erro claro; a tool nunca adivinha o alvo).

Ordem de uma escrita/edit: validação de input → confinamento de path → intent gate → journal `record()` (pré-mutação) → leitura atual (`edit`) → mutação atômica → saída. Se o journal lançar, a mutação **não** acontece (`FAILED`, erro do journal). `requireWriteJournal: true` sem `writeJournal` configurado → `REJECTED` no intent gate (a composição que exige journal não sobrevive sem ele).

Auditoria: o input completo (incluindo `intent`) já vai para o log `tool/call` do kernel (I5) e o ledger de efeitos do kernel cobre `operationKey` (reserve/started/confirm/fail em `dispatch`). O `FsWriteJournal` é o ledger dedicado de intenções de escrita, para hosts que precisam de um registro próprio de "o que foi escrito e por quê", correlacionável por `operationKey`+`tenantId`.

### 5. Limites (defaults)

```ts
export interface FsLimits {
  readonly maxPathLength: number // 4096
  readonly maxReadBytes: number // 1 MiB
  readonly maxWriteBytes: number // 1 MiB
  readonly maxListEntries: number // 500
  readonly maxIntentLength: number // 200
}
```

- `fs.read`: arquivo > `maxReadBytes` → `FAILED` (não truncar silenciosamente).
- `fs.list`: diretório com > `maxListEntries` entradas → `FAILED`; entradas reportadas como `{ name, kind: 'file' | 'directory' | 'other' }`, sem follow de symlink para fora.
- Limites não passam de 8 MiB mesmo se a composição pedir mais (teto absoluto).

### 6. O que este cartão NÃO faz

- **Não** publica catálogo (PDSH-014).
- **Não** faz egress/upload/download por canal (PDSH-016).
- **Não** decide approval (gates existentes do kernel).
- **Não** muda `kernel/pipeline.ts`, os contratos de SPEC 0195 ou o gate local de SPEC 0196.
- **Não** roda nada via subprocesso (PDSH-013).

## Critérios de pronto (plano 0375)

- [x] `createFsTools` em `packages/sandbox`, exportada por `@cvg/sandbox`, com as quatro tools e confinamento de path (symlink/`..`/absoluto).
- [x] Gate de intenção em `fs.write`/`fs.edit`: intent obrigatório, journal pré-mutação, `requireWriteJournal` fail-closed; escrita atômica.
- [x] Guards: escapes recusados; intent ausente/vazio → `REJECTED` sem mutação; journal que excepciona → `FAILED` sem mutação; `edit` com 0/>1 ocorrências → `FAILED`; sem gate de sandbox no kernel → `UNSAFE_REQUEST` (fail-closed).
- [x] Integração `createOperationalHarness` com `createLocalSandboxGate` + tools fs: leitura completa no workspace; escrita com intent journada e efeito visível.
- [x] `@cvg/sandbox` publicado em `docs/architecture/PUBLIC_API.md` + `tests/consumers-public-surface.test.ts`.
- [x] Verdes: `vitest packages/sandbox packages/harness tests/conformance tests/architecture tests/consumers-public-surface` + suíte completa, `tsc --noEmit`, `eslint`, prettier, `docs:check-links`.

## Verificação

- `npx vitest run packages/sandbox packages/harness/src/__tests__/pdsh-012-fs-tools.test.ts packages/harness/src/__tests__/pdsh-012-fs-integration.test.ts`.
- `npx tsc -p tsconfig.typecheck.json --noEmit`; `npm run lint`; prettier; `npm run docs:check-links`.
- Suíte completa sem regressão (guards PDSH-010 7/7, PDSH-011 25+4, PDSH-004 6/6 intactos).

## Fora de escopo

PDSH-013..016, `products/**`, push/deploy/release.

## Notas de fechamento (BUILD, 12/10/2026)

- **Entregue**: `packages/sandbox/src/fs-tools.ts` (`createFsTools` — `fs.read`/`fs.list`/`fs.write`/`fs.edit`), exportado por `@cvg/sandbox`; guards `pdsh-012-fs-tools.test.ts` (15 testes) e integração `pdsh-012-fs-integration.test.ts` (4 testes) via `createOperationalHarness` + `createLocalSandboxGate`; `@cvg/sandbox` publicado em `PUBLIC_API.md` (tabela entry points + seção `supported-exports`, estabilidade `experimental`) e no `consumers-public-surface.test.ts` (PINNED `detectSandboxCapabilities`/`createLocalSandboxGate`/`createFsTools`). Suíte completa **348 files / 2895 passed**; `tsc`, `eslint`, prettier, `docs:check-links` verdes; guards PDSH-010 (7/7), PDSH-011 (25+4) e PDSH-004 (6/6) intactos.
- **Deviations declaradas**:
  1. _Sem auto-`mkdir`_: `fs.write` não cria diretório pai — o arquivo temporário da escrita atômica falha com `FAILED` se o pai não existe; o journal **pré-mutação** já registrou a intenção (visível para reconciliação), e o teste cobre esse caso explicitamente.
  2. _REJECTED vira `TOOL_FAILURE` no kernel_: uma tool que retorna `REJECTED` (intent ausente, path que escapa) resulta em stop `TOOL_FAILURE` da virada — falha governada, não sucesso silencioso e não `UNSAFE_REQUEST` (que é reservado para violações de contenção do gate).
  3. _`requireWriteJournal`_: a composição que exige journal **falha no boot** da fábrica se o journal não foi passado (fail-closed na origem), em vez de rejeitar toda escrita em runtime; a checagem runtime correspondente permanece como defense in depth.
  4. _Limites_: `clamp` aplica teto absoluto de 8 MiB para `maxReadBytes`/`maxWriteBytes` mesmo se a composição pedir mais (SPEC §5).
- **Lockfile**: intocado nesta fatia (novo symlink `node_modules/@cvg/sandbox` criado pelo `npm install` local, sem diff de lock; os 3 hunks existentes são os do PDSH-011, já declarados).
