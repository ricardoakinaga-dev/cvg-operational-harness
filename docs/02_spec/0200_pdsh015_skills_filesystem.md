# 0200 — SPEC: PDSH-015 — Skills filesystem versionadas (manifesto, carregador e registro)

- Task: `PARE-DSH-20261011`, cartão `PDSH-015` (plano [0375](../03_build/0375_plano_pareamento_motor_dsh.md), Onda 2).
- Trilha T2; depende de PDSH-001 `DONE`. Implementa o contrato `SkillDefinition` de [ADR-003](../architecture/adrs/ADR-003-tools-separated-skills.md) (skills são descriptors de requisito/risco, nunca executors de efeito).
- Invariantes: ADR-003 (skills ≠ tools), ADR-011 (um spine — o carregador não vira um runtime paralelo), ADR-010 (`boundary:products`), fail-closed, produção `NO_GO`, sem dado real, `products/**` intocado, `apps/**`/`legacy/**` intocados.

## Objetivo

Entregar skills versionadas no filesystem: um diretório `skills/` na raiz do repositório com um manifesto JSON por skill (formato do `SkillDefinition` de `@cvg/harness-contracts`), um **carregador** que valida os manifestos de forma fail-closed e um **registro** com lookup por id. O catálogo gerado com drift-check que publica estas skills é PDSH-014.

## Decisões de design

### 1. Layout no filesystem

```txt
skills/
  exam-intake/
    skill.json
```

- Um diretório por skill; o id do manifesto deve ser igual ao nome do diretório (drift entre nome e id → erro no carregamento).
- Manifesto `skill.json` (JSON puro — sem YAML, sem dependência nova).
- O carregador aceita o caminho do diretório `skills/` como argumento (composição/testes apontam para fixtures temporárias).

### 2. Manifesto (formato do `SkillDefinition`, contratos §SkillDefinition)

```json
{
  "id": "exam-intake",
  "version": "1.0.0",
  "description": "Conduz o intake de um exame para o workspace do tenant.",
  "requiredTools": ["fs.read", "fs.list"],
  "requiredKnowledge": [],
  "riskLevel": "LOW"
}
```

Campos validados (fail-closed no carregamento):

| Campo               | Regra                                                                |
| ------------------- | -------------------------------------------------------------------- |
| `id`                | string não vazia; `[a-z0-9-]+`; igual ao nome do diretório           |
| `version`           | string não vazia (semver por convenção; não é parseado neste cartão) |
| `description`       | string não vazia                                                     |
| `requiredTools`     | array de strings não vazias (pode ser vazio)                         |
| `requiredKnowledge` | array de strings não vazias (pode ser vazio)                         |
| `riskLevel`         | um de `LOW`/`MEDIUM`/`HIGH`/`CRITICAL` (enum de contratos)           |

Campos extras no JSON → **erro** (vocabulário fechado; o catálogo de PDSH-014 espelha o manifesto, então campo desconhecido é drift). Campos ausentes/wrong-type → erro.

### 3. Carregador e registro

```ts
// packages/harness/src/skills/loader.ts
export interface SkillManifestLoadError {
  readonly skillPath: string
  readonly message: string
}
export function loadSkillsFromDirectory(
  skillsDir: string
):
  | { readonly ok: true; readonly skills: readonly SkillDefinition[] }
  | { readonly ok: false; readonly errors: readonly SkillManifestLoadError[] }
```

- Diretório inexistente/não-diretório → `ok: false` com um erro (fail-closed; não é "zero skills").
- Diretório sem skills (vazio) → `ok: true` com `[]` (vazio é estado válido de um repo novo).
- Um manifesto inválido **não** aborta os outros: todos os erros são coletados; o resultado é `ok: false` se houver qualquer erro (o chamador decide — catálogo e boot devem tratar `ok: false` como falha).
- Entradas que não são diretórios (ex.: `README.md` na raiz de `skills/`) são ignoradas; um diretório sem `skill.json` é **erro** (skill incompleta).
- Semântica de leitura: apenas o próprio filesystem do host; sem rede, sem templates embutidos.

```ts
// packages/harness/src/skills/registry.ts
export interface SkillRegistry {
  get(id: string): SkillDefinition | undefined
  list(): readonly SkillDefinition[]
}
export function createSkillRegistry(
  skills: readonly SkillDefinition[]
): SkillRegistry
```

- Id duplicado (mesmo id, versões diferentes ou iguais) → `throw` no boot do registro (fail-closed; duas skills com o mesmo id são ambiguidade irresolvível).
- Lookup por id apenas (uma skill por id no registro — versionamento histórico fica com o catálogo/git, não com o registro em memória).

```ts
// packages/harness/src/skills/assert.ts
export function assertSkillsAvailable(
  requirements: readonly SkillRequirement[],
  registry: SkillRegistry
): void // throw com a lista completa de faltantes
```

- Para o host validar que o perfil de um agente (`AgentProfile.skills`) está coberto pelo registro antes de rodar; faltantes → throw listando id+versão pedida vs. registrada (ausência de versão pedida = erro; versão diferente da pedida = erro — versão é exigência, não sugestão).

### 4. Skill de exemplo

`skills/exam-intake/skill.json`: intake de exame, `requiredTools: ["fs.read", "fs.list"]` (tools reais de PDSH-012), `riskLevel: "LOW"`, `requiredKnowledge: []`. Serve de fixture viva para o drift-check de PDSH-014 e de exemplo de formato.

### 5. O que este cartão NÃO faz

- **Não** publica catálogo (PDSH-014 — o catálogo passa a listar estas skills).
- **Não** executa skills (ADR-003: skills nunca viram executors de efeito; o kernel continua o único spine).
- **Não** muda `AgentProfile`, os contratos de SPEC 0195 ou o enforcement do kernel.
- **Não** versiona histórico de skills (git é o histórico; o registro é o estado atual).
- **Não** cria workspace novo nem toca o lockfile.

## Critérios de pronto (plano 0375)

- [x] Diretório `skills/` com `exam-intake/skill.json` no formato de `SkillDefinition`.
- [x] `loadSkillsFromDirectory` fail-closed: manifesto inválido/dir inexistente → `ok: false` com erros; id ≠ nome do diretório → erro; campo extra → erro; diretório vazio → `ok: true` com `[]`.
- [x] `createSkillRegistry` com lookup por id; id duplicado → throw.
- [x] `assertSkillsAvailable` lista faltantes (id e versão) e falha em versão divergente.
- [x] Guards cobrindo os casos acima; exports em `packages/harness/src/index.ts` + PUBLIC_API/consumer-surface.
- [x] Verdes: guards + suíte completa, `tsc --noEmit`, `eslint`, prettier, `docs:check-links`.

## Notas de fechamento (12/10/2026)

- Carregador em `packages/harness/src/skills/loader.ts` (fs de `node:fs`, sem dependência nova); registro e assert em `registry.ts`/`assert.ts`; barrel `index.ts`; re-export via `packages/harness/src/index.ts`.
- Manifesto validado como objeto de campo fechado (6 campos de `SkillDefinition`; campo extra → erro — o catálogo de PDSH-014 espelha o manifesto, então campo desconhecido é drift).
- `loadSkillsFromDirectory` coleta todos os erros (não aborta no primeiro) e retorna `ok: false` se houver qualquer erro; diretório inexistente → `ok: false`; vazio → `ok: true` com `[]`; entradas não-diretório ignoradas; diretório sem `skill.json` → erro.
- `createSkillRegistry` throw em id duplicado (mesma ou diferente versão); uma skill por id no registro.
- `assertSkillsAvailable` throw listando todas as faltantes (ausência e versão divergente).
- Skill de exemplo `skills/exam-intake/skill.json` (`requiredTools: ["fs.read","fs.list"]`, `riskLevel: LOW`) — fixture viva para o drift-check de PDSH-014.
- PUBLIC_API.md: 5 linhas novas em `supported-exports` (estabilidade `experimental`) + linha `@cvg/harness` atualizada; `consumers-public-surface.test.ts` PINNED +3 (`loadSkillsFromDirectory`, `createSkillRegistry`, `assertSkillsAvailable`).
- Verdes: guards 22/22; suíte completa **351 files / 2939 passed** (203 skipped); `tsc --noEmit` limpo; `eslint` limpo; prettier; `docs:check-links` `DOC_LINKS_OK`+`EVIDENCE_HYGIENE_OK`. Lockfile intocado.

## Verificação

- `npx vitest run packages/harness/src/__tests__/pdsh-015-*`.
- `npx tsc -p tsconfig.typecheck.json --noEmit`; `npm run lint`; prettier; `npm run docs:check-links`.
- Suíte completa sem regressão (guards PDSH-010..013 e PDSH-004 intactos).

## Fora de escopo

PDSH-014, PDSH-016, `products/**`, push/deploy/release.
