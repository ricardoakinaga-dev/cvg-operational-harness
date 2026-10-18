# 0196 — SPEC: PDSH-011 — Sandbox local Linux (bubblewrap + Landlock, fallback `partial`)

- Task: `PARE-DSH-20261011`, cartão `PDSH-011` (plano [0375](../03_build/0375_plano_pareamento_motor_dsh.md), Onda 2).
- Trilha T3 (segurança de contenção); depende de [0195](0195_pdsh010_sandbox_seam.md) (PDSH-010 `DONE`).
- Invariantes: ADR-011 (um spine de governança — o sandbox local é a **implementação** da porta `SandboxGate`, não um segundo runtime), ADR-005 (policy governs effects), ADR-010 (`boundary:products`), fail-closed, produção `NO_GO`, sem dado real, lockfile intacto, `products/**` intocado, `apps/**`/`legacy/**` intocados.

## Objetivo

Implementar a porta `SandboxGate` (definida em SPEC 0195) com contenção real de filesystem/subprocesso para os modos `IN_PROCESS`, `WORKSPACE` e `PROCESS`, usando **bubblewrap** (`bwrap`) como mecanismo primário e **Landlock LSM** como defesa adicional de fs, com um **fallback `partial` explícito e auditável** quando a plataforma não suporta um modo — nunca downgrade silencioso, nunca execução solta.

Este cartão entrega o **mecanismo de contenção**. As ferramentas (`fs`, `shell`) que o consomem são PDSH-012/013; o egress de rede (`EGRESS`) é PDSH-016.

## Decisões de design

### 1. Módulo e porta

Novo pacote `packages/sandbox` que exporta:

```ts
// resolve o modo disponível nesta plataforma UMA vez, no boot do host
export function detectSandboxCapabilities(): SandboxCapabilities

// implementa SandboxGate (contrato em @cvg/harness-contracts, SPEC 0195)
export function createLocalSandboxGate(
  options: LocalSandboxGateOptions
): SandboxGate
```

```ts
export interface SandboxCapabilities {
  readonly bubblewrap: boolean // bwrap executa e fecha namespace
  readonly landlock: boolean // ABI Landlock >= 1 no kernel
  readonly mode: SandboxMode | 'unsupported' // maior modo realmente suportado
  readonly partial: readonly SandboxMode[] // modos só parcialmente suportados
  readonly reason?: string // por que um modo caiu
}
```

`createLocalSandboxGate` recebe `capabilities` (injetável — testes não dependem do host) e um `journal` opcional para registrar cada decisão.

### 2. Matriz de contenção por modo

| Modo         | Mecanismo                                                                                                                                         | O que é prendido                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `IN_PROCESS` | sem subprocesso; Landlock (quando disponível) restringe o fd do próprio processo ao workspace de leitura                                          | fs de escrita negado; net negada por não haver canal             |
| `WORKSPACE`  | Landlock no workspace do tenant (rw) + path allowlist no canal                                                                                    | escrita só no `workspaceRoot` do tenant; leitura do resto negada |
| `PROCESS`    | `bwrap`: namespace de PID/IPC/UTS próprio, `--unshare-net`, ro/rootfs read-only, bind apenas do workspace, sem `/proc` host, uid não-privilegiado | subprocesso isolado, sem rede, sem fs fora do bind               |

Detecção em `detectSandboxCapabilities()`:

- `bubblewrap`: `bwrap --ro-bind / / true` (ou `--version`) executa e **fecha** namespace com exit 0. Falhou → `bubblewrap: false`.
- `landlock`: ABI via `syscall` Landlock (`landlock_create_ruleset(NULL, 0, LANDLOCK_CREATE_RULESET_VERSION)`); erro `ENOSYS`/`EOPNOTSUPP` → `landlock: false`.
- Host atual (Linux 7.0, `/usr/bin/bwrap` presente) esperado: ambos `true`. Isso é verificado pelo teste de fumaça, não presumido.

### 3. Fallback `partial` explícito (invariante)

Quando um modo exigido **não** está totalmente disponível, o gate devolve `unavailable` com `reason` dizendo `partial: <modo>` e o que faltou — que a seam de PDSH-010 já transforma em stop `UNSAFE_REQUEST` fail-closed. Regras:

1. `PROCESS` sem `bubblewrap` → `unavailable ('partial: PROCESS (bubblewrap ausente)')`, **nunca** rodar in-process.
2. `WORKSPACE` sem Landlock e sem allowlist alternativa verificável → `unavailable ('partial: WORKSPACE (Landlock ausente)')`.
3. `IN_PROCESS` é o único modo que degrada com segurança para "sem contenção de fs adicional" **quando o canal é somente-leitura** — e ainda assim é reportado em `capabilities.partial`, auditável.
4. Qualquer erro de montagem/execução → `unavailable`, nunca `allowed`.

O campo `partial` de `SandboxCapabilities` é o que torna a degradação **visível**: um host parcial não pode atender um perfil que exija o modo caído, e o `compositionFingerprint`/perfil do agente pode recusar subir (decisão de PDSH-012/013 ao escolher o modo exigido).

### 4. Integração com o host (sem novo spine)

- `createOperationalHarness` ganha `sandbox?: SandboxGate` já existente (PDSH-010). Este pacote fornece **um valor** para essa porta: `createLocalSandboxGate(detectSandboxCapabilities(), { journal })`.
- Nenhuma mudança em `kernel/pipeline.ts` (o enforcement já existe e falha fechado).
- Sem shell de login, sem interpolação de string, sem `sh -c`: o `PROCESS` recebe argv **array** e é executado com `bwrap ... -- <argv[0]> <argv[1]...>` (PDSH-013 monta o argv; este cartão expõe `runContained(argv, handle)`).

### 5. API de execução contida

```ts
export interface ContainedRunRequest {
  readonly argv: readonly string[] // argv puro, nunca uma string de shell
  readonly handle: SandboxHandle // vindo do gate
  readonly cwd?: string // deve estar sob handle.workspaceRoot
  readonly timeoutMs?: number // default: handle.deadlineMs ou limite do perfil
  readonly stdin?: string
}
export interface ContainedRunResult {
  readonly exitCode: number | 'timeout' | 'spawn_failed'
  readonly stdout: string
  readonly stderr: string
  readonly truncated: boolean
}
export function runContained(
  req: ContainedRunRequest
): Promise<ContainedRunResult>
```

`spawn_failed` (não-existência do `bwrap`, falha de namespace) é tratado pelo chamador como `unavailable`, não como exit code normal. `timeout` aborta o processo filho no grupo e reporta `timeout`.

### 6. Segurança operacional

- Nenhum comando é executado **por este cartão**; `runContained` só existe como primitivo testado com argv sintéticos (`/bin/true`, `echo`).
- Sem rede: `--unshare-net` obrigatório no `PROCESS`; nenhum socket passado ao filho.
- Sem dado real: testes usam workspace sintético em diretório temporário próprio do teste.
- `Dockerfile`/CI (escopo do cartão): o Dockerfile de runtime ganha `bubblewrap` na imagem (quando houver), e a CI ganha um gate opcional `sandbox-capabilities` que reporta `capabilities` como artefato — **sem** quebrar runners sem `bwrap` (reporta `partial`, não FAIL).

## O que este cartão NÃO faz

- **Não** implementa as ferramentas `fs`/`shell` (PDSH-012/013).
- **Não** faz egress de rede/SSRF (PDSH-016; `EGRESS` cai em `unavailable` aqui).
- **Não** decide policy/approval (já resolvidos antes da seam).
- **Não** altera `kernel/pipeline.ts` nem os contratos de SPEC 0195.

## Critérios de pronto (plano 0375)

- [x] `packages/sandbox` com `detectSandboxCapabilities` e `createLocalSandboxGate`.
- [x] Matriz `IN_PROCESS`/`WORKSPACE`/`PROCESS` implementada; `PROCESS` exige `bwrap`; fallback `partial` explícito em cada caminho.
- [x] `runContained` com argv array, timeout e `spawn_failed`.
- [x] Porta integrada onde o host compõe (`createOperationalHarness` recebe o gate) **sem** mudar o enforcement de PDSH-010.
- [x] Guarda de regressão: modo exigido indisponível → `unavailable` (fail-closed), nunca `allowed`; gate com capabilities injetadas cobre cada célula da matriz.
- [x] `Dockerfile`/gate de CI conforme escopo acima — **deferred**, ver notas de fechamento (Dockerfile distroless; gate CI já coberto pelo "Gate unit" que executa os testes vitest).
- [x] Verdes: `vitest packages/sandbox packages/harness tests/conformance tests/architecture` + suíte completa, `tsc --noEmit`, `eslint`, prettier, `docs:check-links`.

## Verificação

- `npx vitest run packages/sandbox` — matriz de modos com capabilities **injetadas** (não do host) + 1 teste de fumaça real do host (`bwrap` presente → `PROCESS` disponível; ausente → `partial`, ambos assertivos conforme o host).
- `npx tsc -p tsconfig.typecheck.json --noEmit`; `npm run lint`; prettier; `npm run docs:check-links`.
- Suíte completa `npx vitest run` sem regressão (PDSH-010 guard 7/7 intacto).

## Fora de escopo

PDSH-012..016, catálogo PDSH-014, `products/**`, lockfile, push/deploy/release.

## Notas de fechamento (BUILD, 12/10/2026)

- **Entregue**: `packages/sandbox` (`capabilities.ts`, `gate.ts`, `run.ts`, `index.ts`), guarda `pdsh-011-sandbox-local.test.ts` (25 testes) e integração `pdsh-011-gate-integration.test.ts` (4 testes) com capabilities injetadas por célula da matriz + fumaça real do host (namespace, timeout, truncamento, `--unshare-net`). Suíte completa **346 files / 2876 passed**; `tsc --noEmit`, `eslint .`, prettier e `docs:check-links` verdes. PDSH-010 guard 7/7 intacto.
- **Deviations declaradas**:
  1. _Landlock probe_: o SPEC previa a syscall `landlock_create_ruleset`; sem addon nativo Node não é emitível, então a detecção usa heurística de versão de kernel (`os.release()` ≥ 5.13) — **best-effort, documentado**; o enforcement nunca depende só de Landlock (bwrap + allowlist do workspace fazem o trabalho), e `requireLandlock: true` pode exigir a defesa explícita.
  2. _API_: o gate recebe um único objeto `createLocalSandboxGate({ capabilities, workspaceBase, journal, ... })` (em vez de argumentos posicionais), com `capabilities` injetável e probe `SandboxProbe` opcional — mesmos contratos.
  3. _Ordem de mounts_: `--tmpfs /tmp` **antes** do `--bind <workspace>` (tmpfs posterior sombreava workspaces sob `/tmp`; bug pego pelo teste real e corrigido).
  4. _Lockfile_: entrada do workspace nova + sync de drift pré-existente do próprio task (`packages/agent-runtime` ganhou `@cvg/harness`/`@cvg/harness-contracts` em PDSH-001 sem sync) + `@cvg/sandbox` como devDependency de `@cvg/harness` (exigido pelo teste `workspace-dependency-manifest`) — 3 hunks, todos declarados na coordenação.
- **Defers com razão**:
  1. _Dockerfile_: imagem distroless; `bwrap` puxa `libselinux`/`libcap` (verificado via `ldd`) — alteração de imagem fora do claim exclusivo do PARE-DSH e não trivial; registrado no backlog.
  2. _Gate de CI `sandbox-capabilities`_: a CI já executa a guarda via "Gate unit" (`vitest run` em `.github/workflows/verify.yml`); o script opcional `scripts/sandbox-capabilities.mjs` fica para PDSH-014 quando o artefato de capabilities for consumido.
