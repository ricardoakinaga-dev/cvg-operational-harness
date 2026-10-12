# 0195 — SPEC: PDSH-010 — Seam de sandbox (modo, enforcement, fail-closed)

- Task: `PARE-DSH-20261011`, cartão `PDSH-010` (plano [0375](../03_build/0375_plano_pareamento_motor_dsh.md), Onda 2).
- Trilha T3 (SPEC curta antes do BUILD; segurança/identidade/policy mantêm a trilha mais alta).
- Invariantes: ADR-011 (um spine de governança; o sandbox é um enforcement de capability, não um segundo runtime), ADR-005 (policy governs effects — o sandbox é enforcement de efeito, não substituto de policy/approval), ADR-010 (`boundary:products`), fail-closed, produção `NO_GO`, sem dado real, lockfile intacto, `products/**` intocado, `apps/**`/`legacy/**` intocados nesta fatia.

## Objetivo

Definir a seam (ponto de encontro) de sandbox para as ferramentas reais da Onda 2 (`fs`, `shell`, egress de exames), antes de qualquer código: **modo de sandbox, ponto de enforcement, e o contrato fail-closed**. PDSH-011..013 e PDSH-016 constroem sobre esta seam; PDSH-014 (catálogo) a expõe.

Hoje não existe nenhuma menção a "sandbox" em `packages/**` (verificado por busca). As ferramentas de capability rodam in-process, sem contenção de filesystem/rede/processo além do que o descriptor declara (`sideEffect`, `risk`, `requiresApproval`). A seam de sandbox introduce uma camada de enforcement **entre a decisão de policy/approval e a execução da capability**, sem duplicar o spine de governança.

## Contratos existentes que a seam usa (não substitui)

- `ToolDescriptor` / `CapabilityDescriptor` (`packages/contracts/src/contracts.ts`): `id`, `version`, `risk`, `sideEffect` (`READ`/`WRITE`/`EXTERNAL`/`NONE`), `idempotent`, `requiresApproval`; `CapabilityDescriptor` adiciona `origin`, `providerId`, `providerVersion`.
- `ToolExecutionContext` (`contracts.ts`): `tenantId`, `agentId`, `correlationId`, `traceId`, `operationKey`, `signal`.
- `ToolResult` (`contracts.ts`): `SUCCEEDED` | `FAILED` | `REJECTED`.
- Pipeline único (`packages/harness/src/kernel/pipeline.ts` `runToolCall`): gate `tool/pre-execute` antes da capability; journal/audit/telemetry no mesmo spine.

A seam **não** altera esses contratos; acrescenta um contrato novo de sandbox e um enforcement point.

## Decisões de design

### 1. Onde a seam vive

Nova seam em `packages/contracts` (contratos puros) + implementação de enforcement em `packages/harness` (o spine único), com a implementação concreta de contenção num pacote novo `packages/sandbox` (PDSH-011). Motivo: o enforcement precisa rodar no mesmo ponto de gate de efeito que já governa tools (`tool/pre-execute`), para não haver um segundo caminho de execução não-governado.

```
decision (policy) → approval (se exigido) → SANDBOX GATE (esta seam) → capability.execute
```

O sandbox gate **não** decide _se_ uma ação é permitida (isso é policy/approval); ele decide _sob que contenção_ uma ação já permitida roda, e **falha fechado** quando a contenção exigida não está disponível.

### 2. Modo de sandbox

Um enum fechado, declarado por capability (default derivável do descriptor) e resolvido no registro/`compositionFingerprint`:

| Modo         | O que contém                                                                                                                                                                             | Uso                                                      |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `NONE`       | Nenhuma contenção de fs/rede/processo. Válido só para capability puramente determinística sem E/S (ex.: cálculo sobre input já em memória).                                              | raríssimo; default não é `NONE`                          |
| `IN_PROCESS` | Sem subprocesso, sem acesso a fs fora do workspace do tenant via helpers do harness; rede negada. Capability roda no processo do worker sob as portas do harness.                        | `fs.read` sobre workspace sintético, `knowledge` lookups |
| `WORKSPACE`  | `IN_PROCESS` + escrita restrita a um diretório de workspace do tenant (mount virtual / path allowlist), com journal de escrita.                                                          | `fs.write`/`fs.edit` com gate de intenção                |
| `PROCESS`    | Subprocesso isolado (em PDSH-011: bubblewrap/Landlock no Linux; fallback `partial` explícito quando indisponível), sem shell de login, sem interporlação, timeout, sem rede por default. | `shell` limitada                                         |
| `EGRESS`     | `IN_PROCESS` + saída de rede apenas para um alvo allowlistado com SSRF guard, exigindo aprovação e journal (PDSH-016).                                                                   | upload/download de exames                                |

Regra fail-closed: uma capability que declare um modo obrigatório e cuja plataforma só ofereça um modo **inferior** não roda — `REJECTED` com `sandbox_unavailable`, não downgrade silencioso.

### 3. Enforcement point

Um gate único, análogo aos gates já existentes, disparado em `tool/pre-execute` (ou imediatamente antes de `CapabilityImplementation.execute`):

- **In:** o `CapabilityDescriptor` (com o modo resolvido), o `ToolExecutionContext`, a policy decision já tomada, o approval já resolvido.
- **Out:** `ALLOWED(mode)` com um `SandboxHandle` (workspace path, env vars permitidas, budget de subprocesso, deadline) **ou** `DENIED(reason)` / `UNAVAILABLE(reason)`.

Se o resolver de sandbox lançar exceção ou devolver indefinido → **`UNAVAILABLE` (fail-closed)**: a capability não executa, vira stop reason auditável `SANDBOX_UNAVAILABLE`, nunca executa "solta".

### 4. Fail-closed (invariante)

Em qualquer composição (single-pass, iterativo, worker durável):

1. Sem seam de sandbox configurada → capability com modo ≠ `NONE` **não roda** (stop `SANDBOX_UNAVAILABLE`). Nunca cai para execução in-process sem contenção.
2. Modo exigido > modo disponível → `UNAVAILABLE`, nunca downgrade.
3. Qualquer erro do enforcement → `UNAVAILABLE`, nunca `ALLOWED`.
4. O `SandboxHandle` é o único canal por qual a capability ganha fs/rede/processo; capability não recebe credencial nem path cru.
5. O journal de efeito (PDSH-012/016) é alimentado pelo `SandboxHandle`, não pela capability diretamente.

### 5. Contratos novos (em `packages/contracts`)

```ts
export type SandboxMode =
  | 'NONE'
  | 'IN_PROCESS'
  | 'WORKSPACE'
  | 'PROCESS'
  | 'EGRESS'

export interface SandboxPolicy {
  readonly requiredMode: SandboxMode
  readonly workspaceScoped: boolean // exige workspace do tenant
  readonly networkAllowed: boolean
  readonly subprocessAllowed: boolean
  readonly timeoutMs?: number
}

export type SandboxGateOutcome =
  | {
      readonly kind: 'allowed'
      readonly mode: SandboxMode
      readonly handle: SandboxHandle
    }
  | { readonly kind: 'denied'; readonly reason: string }
  | { readonly kind: 'unavailable'; readonly reason: string }

export interface SandboxHandle {
  readonly mode: SandboxMode
  readonly workspaceRoot?: string // presente em WORKSPACE
  readonly allowNetwork: boolean
  readonly allowSubprocess: boolean
  readonly deadlineMs?: number
  // PDSH-012/016: journal/audit hooks para escrita e egress ficam aqui.
}

export interface SandboxGate {
  evaluate(input: {
    readonly descriptor: CapabilityDescriptor
    readonly context: ToolExecutionContext
    readonly policy?: SandboxPolicy // override explícito; senão deriva do descriptor
  }): Promise<SandboxGateOutcome>
}
```

`SandboxPolicy` pode ser derivada do `CapabilityDescriptor` (ex.: `sideEffect: 'EXTERNAL'` → `EGRESS`; `READ` sobre knowledge → `IN_PROCESS`) ou declarada explicitamente no registro da capability. A derivabilidade fica para PDSH-011/012; a seam só define o formato e a precedência (declarado > derivado).

### 6. Integração com o kernel (sem segundo spine)

- `kernel/pipeline.ts` `runToolCall` ganha uma chamada ao `SandboxGate` entre o gate `tool/pre-execute` e a execução da capability. Se o host não injetar um `SandboxGate`, o default é o gate fail-closed (capacidade com modo ≠ `NONE` → `UNAVAILABLE`).
- `createOperationalHarness` aceita `sandbox?: SandboxGate` como porta opcional, como já faz para `policy`/`approvals`. Sem porta → fail-closed para ferramentas com contenção; ferramentas `NONE` continuam funcionando.
- O gate **não** consome orçamento de modelo; é enforcement de efeito, não de turno.

### 7. O que esta seam NÃO faz (escopo dos próximos cartões)

- **Não implementa contenção** (bubblewrap/Landlock/path allowlist/SSRF): é PDSH-011 (sandbox local) e PDSH-016 (egress).
- **Não implementa `fs`/`shell`**: é PDSH-012/013; constroem usando o `SandboxHandle`.
- **Não decide policy nem approval**: continua em `@cvg/policy-engine` / approval-engine.
- **Não é o catálogo**: PDSH-014 expõe o modo por capability no `TOOL_CATALOG.md`.

## Critérios de pronto (do plano 0375)

- [x] Seam definida: modo, enforcement point, contrato fail-closed (SPEC 0195).
- [x] BUILD de PDSH-010: contrato `SandboxGate`/`SandboxMode`/`SandboxHandle` em `packages/contracts`, porta `sandbox?` em `createOperationalHarness`, enforcement em `runToolCall` com default fail-closed, guarda de regressão (capability com modo ≠ `NONE` sem gate → `SANDBOX_UNAVAILABLE`; gate `UNAVAILABLE` → capability não executa), verdes de suíte/`tsc`/lint.

## Notas de fechamento (BUILD)

- Modo é **declarado** no descriptor (`ToolDescriptor.sandbox?: SandboxMode`), nunca inferido do `sideEffect`: a ausência do campo (ou `'NONE'`) significa nenhum gate, então ferramentas legadas de efeito continuam funcionando até optarem por contenção. `requiredSandboxMode` em `kernel/pipeline.ts` é a única leitura.
- `sandbox` é porta opcional: está fora de `REQUIRED_SERVICES`/`CONTROL_SERVICES` e fora do boot do kernel; o enforcement usa `host.has('sandbox')` antes de `host.get('sandbox')` e falha fechado (`UNSAFE_REQUEST`) quando ausente, quando o gate reporta `denied`/`unavailable`, ou quando o gate lança.
- Ponto de enforcement: `enforceSandbox` corre em `runToolCall` entre os gates de controle (`tool/pre-execute`, guards, approval) e o corpo da capability; o `SandboxHandle` fica em `call.sandboxHandle` como o único canal de fs/rede/processo.
- Porta threading: `SandboxGate` → `sandboxControl` em `kernel/controls.ts` → `standardKernelPlugins`/`createKernelRuntime` (perfis) → `HarnessRuntimeOptions`/`SinglePassGovernedRuntime` → `createOperationalHarness`. O caminho iterativo (`IterativeGovernedRuntime`) não recebe a porta nesta fatia e por isso falha fechado para qualquer ferramenta declarada como contida — correto e intencional.
- Verdes: guarda `pdsh-010-sandbox-seam.test.ts` 7/7; suíte completa 2847 passed / 3050 total; `tsc --noEmit` limpo; `eslint` limpo; prettier aplicado; `docs:check-links` `DOC_LINKS_OK` + `EVIDENCE_HYGIENE_OK`.

## Verificação (para o BUILD de PDSH-010)

- `npx tsc -p tsconfig.typecheck.json --noEmit` limpo.
- `npx vitest run packages/harness packages/agent-runtime tests/conformance tests/architecture` 100% PASS.
- `npx prettier --check` nos arquivos tocados; `npm run lint` limpo.
- `npm run docs:check-links`.

## Fora de escopo

- PDSH-011..013, PDSH-016 (implementação de contenção e ferramentas).
- PDSH-014 (catálogo), PDSH-015 (skills filesystem).
- Qualquer mudança de `products/**`, `apps/**`, `legacy/**` nesta fatia.
