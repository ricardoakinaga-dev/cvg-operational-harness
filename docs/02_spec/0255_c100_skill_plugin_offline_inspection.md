# SPEC0255 — Inspeção offline de skills e plugins: inventário, custo de contexto, admissão e seleção autorizada

**PROPOSTA T3, revisão r4. BUILD não autorizado.** A 0255-A é a **primeira SPEC da PAR-T07**, por [decisão do usuário de 22/10/2026](../04_audit/evidence/C100-T01-INSPECT-SPEC-20261022/decisions-20261022.json). O BUILD só começa depois de seis coisas (§14):

1. o crítico independente aprova sem obrigatórios;
2. o Codex, dono do Claude100, revisa os aceites, **antes** da revisão do usuário; se mudar um aceite, o sha256 muda e o crítico revisa de novo;
3. o usuário revisa esta SPEC (T3), preso ao sha256 que passou pelos itens 1 e 2;
4. C100-Q01/M1 está fechado;
5. a PAR-K05 está integrada e qualificada;
6. há claim próprio.

Nenhuma aprovação anterior (SPEC0229, 0235, 0238, 0248–0253) se transfere. Task `C100-T01-INSPECT-SPEC-20261022`. Autoria: o lead (Claude Code) escreve, e o Codex revisa os aceites. Cartões: [C100-T01 e C100-T02](../03_build/0383_backlog_paridade_claude_code.md) (estado canônico no 0383), [PAR-T07 e reusos](../03_build/0380_backlog_paridade_100_deepseek.md) (estado canônico no 0380). Origem: CC22-01 e CC22-02 do relatório 0623 e o contrato SI01–SI12 da REA de 22/10 (material do Codex fora da `main`; hashes em [spec-r1.json](../04_audit/evidence/C100-T01-INSPECT-SPEC-20261022/spec-r1.json)). Constituição: [D-12/T3](../07_agents/AGENTS.md). Fatos: [recon](../04_audit/evidence/C100-T01-INSPECT-SPEC-20261022/recon.md).

Base: `420b97b3373389f30ac82c4d4078a21b2363fdf9` (`main`), âncoras com tolerância de ±2 linhas. Nenhum dado real, provider, canal, rede, deploy ou produção. Nenhum conteúdo de skill ou plugin é executado, nesta rodada ou no BUILD.

**Histórico.**

- **r1** (`2bb4e541…`): [revisão r1](../04_audit/evidence/C100-T01-INSPECT-SPEC-20261022/spec-review-r1/review.md), REVISE com M1–M7 e O1–O14.
- **r2** (`e03a1553…`): corrigiu M1–M7, incorporou O1–O14, aplicou a decisão do usuário e os defaults do lead e renomeou os mutantes para `MU…`. [Correções da r1](../04_audit/evidence/C100-T01-INSPECT-SPEC-20261022/spec-review-r1/corrections.md). Primitivas conferidas em Node v22.23.2: [sonda r2](../04_audit/evidence/C100-T01-INSPECT-SPEC-20261022/r2-mechanics-probe-output.json).
- [Revisão r2](../04_audit/evidence/C100-T01-INSPECT-SPEC-20261022/spec-review-r2/review.md): REVISE com R2-M1 a R2-M4. Os M1–M7 da r1 ficaram fechados no mérito, e a G1 valeu nos 8 ataques da sonda do crítico.
- **r3** (`6fec67f4…`): corrigiu R2-M1 a R2-M4 e incorporou R2-O1 a R2-O9. [Correções da r2](../04_audit/evidence/C100-T01-INSPECT-SPEC-20261022/spec-review-r2/corrections.md). A [revisão r3](../04_audit/evidence/C100-T01-INSPECT-SPEC-20261022/spec-review-r3/review.md) deu APPROVE, sem obrigatórios, com os opcionais R3-O1 a R3-O8.
- Revisão dos aceites pelo Codex sobre a r3: REVISE, com F01 e F02. Patch e parecer em `docs/04_audit/evidence/UNBLOCK-CLAUDE-20261022/` e no item 5 de `docs/08_runtime/handoffs/unblock_claude_20261022.md`, no checkout principal; os hashes estão no [spec-r4.json](../04_audit/evidence/C100-T01-INSPECT-SPEC-20261022/spec-r4.json). Os dois retrabalhos do `0383:15` já tinham sido usados, e seguiu o [replanejamento](../04_audit/evidence/C100-T01-INSPECT-SPEC-20261022/replan-20261023.md).
- **r4** (esta): replanejamento, só o delta. Aplica o patch do Codex (F01 e F02), propaga a mudança e incorpora R3-O1 a R3-O8. Nada de contrato, aceite ou corte novo. [Correções](../04_audit/evidence/C100-T01-INSPECT-SPEC-20261022/spec-review-r3/codex-corrections.md); [diff r3 → r4](../04_audit/evidence/C100-T01-INSPECT-SPEC-20261022/spec-r4.diff).

## 1. Contexto e evidência (CURRENT)

### 1.1 Skills

- `SkillDefinition` tem seis campos, sem origem, digest ou corpo (`packages/contracts/src/contracts.ts:88-95`).
- O loader da SPEC0200 lê só `skills/<id>/skill.json`. O vocabulário é fechado, e o id tem de ser igual ao diretório (`packages/harness/src/skills/loader.ts:16-23,47-56,68-70,131`).
- Registry e `assertSkillsAvailable` existem como exports experimentais de `@cvg/harness` (`registry.ts:8-27`; `assert.ts:4-31`; `docs/architecture/PUBLIC_API.md:98-102`).
- **Nenhum runtime consome skills.** As composições usam `skills: []` (`packages/sdk/src/server.ts:126`; `packages/platform/src/controlled-kernel-execution.ts:441`). O gerador de catálogo tem um segundo leitor de skills (`scripts/gen-tool-catalog.mjs:103-129`).
- [Sonda do executor](../04_audit/evidence/C100-T01-INSPECT-SPEC-20261022/loader-probe-output.json). O loader atual:
  - carrega diretório e `skill.json` simbólicos que apontam para fora do root;
  - aceita hardlink;
  - aceita descrição de 2 MiB;
  - devolve o caminho absoluto no `skillPath` e na mensagem.

  Causa: `statSync` e `readFileSync` seguem symlink e não têm teto (`loader.ts:104,123,134,138-140`).

### 1.2 Plugins, registry e grant

- `PluginManifestSchema` é `.strict()` e não tem campo de skills, agentes ou MCP (`packages/platform/src/contracts.ts:406-470`).
- `PluginRegistry`, a atestação e o `CapabilityGateway` estão em `plugin-gateway.ts:120-208,496-539,801-865` e `plugin-execution-core.ts:37-73,118-128`. O catálogo por tenant está em `contracts.ts:474-507`.
- Grant no kernel: deny-by-default, e `*` expõe tudo (`packages/harness/src/kernel/kernel-runtime.ts:84-96`). Tool fora de `AgentProfile.tools` dá `POLICY_DENIED` (`kernel-runtime.ts:490-499`).

### 1.3 Peças reutilizáveis e fronteira

- Validador estrito: `validateManifest` (`loader.ts:34-97`), hoje privado.
- Digest canônico: `canonicalizeJson`, com teto de 20.000 nós (`packages/contracts/src/canonical-json.ts:13-14,31`).
- Estimador: `estimateTokens` (`packages/harness/src/context-engine.ts:39-41`).
- Grant: `agentExposesTool` (`kernel-runtime.ts:91-96`), no mesmo pacote.
- Leitura física mais forte do repositório: `readPhysical` com assinatura bigint completa (`dev`, `ino`, `mode`, `nlink`, `size`, `mtimeNs`, `ctimeNs`) antes, durante e depois da leitura (`scripts/boundary-installed-identity.mjs:227-283`). Há precedentes mais fracos em `release-image-contract.mjs:205-245` e `exam-egress.ts:127-149`.
- Redação do host: `redactSensitiveText` (`packages/shared/src/audit-governance.ts:235-271`). Na sonda do crítico, ela deixa passar `ghp_…`, `sk-ant-…`, `AKIA…`, JWT e PEM.
- **Fronteira:** `@cvg/harness` só depende de `@cvg/harness-orchestrator` e `@cvg/harness-contracts` (`config/workspace-dependency-policy.json:130-136`). O harness não importa sandbox, shared nem channel-gateway.

### 1.4 Referência Claude

- Pin 2.1.302; denominador 117 + 17 = 134 (`docs/03_build/0381_plano_executivo_paridade_claude_code.md:15,38,68`).
- No 2.1.308, a REA observou dois comportamentos:
  - `plugin details` com custo always-on (~17 tok) e on-invoke (< 20 com corpo curto, ~1,5 mil com corpo de 6.098 bytes);
  - `plugin validate` com os perfis normal, strict e `--profile directory`.
- No 302, `details` aparece só na ajuda, e `--profile` não existe (recon §4).
- Os requisitos CC100-05-0x são `FUNCTIONAL_PARITY` com `NOT_RUN` (`0383:313,327,729-737`).

### 1.5 Fundação, PAR-T07 e reusos

- C100-Q01 está `IN_PROGRESS`, e M1 não tem receipt (`0383:186-200`; recon §1).
- **PAR-T07 está `TODO`, sem SPEC e sem claim.** `grep -rln PAR-T07 docs/02_spec/` só acha esta SPEC. O cartão:
  - entrega "descoberta por origem com precedência, hash aprovado, observação de mudanças e ferramenta de catálogo para o modelo";
  - tem como aceite "skill que exige ferramenta fora do grant falha ao carregar; skill sem hash aprovado não entra no catálogo";
  - depende da PAR-K05 (`0380:530-537`).
- PAR-K05 está `TODO` e depende da K04 (`IN_PROGRESS`) (`0380:212-219`).

## 2. Decisões vigentes

1. D-12: contrato público, segurança e approval são T3 e exigem revisão explícita do usuário antes do BUILD (`docs/07_agents/AGENTS.md:103`).
2. ADR-003: skill descreve requisito e risco; nunca executa efeito.
3. ADR-010 e ADR-011, mais a política `neutralBoundary` (§1.3).
4. SPEC0200: manifesto JSON fail-closed, vocabulário fechado.
5. `PluginManifestSchema` e `PluginRegistry` ficam sem mudança de contrato.
6. Pin 2.1.302 e denominador 134 não mudam. Observação do 2.1.308 não gera receipt `FUNCTIONAL_PARITY` (`0383:883`).
7. Regras comuns do 0395 e regra do `0383:13` (reuso PAR não reconstrói executor) e do `0394:7` (sem avaliador paralelo).
8. NO_MODEL vigente; esta SPEC não chama modelo.
9. **Decisão do usuário, 22/10/2026** ([registro](../04_audit/evidence/C100-T01-INSPECT-SPEC-20261022/decisions-20261022.json)):
   - a 0255-A é a primeira SPEC da PAR-T07;
   - o `itemDigest` é o hash canônico de skill;
   - o lead escreve, e o Codex (dono do Claude100) revisa os aceites;
   - não há avaliador paralelo;
   - o BUILD espera Q01/M1, a PAR-K05 e a revisão T3 do usuário.
10. **Defaults do lead, 22/10/2026** (mesmo registro), sujeitos à revisão T3 do usuário: modelo de ameaça e plataforma (§3), P8 (endurecer o loader com tabela, §7.12), P4 (chave fora da gramática dá `INVALID`) e ajustes de P11, P12 e P15.

## 3. Modelo de ameaça e plataforma

**Ameaça (default do lead).** O root pode ter um **escritor concorrente não confiável**. Ele cria, troca, renomeia, faz link e altera arquivos e diretórios dentro do root durante a inspeção. Ele não tem privilégio para montar sistema de arquivos nem escrever acima do root. O host que passa o root é confiável.

**Garantias sob esse modelo:**

- **G1 — Nada de fora do root é lido.** Cada diretório é fixado por fd (`O_RDONLY|O_DIRECTORY|O_NOFOLLOW`). Cada filho é aberto por `/proc/self/fd/<dfd>/<nome>`, que emula `openat`. O último componente nunca é seguido. A sonda r2 confirma: depois da troca ABA, a listagem e a leitura continuam no diretório original. **A G1 não depende de timestamp nem de versão de kernel.**
- **G2 — Troca detectada falha fechado; a detecção depende do kernel.** Arquivos e diretórios têm a assinatura bigint completa comparada antes, durante e depois do uso. Mudança dá `FILE_CHANGED_DURING_READ` ou `TREE_CHANGED_DURING_READ`, e o item fica `INCOMPLETE`, nunca `COMPLETE`.
  - Numa troca ABA, só os timestamps mudam: `ctimeNs` no diretório da skill; `mtimeNs` e `ctimeNs` no root (sonda r2 do crítico).
  - Por isso a detecção depende da granularidade do timestamp (P22). Em kernel com timestamp multigrain (6.13 ou mais novo), a troca muda a assinatura.
  - Em kernel sem multigrain, como pode ser o do CI `ubuntu-latest` e o do servidor Ubuntu 24.04, uma troca no mesmo tique do relógio grosso (1 a 4 ms) pode passar sem ser detectada. Mesmo assim, ela nunca leva a ler de fora, porque a G1 continua valendo.
- **G3 — Integridade do corpo.** A seleção devolve exatamente o buffer cujo sha256 entrou no `itemDigest`, sem releitura. O digest tem de ser igual ao aprovado.

**Risco residual.** Uma troca ou escrita no mesmo tique pode passar sem detecção (G2). Nada de fora é lido (G1). Os efeitos possíveis são todos de conteúdo **de dentro** do root:

- leitura rasgada, que muda o digest e não é admitida, salvo se coincidir com o digest aprovado, o que é a própria integridade de G3;
- troca ABA de diretório não sinalizada, em que a leitura continuou presa ao diretório original;
- duplicata que some e volta no mesmo tique durante a busca de nome (§8.11). Ela não muda o que é lido nem o digest exigido.

**Montagem.** Filho com `dev` diferente do root é recusado (`MOUNT_POINT_REFUSED`). Bind mount do mesmo sistema de arquivos mantém o `st_dev` e não é detectado; montar exige privilégio e fica fora do modelo. Subvolume btrfs e overlayfs podem ter `dev` diferente e dar recusa falsa, que falha fechado (P21).

**Plataforma (default do lead).** Linux com `/proc`: servidor on-prem Ubuntu e CI `ubuntu-latest`. A inspeção, a seleção e o loader endurecido recusam com `PLATFORM_UNSUPPORTED`, antes de qualquer acesso a root, quando:

- `process.platform !== 'linux'`;
- `fs.constants.O_DIRECTORY`, `O_NOFOLLOW` ou `O_NONBLOCK` não é número;
- `/proc/self/fd` não é um diretório.

Não há modo degradado.

## 4. Invariantes

- **I1 — Inspeção não é grant.** Nenhuma função desta SPEC instala, habilita, registra, ativa, importa ou executa skill ou plugin. Também não emite approval, nem escreve em usage, budget, catálogo, registry ou banco. `runtimeGrant` é o literal `"NONE"`.
- **I2 — Sem autodiscovery.** Só os roots informados são lidos. Nada de HOME, `.claude`, `CLAUDE.md`, cwd, variável de ambiente, rede ou diretório de terceiros.
- **I3 — Sem seguir link, sob o modelo do §3.** Symlink (root, diretório ou arquivo), hardlink (`nlink > 1`), arquivo especial e ponto de montagem não são seguidos nem abertos. Troca detectada falha fechado (G1, G2).
- **I4 — Limites finitos.** Todo cap tem default e teto rígido, inclusive a listagem de diretório (lida até cap + 1).
- **I5 — Strict preservado.** O manifesto de skill passa pelo mesmo validador da SPEC0200, e o de plugin pelo `PluginManifestSchema`. A inspeção pode ser mais estrita, nunca mais frouxa.
- **I6 — Identidade por conteúdo.** Digests dependem dos bytes lidos, dos caminhos relativos, dos tipos e das recusas. Não dependem de caminho absoluto, mtime, inode, ordem do `readdir` nem tamanho do `lstat` de algo que não é arquivo regular (O1).
- **I7 — Escopos separados.** Cobertura, validação de formato e admissão são campos distintos. A validação de formato e a publicação do digest dependem do contexto do chamador (`hostIdentifiers` e, no perfil `admission`, o grant; §7.11): o mesmo item pode sair `INVALID` no inventário e `VALID` na admissão, o que falha fechado no inventário. O `expected.inputDigest` precisa vir de uma execução com o mesmo perfil e o mesmo contexto (R3-O3).
- **I8 — Corpo só na seleção.** O relatório nunca contém corpo, referência ou conteúdo de arquivo não classificado.
- **I9 — Saída sem caminho absoluto e sem segredo nos padrões do redator do host.** O texto livre (descrição) e os identificadores passam pelo redator injetado (§7.11). O que o redator não reconhece não é detectado; isso é limitação declarada, não garantia. Os marcadores são ordinais (`<redacted:N>` e `<unsafe:N>`), sem hash do valor, e item com valor redigido não publica nada calculado sobre o valor bruto (§7.11). Limitação: o `sha256` publicado de um arquivo pequeno é um oráculo para um valor enumerável redigido na descrição desse arquivo.
- **I10 — Estimativa não é cobrança** (`measuredUsage: false`).
- **I11 — Id = diretório.** Para todo item `VALID`, o id é igual ao nome do diretório (`ID_PATTERN`, ASCII minúsculo). Por isso a unicidade se confere por busca do nome.
- **I12 — Fora do caminho de requisição.** As funções são síncronas, com prazo de até 60 s. Não rodam no caminho de requisição da API (O13).

## 5. Corte, fatias e relação com a PAR-T07

| Fatia      | Conteúdo                                                                                                        | Estado na r4                                                      | Cartões                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **0255-A** | Skills: aquisição fixada por fd, inventário, custo, admissão contra grant e hash aprovado, seleção do corpo     | contrato completo para revisão                                    | **primeira SPEC da PAR-T07**; contribui para C100-T01 (CC100-05-01 a 03) |
| **0255-B** | Plugins: projeção sobre o inventário da PAR-H04, componentes, dependências, requisitos e custo                  | só contrato (§10); exige revisão futura                           | C100-T02 (parcial)                                                       |
| 0255-C     | Seleção no contexto da sessão, invocação pelo modelo, referências sob demanda, ferramenta de catálogo do modelo | fora desta SPEC; usa só digests do catálogo aprovado da T07 (P11) | C100-T01 (restante), PAR-T07 (restante), K05, C06                        |

**Mapa PAR-T07 → 0255-A** (`0380:535-537`):

| Item do cartão T07                               | Na 0255-A                                                                                                   | Situação                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Hash aprovado                                    | `itemDigest` = **hash canônico de skill v1** (§8.9); a admissão exige digest aprovado igual                 | base da T07                             |
| Aceite "sem hash aprovado não entra no catálogo" | `DIGEST_NOT_APPROVED`; o "catálogo" desta fatia é o conjunto admitido; o catálogo persistido é fatia futura | base da T07 (parcial: sem persistência) |
| Aceite "tool fora do grant falha ao carregar"    | `TOOL_NOT_GRANTED` na admissão e `REFUSED` na seleção (carregar = selecionar o corpo)                       | base da T07                             |
| Descoberta por origem com precedência            | roots com label; id duplicado é **recusado**, sem precedência                                               | proposta à T07 (P17), sujeita ao dono   |
| Observação de mudanças                           | drift e troca detectados sob demanda; sem watcher                                                           | parcial; watcher fica para a T07        |
| Ferramenta de catálogo para o modelo             | não                                                                                                         | 0255-C                                  |

**Esta rodada (T1) entrega só documentos.** Não há código, teste, ledger nem mudança de cartão. ROM do delta, dentro da ROM dos pais: 0255-A, 5 a 8 dias (subiu por causa do fd e das provas de corrida); 0255-B, 3 a 6 dias.

## 6. Escopo e não-escopo

**Dentro (0255-A):** §7 a §9 e §11 a §13.

**Fora:**

- gestão de plugin (PAR-H04);
- quiescência (PAR-K04);
- perfis e skills por sessão (PAR-K05);
- instruções de workspace (PAR-C06);
- catálogo persistido e fluxo de aprovação de digest (fatias seguintes da PAR-T07);
- CLI e console (PAR-H01/H04);
- agrupar skills num plugin (muda o schema; CC100-05-05);
- invocação pelo modelo (0255-C);
- regras de marketplace;
- tolerância a campo desconhecido;
- scaffolds;
- mudar pin, denominador ou estado de cartão;
- produção, release e dado real.

## 7. PROPOSED — contrato da 0255-A (skills)

### 7.1 Superfície pública

Export experimental de `@cvg/harness` (`packages/harness/src/skills/index.ts`). Não entra em `@cvg/harness-contracts` (P9).

```ts
export const SKILL_INSPECTION_METHOD_VERSION = 'cvg-skill-inspect-v1'
export const SKILL_CANONICAL_HASH_VERSION = 'cvg-skill-hash-v1' // hash canônico de skill da PAR-T07
export const SKILL_CONTEXT_ESTIMATOR_VERSION = 'cvg-chars4-v1'
export const SKILL_INSPECTION_DEFAULT_LIMITS: Readonly<SkillInspectionLimits>
export const SKILL_INSPECTION_LIMIT_CEILINGS: Readonly<SkillInspectionLimits>

export function inspectSkills(
  input: SkillInspectionInput,
  deps: SkillInspectionDeps
): SkillInspectionReport

export function selectSkillBody(
  input: SkillSelectionInput,
  deps: SkillInspectionDeps
): SkillSelectionResult

export class SkillInspectionError extends Error {
  readonly code: 'INPUT_INVALID' | 'REDACTOR_MISSING' | 'PLATFORM_UNSUPPORTED'
  readonly field: string | null // nome do campo, de charset fixo; nunca o valor
  // message = `${code}${field ? ':' + field : ''}`; nada do input
}
```

Os ganchos de teste (§12) ficam em `acquisition.ts` e não são reexportados. Um teste de superfície confere isso.

### 7.2 Entrada

```ts
export type SkillFormat = 'cvg-json' | 'markdown'

export interface SkillInspectionRoot {
  readonly label: string // ^[a-z0-9][a-z0-9-]{0,39}$
  readonly path: string // absoluto, canônico, sem NUL; autorizado pelo host; nunca ecoado
  readonly acceptedFormats: readonly SkillFormat[] // 1..2, sem repetição
}

export interface SkillAdmissionContext {
  readonly grantedTools: readonly string[] // ≤ 256
  readonly approvedItemDigests: Readonly<Record<string, string>> // id → "sha256:<64 hex>"; ≤ 256
  readonly availableKnowledge?: readonly string[] // ≤ 256
}

export interface SkillInspectionInput {
  readonly profile: 'inventory' | 'admission'
  readonly roots: readonly SkillInspectionRoot[] // 1..8
  readonly limits?: Partial<SkillInspectionLimits>
  readonly expected?: { readonly inputDigest?: string }
  readonly admission?: SkillAdmissionContext // obrigatório em 'admission'; proibido em 'inventory'
  readonly hostIdentifiers?: readonly string[] // ≤ 256; ids já divulgados pelo host, isentos do redator (R2-O1)
}

export interface SkillInspectionDeps {
  readonly redactText: (text: string) => string // obrigatório
  readonly now?: () => number // monotônico em ms; default performance.now
}

export interface SkillSelectionInput {
  readonly roots: readonly SkillInspectionRoot[]
  readonly limits?: Partial<SkillInspectionLimits>
  readonly skillId: string // ID_PATTERN, 1 a 64 caracteres (R3-O7)
  readonly expectedItemDigest: string
  readonly admission: SkillAdmissionContext
  readonly hostIdentifiers?: readonly string[]
}
```

Ids de ferramenta, de conhecimento, entradas de `hostIdentifiers` e chaves de `approvedItemDigests` usam `^[A-Za-z0-9._:*-]{1,120}$`. Antes de qualquer acesso a root, nesta ordem:

1. checagem de plataforma (§3, `PLATFORM_UNSUPPORTED`);
2. `redactText` função (`REDACTOR_MISSING`);
3. validação da entrada (`INPUT_INVALID`).

Casos de `INPUT_INVALID`:

- profile desconhecido;
- roots fora de 1..8;
- label repetido ou fora do padrão;
- caminho relativo, com NUL ou não normalizado;
- roots iguais ou aninhados;
- `acceptedFormats` vazio ou repetido;
- `skillId` fora do `ID_PATTERN` ou com mais de 64 caracteres;
- limite não inteiro, menor que 1 ou acima do teto;
- `admission` ausente em `admission` ou presente em `inventory`;
- digest fora do formato;
- mais de 256 entradas nas listas.

**A função não altera nenhum objeto recebido.** O lead propõe que as listas sejam lidas uma vez e copiadas (mutante MU14b).

### 7.3 Limites

| Limite                                        | Default | Teto   | Código e efeito                                                                                 |
| --------------------------------------------- | ------- | ------ | ----------------------------------------------------------------------------------------------- |
| `maxEntriesPerRoot` (listagem do root)        | 64      | 256    | `CAP_EXCEEDED`; nenhuma entrada daquele root é processada; root `INCOMPLETE`                    |
| `maxDepth` (diretórios abaixo da skill)       | 2       | 8      | `CAP_EXCEEDED`; não desce; item `INCOMPLETE`                                                    |
| `maxFilesPerSkill` (listagem e total no item) | 32      | 256    | `CAP_EXCEEDED`; nada daquele diretório é processado; item `INCOMPLETE`                          |
| `maxFilesTotal`                               | 512     | 4096   | `CAP_EXCEEDED`; para; relatório `INCOMPLETE`                                                    |
| `maxManifestBytes` (`skill.json`)             | 16 KiB  | 64 KiB | `CAP_EXCEEDED`; não lê; item `INCOMPLETE`                                                       |
| `maxBodyBytes` (`SKILL.md`)                   | 256 KiB | 1 MiB  | `CAP_EXCEEDED`; não lê; item `INCOMPLETE`; custo de invocação `UNKNOWN`                         |
| `maxReferenceBytes` (por arquivo)             | 256 KiB | 1 MiB  | `CAP_EXCEEDED`; não lê; item `INCOMPLETE`                                                       |
| `maxTotalBytes`                               | 8 MiB   | 64 MiB | `CAP_EXCEEDED`; para; relatório `INCOMPLETE`                                                    |
| `deadlineMs`                                  | 5000    | 60000  | `DEADLINE_EXCEEDED`; conferido entre operações e a cada bloco de 64 KiB; relatório `INCOMPLETE` |
| `maxFrontmatterBytes` / 32 linhas             | 4 KiB   | 16 KiB | `FRONTMATTER_TOO_LARGE`; item `INVALID` (regra de formato, não de cobertura)                    |
| `maxDescriptionChars` (UTF-16)                | 1024    | 4096   | `DESCRIPTION_TOO_LONG`; item `INVALID` (regra de formato)                                       |

As linhas com `CAP_EXCEEDED` ou `DEADLINE_EXCEEDED` vão para o SK06. As duas últimas vão para o SK03 (M3a). O teto de `maxEntriesPerRoot` (256) mantém o `inputDigest` dentro do teto de nós do `canonicalizeJson`: 8 × 256 entradas × cerca de 6 nós, cerca de 12,3 mil (O3).

### 7.4 Layout e classificação, em ordem de precedência

Cada diretório direto do root é uma skill candidata. Dentro dele, cada entrada recebe **um** código de recusa, o primeiro que casar nesta ordem (O9):

1. Nome fora de `^\.?[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`: `UNSAFE_FILE_NAME`. É exibido como `<unsafe:N>`, com N ordinal no item, sem hash do nome (R2-M2), e não é lido.
2. Nome que começa com `.`: `HIDDEN_FILE_PRESENT`. Não é lido; se for diretório, não é percorrido.
3. Tipo pelo `lstat`:
   - symlink: `SYMLINK_REFUSED`;
   - outro tipo que não arquivo regular nem diretório: `SPECIAL_FILE_REFUSED`;
   - `dev` diferente do `dev` do root: `MOUNT_POINT_REFUSED`;
   - arquivo com `nlink > 1`: `HARDLINK_REFUSED`.
4. Diretório: percorrido até `maxDepth`. `references/` no nível 0 marca os descendentes como candidatos a referência.
5. Arquivo com bit de execução, ou com extensão em `.sh .bash .zsh .js .mjs .cjs .ts .mts .cts .py .rb .pl .php .ps1 .bat .cmd .exe .bin .so .dylib .dll .jar .wasm`: `EXECUTABLE_CONTENT_PRESENT`, não lido. Isso vale também para `SKILL.md` com bit de execução.
6. Papel por caminho exato:
   - `skill.json` → `MANIFEST`;
   - `SKILL.md` no nível 0 → `BODY`;
   - `references/**/*.md` ou `*.txt` → `REFERENCE`.

   Formato do papel não aceito no root: `FORMAT_NOT_ENABLED`, não lido.

7. Qualquer outro: `UNCLASSIFIED_FILE_NOT_READ`.

A recusa vai para `fileEntry.refusal`. Qualquer recusa no item deixa o item `INCOMPLETE`.

No nível do root:

- arquivo regular: `ROOT_ENTRY_IGNORED`, sem efeito na cobertura;
- nome fora do `ID_PATTERN`: `ITEM_NAME_INVALID`;
- demais recusas do passo 3: o root fica `INCOMPLETE`.

### 7.5 Decodificação e formatos (M4)

**Decodificação de todo arquivo lido** (`skill.json`, `SKILL.md` e referências):

- bytes iniciais `EF BB BF` (BOM) dão `ENCODING_INVALID`;
- decodificação com `new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })`; byte inválido dá `ENCODING_INVALID`.

Nada é reinterpretado: sem U+FFFD e sem remoção silenciosa de BOM. A sonda r2 confirma que o default do `TextDecoder` remove o BOM.

**Fim de linha (R2-O4).** Em `SKILL.md` e nas referências, CR (U+000D) em qualquer ponto, inclusive no corpo, dá `LINE_ENDING_UNSUPPORTED` e item `INVALID`: CR pode esconder texto num terminal. A ordem é BOM, decodificação, CR e frontmatter. No `skill.json`, CR fora de string é espaço JSON válido; dentro da `description` já é `FORBIDDEN`.

**Code points proibidos.** Conjunto `FORBIDDEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Noncharacter_Code_Point}]/u`. Ele inclui:

- TAB, LF, CR, U+0085 e todo C0/C1;
- bidi U+200E–U+200F, U+202A–U+202E e U+2066–U+2069;
- zero-width U+200B–U+200D e U+2060;
- U+FEFF;
- U+2028 e U+2029;
- U+FFFE e U+FFFF.

O conjunto vale para:

- cada valor do frontmatter;
- a `description` do `skill.json`, só na inspeção (o loader mantém a SPEC0200);
- os nomes de arquivo, que já são ASCII por §7.4.

Violação dá `FORBIDDEN_CODE_POINT`, com `field` e `codePoint` (`"U+202E"`), e o item fica `INVALID`. No corpo e nas referências, os mesmos code points, exceto TAB e LF, geram o achado **não bloqueante** `FORBIDDEN_CODE_POINT_IN_CONTENT`, com a contagem, para quem revisa o digest noutro editor (R2-O8). As propriedades seguem o Unicode do Node 22 do CI. Como nenhuma quebra de linha passa, a projeção de discovery (§7.7) é sempre uma linha só (P14).

**CVG_JSON (`skill.json`):**

1. Decodificar como acima.
2. `JSON.parse`. Erro de sintaxe dá `MANIFEST_SYNTAX_INVALID` (escopo `file`), **sem mensagem nem posição**: a mensagem do V8 pode trazer trecho do conteúdo.
3. Detectar chave duplicada no objeto de topo (§8.10). A comparação é feita **depois de decodificar os escapes**: `{"id":"a","\u0069d":"b"}` é duplicata (R2-M3). Duplicata dá `MANIFEST_DUPLICATE_KEY`.
4. Validar com o validador da SPEC0200, movido para `skills/manifest.ts` com retorno `{ code, field? }`. O loader monta as mensagens de hoje, com as duas que interpolavam texto do autor trocadas por categorias fixas (§7.12, F02). Falha dá `MANIFEST_INVALID` com `validatorCode` e, só quando o campo é do vocabulário fixo, `field`. Chave desconhecida dá `validatorCode` `UNKNOWN_FIELD` **sem** `field`: o nome escrito pelo autor nunca sai no relatório (F02). Por isso `field` não precisa de marcador `<unsafe:N>` nem `<redacted:N>` (R3-O2).
5. Aplicar `FORBIDDEN` e `DESCRIPTION_TOO_LONG` à `description`.

**MARKDOWN (`SKILL.md`), regra exata do delimitador (M4c):**

```txt
abertura   := os 4 primeiros bytes são exatamente "---\n"
cabeçalho  := 1..32 linhas, cada uma "chave: valor\n", total ≤ maxFrontmatterBytes
fechamento := a primeira linha, depois da abertura, que é exatamente "---"
              seguida de "\n" ou do fim do arquivo
corpo      := os bytes depois do "\n" do fechamento (vazio se o fechamento termina o arquivo)
chave      := [a-z][a-z0-9-]{0,63}
valor      := 1..maxDescriptionChars unidades UTF-16; sem FORBIDDEN; sem \p{White_Space}
              nas pontas; não começa com - ? : , [ ] { } # & * ! | > ' " % @ ` ;
              não contém ": " nem " #"; não termina com ":"
```

- Não começa com `---\n` (inclui `--- \n`, `----\n`, linha vazia antes, BOM): `FRONTMATTER_MISSING`.
- Chega ao fim do arquivo sem fechamento: `FRONTMATTER_UNTERMINATED`.
- Passa de 32 linhas ou de `maxFrontmatterBytes` antes do fechamento: `FRONTMATTER_TOO_LARGE`.
- Linha que não casa `chave: valor`, inclusive `--- `, `...`, `----`, linha vazia, comentário, recuo, bloco e fluxo: `FRONTMATTER_SYNTAX_UNSUPPORTED`.
- Cabeçalho vazio (`---\n---\n`) ou falta de `name` ou `description`: `FRONTMATTER_KEY_MISSING`.
- Chave repetida: `FRONTMATTER_DUPLICATE_KEY`. Como no `skill.json`, o finding só leva `field` se a chave for `name` ou `description` (F02).
- Chave fora de `name` e `description` (`allowed-tools`, `license`, `metadata`, `model` e outras): `FRONTMATTER_KEY_UNSUPPORTED`, item `INVALID` (P4, default do lead). Nada é concedido.
- Valor que o YAML leria como outro tipo: `true`, `false`, `yes`, `no`, `on`, `off`, `y`, `n`, `null`, `~` (sem diferença de caixa), `^[-+]?[0-9][0-9_.:eExXoObB+-]*$`, `^[-+]?0x[0-9a-fA-F_]+$`, `^[-+]?\.[0-9]+([eE][-+]?[0-9]+)?$` ou `^[-+]?\.(inf|nan)$` (sem diferença de caixa; R2-O2). Dá `FRONTMATTER_AMBIGUOUS_SCALAR` (O11, P19).
- `name` precisa casar o `ID_PATTERN` e ser igual ao diretório (`NAME_DIRECTORY_MISMATCH`, I11).

**CVG_JSON_WITH_MARKDOWN:** `skill.json` é a fonte dos seis campos. O frontmatter repete `name` = `id` e a mesma `description`; divergência dá `MANIFEST_FRONTMATTER_CONFLICT`.

**Markdown sozinho:** `version`, `requiredTools`, `requiredKnowledge` e `riskLevel` saem `null` com fonte `UNDECLARED`. O item pode ser `VALID` no inventário, mas nunca é admitido (P3).

**Diretório sem `skill.json` nem `SKILL.md`:** `SKILL_EMPTY`.

**Identificadores:**

- `version`: `^[0-9A-Za-z.+-]{1,64}$`;
- entradas de requisito: `^[A-Za-z0-9._:-]{1,120}$`.

Fora disso: `VERSION_UNSAFE` ou `REQUIREMENT_UNSAFE`, e o item fica `INVALID`.

### 7.6 Relatório

```ts
export interface SkillInspectionReport {
  readonly schemaVersion: 1
  readonly kind: 'cvg.skill.inspect'
  readonly methodVersion: 'cvg-skill-inspect-v1'
  readonly hashVersion: 'cvg-skill-hash-v1'
  readonly profile: 'inventory' | 'admission'
  readonly inputDigest: string
  readonly coverage: 'COMPLETE' | 'INCOMPLETE' // regra no §7.8
  readonly formatValidation: 'VALID' | 'INVALID' // VALID só se todo item for VALID (zero itens: VALID)
  readonly admission: 'NOT_EVALUATED' | 'ADMITTED' | 'NOT_ADMITTED'
  readonly runtimeGrant: 'NONE'
  readonly estimator: {
    readonly version: 'cvg-chars4-v1'
    readonly unit: 'utf16-code-units/4 ceil; empty=0'
    readonly measuredUsage: false
  }
  readonly limits: SkillInspectionLimits
  readonly stages: {
    readonly discovery: StageMeasure
    readonly admission?: {
      readonly evaluated: number
      readonly admitted: number
      readonly notAdmitted: number
    }
  }
  readonly items: readonly SkillInspectionItem[] // ordem: label, caminho
  readonly findings: readonly SkillInspectionFinding[] // ordem: escopo, label, caminho, código
}

export interface StageMeasure {
  readonly filesOpened: number
  readonly bytesRead: number // todo byte lido do disco, inclusive de leitura depois recusada
  readonly contextBytes: number
  readonly contextTokens: number
  readonly unknownItems: number
}

export interface SkillInspectionItem {
  readonly id: string | null
  readonly version: string | null
  readonly origin: { readonly root: string; readonly path: string }
  readonly format:
    | 'CVG_JSON'
    | 'MARKDOWN'
    | 'CVG_JSON_WITH_MARKDOWN'
    | 'UNRECOGNIZED'
  readonly itemDigest: string | null // hash canônico de skill v1 (§8.9); null com valor redigido ou nome inseguro (R2-M2)
  readonly files: readonly {
    readonly path: string
    readonly type: 'FILE' | 'DIRECTORY' | 'SYMLINK' | 'OTHER'
    readonly role: 'MANIFEST' | 'BODY' | 'REFERENCE' | 'UNCLASSIFIED'
    readonly bytes: number | null // só para FILE (O1)
    readonly sha256: string | null // só se lido; null no arquivo que contém valor redigido (R2-M2)
    readonly read: boolean
    readonly refusal: SkillInspectionFindingCode | null
  }[]
  readonly description: string | null // após o redator
  readonly declared: {
    readonly requiredTools: readonly string[] | null
    readonly requiredKnowledge: readonly string[] | null
    readonly riskLevel: RiskLevel | null
  }
  readonly fieldSources: Readonly<
    Record<
      | 'id'
      | 'version'
      | 'description'
      | 'requiredTools'
      | 'requiredKnowledge'
      | 'riskLevel',
      'skill.json' | 'frontmatter' | 'directory' | 'UNDECLARED'
    >
  >
  readonly components: {
    readonly manifest: boolean
    readonly body: boolean
    readonly references: number
    readonly unclassified: number
  }
  readonly coverage: 'COMPLETE' | 'INCOMPLETE'
  readonly formatValidation: 'VALID' | 'INVALID'
  readonly risk: {
    readonly declared: RiskLevel | null
    readonly findings: readonly SkillInspectionFindingCode[]
  }
  readonly context: {
    readonly permanent: CostEstimate
    readonly onInvoke: CostEstimate
    readonly onDemandReferences: CostEstimate
  }
  readonly admission: {
    readonly status: 'NOT_EVALUATED' | 'ADMITTED' | 'NOT_ADMITTED'
    readonly reasons: readonly AdmissionReason[]
  }
}

export type CostEstimate =
  | {
      readonly basis: 'DISCOVERY_ENTRY' | 'BODY' | 'REFERENCES'
      readonly bytes: number
      readonly tokens: number
    }
  | {
      readonly basis: 'NO_BODY' | 'NO_REFERENCES'
      readonly bytes: 0
      readonly tokens: 0
    }
  | {
      readonly basis: 'UNKNOWN'
      readonly bytes: null
      readonly tokens: null
      readonly reason: SkillInspectionFindingCode
    }

export interface SkillInspectionFinding {
  readonly code: SkillInspectionFindingCode
  readonly scope: 'root' | 'item' | 'file' | 'field'
  readonly root: string
  readonly path?: string
  readonly field?: string // só nome do vocabulário fixo (seis campos, name, description); nunca chave do autor (F02)
  readonly entryType?: 'FILE' | 'DIRECTORY' | 'SYMLINK' | 'OTHER' // NAME_CONFLICT
  readonly count?: number // FORBIDDEN_CODE_POINT_IN_CONTENT
  readonly validatorCode?: string // enum do validador da SPEC0200
  readonly codePoint?: string // "U+XXXX"
  readonly cap?: keyof SkillInspectionLimits
  readonly errno?: string // ex.: "EACCES"; nunca error.message
}
```

Não há campo de corpo, conteúdo, caminho absoluto, ativação ou approval. O relatório é determinístico: campos em ordem fixa por construção, listas ordenadas. Os digests usam `canonicalizeJson` dentro do teto de nós (§7.3). A afirmação da r1 de que o relatório inteiro cabe no `canonicalizeJson` foi retirada (O3).

### 7.7 Estimador e projeção

- `cvg-chars4-v1(texto)` vale 0 para texto vazio e `estimateTokens(texto)` para o resto. Isso reusa `context-engine.ts:39-41` sem cópia e corrige o `estimateTokens('') = 1` (O10). Bytes = comprimento UTF-8 do mesmo texto.
- **Projeção de discovery** (P14): `<id>@<version>: <description>`, ou `<id>: <description>` sem versão. Sempre uma linha (§7.5). A estimativa usa a descrição crua; o relatório mostra a descrição redigida. A 0255-C é obrigada a usar a mesma função.
- **onInvoke:**
  - corpo depois do fechamento do frontmatter, exatamente a string que a seleção devolveria;
  - corpo presente e vazio: `BODY`, 0 bytes, 0 tokens;
  - sem `SKILL.md`: `NO_BODY`;
  - corpo não lido ou item `INVALID`: `UNKNOWN` com o código do motivo, nunca 0.
- **onDemandReferences:** soma das referências lidas; qualquer referência não lida dá `UNKNOWN`.
- Valores com as fixtures sintéticas da REA:
  - projeção Markdown: 51 unidades, **13 tokens**, igual com corpo curto e longo;
  - corpo curto: 68 bytes, **17 tokens**;
  - corpo longo: 6.020 bytes, **1.505 tokens**;
  - projeção CVG_JSON com versão: 57 unidades, **15 tokens**.

### 7.8 Agregação da cobertura (M3c)

**Item `INCOMPLETE`** quando houver qualquer um destes:

- recusa em `fileEntry` (§7.4);
- `CAP_EXCEEDED` no item (`maxDepth`, `maxFilesPerSkill` ou bytes por papel);
- `FILE_CHANGED_DURING_READ`, `TREE_CHANGED_DURING_READ` ou `READ_FAILED` no item;
- `ITEM_NAME_INVALID`;
- prazo vencido antes do fim do item.

**Root `INCOMPLETE`** quando houver qualquer um destes:

- `ROOT_*`;
- recusa de entrada do root (symlink, especial ou montagem);
- `CAP_EXCEEDED` em `maxEntriesPerRoot`;
- `TREE_CHANGED_DURING_READ` do root (assinatura do fd do root mudou entre o início e o fim).

**Relatório `INCOMPLETE`** quando houver qualquer um destes:

- root `INCOMPLETE`;
- item `INCOMPLETE`;
- `CAP_EXCEEDED` em `maxFilesTotal` ou `maxTotalBytes`;
- `DEADLINE_EXCEEDED`.

Senão, `COMPLETE`.

**Relação com a seleção:** ver §7.9 (condição 1) e §7.10.

### 7.9 Perfis

**`inventory`:** só descreve; `admission` sai `NOT_EVALUATED`.

**`admission`:** um item é `ADMITTED` só se valerem todas as condições abaixo. Todos os motivos aplicáveis são listados, ordenados.

1. **Cobertura do que importa ao item:**
   - todo root abriu, é canônico e não mudou até a conferência final, que vem depois da última busca (§8.11); senão `COVERAGE_INCOMPLETE`;
   - o item está `COMPLETE`; senão `ITEM_COVERAGE_INCOMPLETE`.

   A cobertura do relatório **não** é exigida para admitir um item (P20). Uma recusa em outro item, ou o estouro de listagem de outro root, não afeta este item. A duplicata é conferida pela condição 7, por busca de nome, que não depende da listagem.

2. `formatValidation` `VALID`; senão `FORMAT_INVALID`.
3. Os seis campos vêm do `skill.json`; senão `VERSION_UNDECLARED`, `REQUIREMENTS_UNDECLARED` e `RISK_UNDECLARED`.
4. `Object.hasOwn(approvedItemDigests, id)` (senão `DIGEST_NOT_APPROVED`), e o valor igual ao `itemDigest` (senão `DIGEST_MISMATCH`). A consulta usa só propriedade própria: o id `constructor` casa o `ID_PATTERN` (O6).
5. Grant:
   - se `grantedTools` contém `*`: `WILDCARD_GRANT_NOT_ACCEPTED`, mesmo com `requiredTools` vazio (P5, R2-O5);
   - senão, cada requisito precisa de `agentExposesTool(grantedTools, tool)`, a mesma função do kernel (`kernel-runtime.ts:91-96`, O6); senão `TOOL_NOT_GRANTED`.
6. Conhecimento:
   - `requiredKnowledge` vazio, ou contido em `availableKnowledge`; senão `KNOWLEDGE_NOT_AVAILABLE`;
   - lista ausente com requisito não vazio: `KNOWLEDGE_NOT_EVALUATED`.
7. **Unicidade por busca (§8.11):** a mesma função da seleção, em todos os roots. `NAME_LOOKUP_FAILED`, `NAME_CONFLICT` ou `DUPLICATE_ID` recusam (I11).
8. Nenhum achado de risco no item. Os códigos de recusa do §7.4 e `SECRET_PATTERN_IN_IDENTIFIER` dão `BLOCKING_RISK_FINDING`. `REDACTION_FAILED` também (§7.11).
9. `expected.inputDigest`, se informado, igual; senão `EXPECTED_INPUT_DIGEST_MISMATCH`.

O `riskLevel` só é informado; a policy do kernel continua valendo na chamada.

**O relatório** sai `ADMITTED` só se a cobertura do relatório for `COMPLETE`, houver pelo menos um item e todos estiverem `ADMITTED`. `runtimeGrant` continua `NONE`. O relatório não é token nem prova para a seleção.

### 7.10 Seleção autorizada pelo chamador

A autoridade da seleção na 0255-A é **do chamador**: o host passa o grant e os digests aprovados (P11). A 0255-C só pode usar a seleção com digests vindos do catálogo aprovado da PAR-T07 (fatia futura), nunca de entrada livre (O5).

1. Plataforma, redator e entrada (§7.2).
2. Abrir cada root e tirar a assinatura (§8.2, passos 1 a 3). Não há listagem: a busca de nome é a do §8.11, a mesma da admissão. Sem candidato: `NOT_FOUND`. `NAME_LOOKUP_FAILED`, `NAME_CONFLICT` ou `DUPLICATE_ID` recusam.
3. Adquirir **só** essa skill (§8.4–8.8), fazer a conferência final dos roots depois da busca e da aquisição (§8.11) e avaliar as condições 1 a 8 do §7.9.
4. Exigir `itemDigest` = `expectedItemDigest` = `approvedItemDigests[skillId]` (propriedade própria).
5. `SELECTED` devolve o corpo **decodificado do mesmo buffer** cujo sha256 entrou no `itemDigest`, sem reabrir nem reler o arquivo (G3, MU24). Senão, `REFUSED`, sem corpo.

```ts
export type SkillSelectionResult =
  | {
      readonly status: 'SELECTED'
      readonly id: string
      readonly version: string
      readonly itemDigest: string
      readonly body: string | null // null quando NO_BODY
      readonly onInvoke: CostEstimate
      readonly stage: {
        readonly filesOpened: number
        readonly bytesRead: number
      }
      readonly runtimeGrant: 'NONE'
    }
  | {
      readonly status: 'REFUSED'
      readonly reasons: readonly (AdmissionReason | 'NOT_FOUND')[]
      readonly findings: readonly SkillInspectionFinding[]
      readonly stage: {
        readonly filesOpened: number
        readonly bytesRead: number
      }
      readonly runtimeGrant: 'NONE'
    }
```

**Consistência (I13).** Para a mesma árvore, sem escrita concorrente, a seleção dá `SELECTED` exatamente quando o item, no perfil `admission`, sai `ADMITTED` com o mesmo digest. A busca de nome é a mesma função nos dois caminhos (§8.11). Exceções declaradas, em que o inventário não traz o item, ou o recusa, e a seleção pode dar `SELECTED`:

- (a) estouro de `maxEntriesPerRoot` no root do item;
- (b) prazo vencido antes do item;
- (c) estouro de `maxFilesTotal` ou de `maxTotalBytes` antes do item;
- (d) a condição 9 (`expected.inputDigest`), que só a inspeção avalia.

A seleção não lista nem lê outra skill, e não põe o corpo no contexto de nenhuma sessão.

### 7.11 Redação (O2)

- `deps.redactText` é obrigatório. O host passa o redator dele (por exemplo `redactSensitiveText`).
- **Descrição:** passa pelo redator. Se o redator lançar ou não devolver string, a descrição vira `"[redaction-failed]"`, com `REDACTION_FAILED`, e o item não é admitido.
- **Identificadores** (id e nome do diretório, `version`, entradas de requisito e nomes de arquivo; R2-O9; o `field` só leva nome do vocabulário fixo, F02): cada um passa pelo redator. A exceção é o identificador exatamente igual a uma entrada de `hostIdentifiers`; no perfil `admission` e na seleção, `grantedTools` e `availableKnowledge` entram nessa lista sozinhos (R2-O1). Se a saída do redator for diferente da entrada, o valor vira `<redacted:N>`, com N ordinal no item, o finding é `SECRET_PATTERN_IN_IDENTIFIER`, e o item fica `INVALID` (P18).
- **Nada calculado sobre o valor bruto (R2-M2).** Em item com `SECRET_PATTERN_IN_IDENTIFIER` ou `UNSAFE_FILE_NAME`:
  - `itemDigest` é `null`;
  - o `sha256` do arquivo que contém o valor, ou cujo nome é o valor, é `null`;
  - a entrada do item no `inputDigest` usa a forma exibida, com os marcadores ordinais, e `itemDigest: null`.

  Esses itens já são `INVALID` ou `INCOMPLETE` e nunca são admitidos.

- Mensagem de erro do sistema de arquivos ou do V8 nunca é copiada; vai só o `errno` ou o código.
- **Limitação declarada:** o que o redator do host não reconhece passa (por exemplo `ghp_…`, `sk-ant-…`, JWT e PEM no `redactSensitiveText` de hoje). A11 vale "nos padrões do redator do host". O `sha256` publicado de arquivo pequeno continua sendo oráculo para valor enumerável redigido na descrição (I9).

### 7.12 Loader endurecido (P8, default do lead; M7)

O `loadSkillsFromDirectory` passa a usar a mesma aquisição do §8 (fd, assinatura e listagem limitada). A assinatura da função e o tipo de retorno não mudam. Valores fixos, sem parâmetro: `maxEntriesPerRoot` 64, `maxManifestBytes` 16 KiB, `maxTotalBytes` 8 MiB e `deadlineMs` 5000. O validador continua o da SPEC0200: as regras extras da inspeção (§7.5: código proibido, tamanho da descrição e chave duplicada) **não** se aplicam ao loader.

| Caso                                                      | Antes (`420b97b3`)                                                  | Depois                                                                                                                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root relativo, ou com symlink em componente do caminho    | aceito                                                              | aceito: o loader resolve o root com `realpath` **uma vez** (entrada confiável do host) e fixa por fd; nada dentro do root é seguido. A inspeção, ao contrário, exige root canônico                                          |
| Root inexistente                                          | `ok:false`, "diretório inacessível", `skillPath` absoluto           | igual, `skillPath` `"."`                                                                                                                                                                                                    |
| Root é arquivo                                            | "não é um diretório", `skillPath` absoluto                          | igual, `skillPath` `"."`                                                                                                                                                                                                    |
| Plataforma fora de Linux ou sem `/proc`                   | funciona                                                            | `ok:false`, "plataforma não suportada", `skillPath` `"."`                                                                                                                                                                   |
| Entrada do root que é symlink, válido ou quebrado         | o válido é seguido e carregado; o quebrado dá "entrada inacessível" | **"entrada inacessível"** sempre, nada carregado (o teste pdsh-031:398-403 continua)                                                                                                                                        |
| Entrada do root FIFO, socket ou montagem                  | ignorada (`statSync` não é diretório)                               | "entrada inacessível"                                                                                                                                                                                                       |
| Arquivo regular no root                                   | ignorado                                                            | ignorado                                                                                                                                                                                                                    |
| Mais de 64 entradas no root                               | carrega todas                                                       | `ok:false`, "limite excedido: maxEntriesPerRoot", nenhuma processada                                                                                                                                                        |
| `skill.json` ausente                                      | "skill.json ilegível: ENOENT: … caminho absoluto"                   | "skill.json ilegível: ENOENT"                                                                                                                                                                                               |
| `skill.json` symlink ou hardlink                          | carregado                                                           | "skill.json ilegível: SYMLINK_REFUSED" ou "…: HARDLINK_REFUSED"                                                                                                                                                             |
| `skill.json` > 16 KiB                                     | carregado                                                           | "skill.json ilegível: CAP_EXCEEDED"                                                                                                                                                                                         |
| `skill.json` trocado durante a leitura                    | não detecta                                                         | "skill.json ilegível: FILE_CHANGED_DURING_READ"                                                                                                                                                                             |
| JSON com erro de sintaxe                                  | "skill.json ilegível: <mensagem do V8>" (pode trazer trecho)        | "skill.json ilegível: JSON inválido"                                                                                                                                                                                        |
| `JSON.parse` lança valor não-Error (mock do pdsh-031)     | "skill.json ilegível: raw"                                          | igual (`String(valor)`; só ocorre com mock)                                                                                                                                                                                 |
| Prazo de 5 s vencido                                      | —                                                                   | `ok:false`, "limite excedido: deadlineMs"                                                                                                                                                                                   |
| Mensagens do validador                                    | SPEC0200                                                            | categorias estáticas preservadas; campo desconhecido retorna mensagem fixa `campo desconhecido`, sem interpolar a chave. Demais mensagens são constantes revisadas. Nunca propagar valores, paths ou mensagens de terceiros |
| `skillPath`                                               | absoluto                                                            | **relativo ao root**: `"."`, `"<entrada>"` ou `"<entrada>/skill.json"`                                                                                                                                                      |
| Descrição com bidi, > 1024 caracteres, ou chave duplicada | aceita                                                              | aceita (regras só da inspeção)                                                                                                                                                                                              |

**Mensagens do validador (F02).** Hoje duas mensagens interpolam texto do autor: a de campo desconhecido (`loader.ts:47-49`, interpola a chave) e a de id diferente do diretório (`loader.ts:68-70`, interpola o id e o nome do diretório). Depois do endurecimento, elas viram as categorias fixas "campo desconhecido" e "id difere do nome do diretório". "campo ausente: <campo>" só usa nomes da lista fixa `FIELDS`. As demais já são constantes. As asserções atuais (`pdsh-015`: "campo desconhecido", "difere do nome do diretório", "campo ausente: version") continuam valendo. A linha "skill.json ilegível: raw" fica como está: ela só ocorre com mock do runtime e não traz conteúdo da skill.

O `skillPath` relativo muda um campo de tipo experimental. Os únicos consumidores são testes, e nenhum confere o valor (`grep -rn skillPath`). O `PUBLIC_API.md` ganha a nota da mudança. Os testes `pdsh-015` e `pdsh-031` continuam sem afrouxar asserção.

## 8. Algoritmos

### 8.1 Plataforma

Ver §3. Feita antes de qualquer acesso a root, uma vez por chamada.

### 8.2 Root

1. `rootFd = open(path, O_RDONLY|O_DIRECTORY|O_NOFOLLOW)`.
   - `ENOENT`: `ROOT_NOT_FOUND`.
   - `ENOTDIR` ou `ELOOP` com `lstat` symlink: `ROOT_SYMLINK_REFUSED`.
   - `ENOTDIR` e não diretório: `ROOT_NOT_DIRECTORY`.
   - Outro erro: `ROOT_UNREADABLE` + `errno`.
2. `readlink('/proc/self/fd/<rootFd>') === path`; senão `ROOT_NOT_CANONICAL`. Isso substitui o `realpath` da r1 e não tem corrida, porque lê o caminho do diretório já aberto.
3. `rootSig0 = signature(fstat(rootFd, bigint))`.
4. Listagem limitada (§8.3) de `/proc/self/fd/<rootFd>` com cap `maxEntriesPerRoot`.
5. **Conferência final** (§8.11), depois da última busca de nome e da última leitura: `signature(fstat(rootFd)) === rootSig0`; senão `TREE_CHANGED_DURING_READ` no root. As decisões de admissão e de seleção vêm depois dela. Fechar o fd em `finally`.

### 8.3 Listagem limitada (M2)

`opendirSync('/proc/self/fd/<dfd>', { bufferSize: 32 })` e `readSync()` até `cap + 1` entradas ou até o fim. Ignorar `.` e `..` (não vêm do `readdir` do Node). Se ler `cap + 1`, fechar, emitir `CAP_EXCEEDED` e **não processar nenhuma entrada daquele diretório**. Senão, ordenar os nomes por unidades UTF-16. O tipo do `Dirent` não é usado; o tipo vem do `lstat`.

### 8.4 Entrada (classificação)

`st = lstat('/proc/self/fd/<dfd>/<nome>', bigint)` e aplicar o §7.4. Os nomes nunca contêm `/` nem são `.` ou `..`.

### 8.5 Diretório

1. `cfd = open('/proc/self/fd/<dfd>/<nome>', O_RDONLY|O_DIRECTORY|O_NOFOLLOW)`. `ENOTDIR` ou `ELOOP` dá `SYMLINK_REFUSED`: era diretório no `lstat` e virou symlink.
2. `signature(fstat(cfd)) === signature(st)`; senão `TREE_CHANGED_DURING_READ`.
3. Guardar `(cfd, sig0)` e listar (§8.3) com cap `maxFilesPerSkill`.

### 8.6 Arquivo

Algoritmo de `readPhysical` (`boundary-installed-identity.mjs:235-283`), pelo fd do diretório:

1. Pelo `st` do §8.4: tamanho ≤ cap do papel, senão `CAP_EXCEEDED` sem abrir; `bytesRead + size ≤ maxTotalBytes`, senão `CAP_EXCEEDED` global.
2. `fd = open('/proc/self/fd/<dfd>/<nome>', O_RDONLY|O_NOFOLLOW|O_NONBLOCK)`. `ELOOP` dá `SYMLINK_REFUSED`. Outro erro dá `READ_FAILED` + `errno`.
3. `signature(fstat(fd)) === signature(st)` e `nlink === 1n`; senão `FILE_CHANGED_DURING_READ`.
4. Ler em blocos de 64 KiB até EOF ou `cap + 1`, conferindo o prazo a cada bloco. Passou do cap: `CAP_EXCEEDED`.
5. Depois: bytes = `st.size`, `signature(fstat(fd))` igual e `signature(lstat(caminho pelo dfd))` igual; senão `FILE_CHANGED_DURING_READ`.
6. sha256 dos bytes. O buffer fica guardado para decodificar e, na seleção, para devolver (G3). Fechar o fd em `finally`. Somar `filesOpened` e `bytesRead` (todos os bytes lidos).

### 8.7 Fim do item

Para cada diretório guardado no item:

- `signature(fstat(cfd)) === sig0`;
- e, para o diretório da skill, `signature(lstat('/proc/self/fd/<rootFd>/<nome>'))` igual à do §8.4.

Senão, `TREE_CHANGED_DURING_READ` e item `INCOMPLETE`. Fechar os fds. Isso detecta o ABA (troca e volta), que muda `ctimeNs` (sonda r2), salvo no mesmo tique em kernel sem multigrain (§3, P22). O gancho de teste `beforeItemCheck` roda depois da última leitura do item e antes desta conferência; `afterItem` roda depois dela.

### 8.8 Prazo

Ver §7.3: o prazo é conferido entre operações e a cada bloco. Vencido, o processamento para, e o que ficou de fora não aparece.

### 8.9 Digests (hash canônico de skill v1)

```txt
fileEntry   = { path, type, role, bytes (só FILE), sha256 | null, read, refusal | null }
itemDigest  = "sha256:" + sha256( canonicalizeJson({
                hash: "cvg-skill-hash-v1",
                name: <nome do diretório>,
                files: fileEntry[] ordenado por path }) )
inputDigest = "sha256:" + sha256( canonicalizeJson({
                method: "cvg-skill-inspect-v1", hash: "cvg-skill-hash-v1",
                roots: [ { label, acceptedFormats ordenado,
                           entries: [ { name, type, kind: ITEM|IGNORED|REFUSED,
                                        itemDigest?, refusal? } ] } ] ordenado por label }) )
```

- Ficam de fora: caminho absoluto, limites, perfil, mtime, inode e `bytes` de quem não é arquivo regular (O1).
- O `itemDigest` é o **hash canônico de skill da PAR-T07**. Mudar a fórmula exige `cvg-skill-hash-v2`.
- Item com valor redigido ou nome inseguro não tem `itemDigest` publicado (`null`), e a entrada dele no `inputDigest` usa a forma exibida, com marcadores ordinais (§7.11, R2-M2).
- Por isso o `inputDigest` não fixa o conteúdo de item com `itemDigest` nulo: mudar esse conteúdo não muda o `inputDigest`. Isso não afeta a admissão de outro item (P20), e o item nulo nunca é admitido (R3-O4).

### 8.10 Chave duplicada no `skill.json`

Rodar depois do `JSON.parse` com sucesso, sobre o texto já validado:

1. Varrer os tokens do objeto de topo, respeitando strings e profundidade.
2. A cada nome de membro no nível 1, decodificar o token com `JSON.parse` do próprio literal.
3. Comparar o valor decodificado. Repetido: `MANIFEST_DUPLICATE_KEY` (sem mostrar a chave, salvo se casar o charset do `field`).

Objetos aninhados já são recusados pelo validador.

### 8.11 Busca de nome e ordem (R2-M1)

Uma única função, usada pela admissão (condição 7) e pela seleção (passo 2):

```txt
lookup(rootFd, nome) = lstat('/proc/self/fd/<rootFd>/<nome>', bigint)
  ENOENT                                         → ABSENT
  diretório real com o mesmo dev do root         → CANDIDATE
  arquivo regular, symlink, especial ou outro dev → CONFLICT (finding NAME_CONFLICT, com entryType)
  qualquer outro erro (EACCES, ELOOP, EIO…)      → FAILED (finding NAME_LOOKUP_FAILED, com errno)
```

Decisão sobre os resultados de todos os roots, igual nos dois caminhos; todos os motivos aplicáveis entram:

- algum `FAILED`: `NAME_LOOKUP_FAILED` (falha fechado);
- algum `CONFLICT`: `NAME_CONFLICT`;
- dois ou mais `CANDIDATE`: `DUPLICATE_ID`;
- nenhum `CANDIDATE` (só na seleção): `NOT_FOUND`;
- senão, o nome é único.

Ordem obrigatória nos dois caminhos:

1. abrir os roots e tirar `rootSig0` (§8.2, passos 1 a 3);
2. no inventário: listar e adquirir os itens e depois buscar o nome de cada item; na seleção: buscar o nome primeiro (a busca acha o root) e depois adquirir só a skill pedida (R3-O1);
3. conferência final das assinaturas dos roots (§8.2, passo 5), **depois da última busca e da última leitura**;
4. decisões de admissão e de seleção.

Uma duplicata removida durante a busca e devolvida depois dela muda a assinatura do root, e a conferência final pega a mudança pela condição 1, salvo no mesmo tique em kernel sem multigrain (§3, P22). Os ganchos de teste `beforeLookup` e `afterLookup` cercam cada busca.

## 9. Erros e findings

| Código                                                                                                                                                                                                                              | Escopo           | Cobertura               | Formato | Bloqueia admissão                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ----------------------- | ------- | ----------------------------------- |
| `ROOT_NOT_FOUND`, `ROOT_NOT_DIRECTORY`, `ROOT_SYMLINK_REFUSED`, `ROOT_NOT_CANONICAL`, `ROOT_UNREADABLE`                                                                                                                             | root             | root INCOMPLETE         | —       | sim, de todos os itens (condição 1) |
| `ROOT_ENTRY_IGNORED`                                                                                                                                                                                                                | root             | —                       | —       | não                                 |
| `SYMLINK_REFUSED`, `HARDLINK_REFUSED`, `SPECIAL_FILE_REFUSED`, `MOUNT_POINT_REFUSED`                                                                                                                                                | root, file       | root ou item INCOMPLETE | —       | sim                                 |
| `UNSAFE_FILE_NAME`, `HIDDEN_FILE_PRESENT`, `EXECUTABLE_CONTENT_PRESENT`, `UNCLASSIFIED_FILE_NOT_READ`, `FORMAT_NOT_ENABLED`                                                                                                         | file             | item INCOMPLETE         | —       | sim                                 |
| `FILE_CHANGED_DURING_READ`, `TREE_CHANGED_DURING_READ`, `READ_FAILED`                                                                                                                                                               | root, item, file | root ou item INCOMPLETE | —       | sim                                 |
| `CAP_EXCEEDED` (com `cap`), `DEADLINE_EXCEEDED`                                                                                                                                                                                     | root, item, file | §7.3 e §7.8             | —       | sim                                 |
| `ITEM_NAME_INVALID`, `SKILL_EMPTY`, `ENCODING_INVALID`                                                                                                                                                                              | item, file       | —                       | INVALID | sim                                 |
| `MANIFEST_SYNTAX_INVALID`, `MANIFEST_DUPLICATE_KEY`, `MANIFEST_INVALID`                                                                                                                                                             | file, field      | —                       | INVALID | sim                                 |
| `FRONTMATTER_MISSING`, `FRONTMATTER_UNTERMINATED`, `FRONTMATTER_TOO_LARGE`, `FRONTMATTER_SYNTAX_UNSUPPORTED`, `FRONTMATTER_KEY_MISSING`, `FRONTMATTER_DUPLICATE_KEY`, `FRONTMATTER_KEY_UNSUPPORTED`, `FRONTMATTER_AMBIGUOUS_SCALAR` | field            | —                       | INVALID | sim                                 |
| `NAME_DIRECTORY_MISMATCH`, `MANIFEST_FRONTMATTER_CONFLICT`, `VERSION_UNSAFE`, `REQUIREMENT_UNSAFE`, `DESCRIPTION_TOO_LONG`, `FORBIDDEN_CODE_POINT`, `SECRET_PATTERN_IN_IDENTIFIER`                                                  | field            | —                       | INVALID | sim                                 |
| `REDACTION_FAILED`                                                                                                                                                                                                                  | field            | —                       | —       | sim                                 |
| `DUPLICATE_ID`, `EXPECTED_INPUT_DIGEST_MISMATCH`                                                                                                                                                                                    | item, root       | —                       | —       | sim                                 |
| `NAME_CONFLICT`, `NAME_LOOKUP_FAILED`                                                                                                                                                                                               | root             | —                       | —       | sim (condição 7 e seleção)          |
| `LINE_ENDING_UNSUPPORTED`                                                                                                                                                                                                           | file             | —                       | INVALID | sim                                 |
| `FORBIDDEN_CODE_POINT_IN_CONTENT` (com `count`)                                                                                                                                                                                     | file             | —                       | —       | não                                 |

`AdmissionReason` = `COVERAGE_INCOMPLETE | ITEM_COVERAGE_INCOMPLETE | FORMAT_INVALID | VERSION_UNDECLARED | REQUIREMENTS_UNDECLARED | RISK_UNDECLARED | DIGEST_NOT_APPROVED | DIGEST_MISMATCH | TOOL_NOT_GRANTED | WILDCARD_GRANT_NOT_ACCEPTED | KNOWLEDGE_NOT_AVAILABLE | KNOWLEDGE_NOT_EVALUATED | DUPLICATE_ID | NAME_CONFLICT | NAME_LOOKUP_FAILED | BLOCKING_RISK_FINDING | EXPECTED_INPUT_DIGEST_MISMATCH`.

`SkillInspectionError` é a única exceção (`INPUT_INVALID`, `REDACTOR_MISSING` e `PLATFORM_UNSUPPORTED`), sempre antes de acessar o root. Erro do sistema de arquivos vira finding.

## 10. 0255-B — contrato de plugins (nível de contrato; BUILD exige revisão futura)

- **Onde:** `packages/platform/src/plugin-inspection.ts`, experimental em `@cvg/platform`.
- **Fonte (O4):** o **inventário somente leitura da PAR-H04** (`0380:818`), mais o `PluginRegistry` e os `PluginCatalogRecord` que ele projeta. A 0255-B não constrói outro inventário. Ela acrescenta só perfil, cobertura, decisão de admissão e custo. Manifesto em arquivo (`.claude-plugin/plugin.json`) não é formato CVG.
- **Item por `name@version`:**
  - `manifestDigest = sha256(canonicalizeJson(manifest))`;
  - presença no registry e atestação por tool (`reviewedDescriptor`);
  - estado no catálogo e `approved: boolean`, sem o id de quem aprovou;
  - componentes do schema; `skills`, `agents` e `mcpServers` saem como `NOT_SUPPORTED_BY_SCHEMA`;
  - dependências resolvidas contra o catálogo `APPROVED` (`DEPENDENCY_UNRESOLVED`);
  - permissões exigidas e risco máximo;
  - custo permanente do descriptor revisado (sem atestação: `UNKNOWN`);
  - custo de invocação `UNKNOWN`.
- **Perfis:**
  - `inventory` descreve.
  - `admission` exige: `APPROVED` no mesmo `manifestDigest`; atestação de todas as tools; dependências resolvidas; `allowedTools` do binding contido nas tools; permissões do ator, informadas pelo host, contendo as exigidas.
  - `runtimeGrant` é `NONE`. Nenhuma chamada a `register`, `transitionPluginCatalogEntry` ou `execute`.
- **Versão e upgrade:** a admissão fica presa ao `manifestDigest`. A troca em execução é da PAR-K04.
- **Pendências para a revisão da 0255-B:**
  - contrato do inventário da H04 (que ainda não existe);
  - sintaxe de `dependencies`;
  - divergência entre catálogo e registry (`CATALOG_REGISTRY_DIVERGENCE`);
  - projeção do descriptor;
  - provas PB01–PB08.

## 11. Conjunto de escrita da 0255-A (candidata)

**Produção** (`packages/harness/src/skills/`):

- `manifest.ts`: validador estruturado, extraído de `loader.ts`;
- `loader.ts`: endurecido conforme o §7.12;
- `platform.ts`, `acquisition.ts` (fd, assinatura, listagem e ganchos de teste internos), `decode.ts`, `frontmatter.ts`, `inspection.ts` e `selection.ts`;
- `index.ts`.

Imports permitidos: `node:fs`, `node:path`, `node:crypto`, `node:perf_hooks`, `@cvg/harness-contracts`, mais `estimateTokens` e `agentExposesTool` do próprio harness.

**Testes:**

- `packages/harness/src/__tests__/c100-t01-skill-{acquisition,race,decode,inspection,selection,redaction,grant-boundary,loader-hardening}.test.ts`;
- `tests/c100-t01-skill-inspection-consumer.test.ts` (`dist` + `redactSensitiveText`);
- pins em `tests/consumers-public-surface.test.ts`, inclusive a ausência dos ganchos;
- ajustes em `pdsh-015` e `pdsh-031` só se um caso da tabela do §7.12 exigir, sem afrouxar asserção.

**Documentos:** linhas `experimental` e nota do `skillPath` em `docs/architecture/PUBLIC_API.md`; notas de fechamento nesta SPEC; lista de cobertura por arquivo, se a política exigir.

**Não tocar:** `packages/contracts|platform|sandbox|shared|persistence`, migrations, `apps/**`, `products/**`, `legacy/**`, `skills/exam-intake`, `scripts/gen-tool-catalog.mjs`, `package.json`/lockfile, cartões e ledgers.

## 12. Provas

**First red.** Na base, a API nova não existe: o first red é "export ausente", registrado com a saída bruta. Os testes do loader (SK14) têm first red real, porque os casos da tabela do §7.12 falham na base. O SK10c-base é controle de regressão, verde na base, e é declarado assim.

**Ganchos internos** (`acquisition.ts`, não exportados pelo pacote):

- `trace(evento)`, com `lstat | open | opendir | read`, o caminho relativo e o resultado;
- `afterLstat`, `afterOpen` e `afterFstat` por caminho;
- `afterListing`;
- `beforeItemCheck` (depois da última leitura do item e antes da conferência do §8.7) e `afterItem` (depois dela);
- `beforeLookup` e `afterLookup` (em volta de cada busca do §8.11);
- `mapStat` (só pode trocar `dev` por outro valor, o que só gera recusa);
- `platform` (só pode forçar "não suportada").

Os ganchos só endurecem: nenhum faz uma checagem passar. Eles só se instalam por um setter interno de `acquisition.ts`, nunca por variável de ambiente nem por `globalThis` (R2-O3). Um teste estático confere que nenhum módulo fora de teste importa o setter.

**Tempo (R2-M4).** Toda prova de troca de diretório espera pelo menos 50 ms entre a última escrita da fixture e a troca, e faz a volta do ABA no `beforeItemCheck`. Assim a prova não depende do mesmo tique do kernel. Os testes de corrida rodam em diretório temporário local, com timestamp fino (ext4, xfs, btrfs ou tmpfs), nunca em NFS nem em sistema de arquivos de granularidade grossa (R3-O8).

Fixtures sintéticas em diretório temporário; nenhum teste roda como root (um teste confere `process.getuid() !== 0` e falha, sem pular, se rodar como root).

| ID         | Teste                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Aceite   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| SK01       | A mesma árvore CVG_JSON em dois caminhos, criada em ordem inversa e com mtimes diferentes: mesmos `itemDigest` e `inputDigest`, e o mesmo JSON do relatório. A função de digest com lista permutada dá o mesmo valor. Item com symlink recusado em dois lugares: mesmo digest, com `bytes` `null` (O1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | A01      |
| SK01b      | Mesma skill em dois roots: `DUPLICATE_ID` nos dois, inclusive com um deles fora da listagem (cap). Frontmatter com `name` ≠ diretório: `NAME_DIRECTORY_MISMATCH` (MU25)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | A01, A12 |
| SK02       | `SKILL.md` com `rm -rf`, shebang e instrução de criar arquivo; `run.mjs` que criaria um sentinela se importado. Depois da inspeção e da seleção: sentinela ausente, nenhum filho, `run.mjs` com `read: false` e `EXECUTABLE_CONTENT_PRESENT`. Varredura estática dos módulos novos: sem `import(`, `require(`, `child_process`, `vm`, `eval` nem `new Function`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | A02      |
| SK03       | Formato. Manifesto: campo desconhecido, ausente, tipo errado; `MANIFEST_SYNTAX_INVALID` com conteúdo `api_key=SYNTH…` e `{"a": SYNTH-SECRET}` (o relatório não contém `SYNTH`); duplicata simples e com escape (`{"id":"a","\u0069d":"b"}`, MU29). Frontmatter: `allowed-tools`, `license` e `metadata`; chave repetida; recuo, comentário, bloco e fluxo; `--- `, `----`, `...`; cabeçalho vazio; 33 linhas e `maxFrontmatterBytes` + 1 (`FRONTMATTER_TOO_LARGE`); fechamento no fim do arquivo aceito; valor terminado em `:`; `true`, `null`, `~`, `1.0`, `yes`, `0x1f`, `.5` e `+.5` (MU43). Decodificação: BOM e byte inválido. CR no frontmatter, no corpo e numa referência dá `LINE_ENDING_UNSUPPORTED` (MU42). `FORBIDDEN_CODE_POINT` com U+202E, U+200B, U+2028, U+0085 e TAB no frontmatter **e** na descrição do `skill.json`; `DESCRIPTION_TOO_LONG`. Bidi e U+200B no corpo dão `FORBIDDEN_CODE_POINT_IN_CONTENT` com contagem, sem bloquear                                                                                                                                                                                                                                                                                                                                                                                     | A03      |
| SK04       | Markdown sem `skill.json`: inventário `VALID` com quatro campos `UNDECLARED`; admissão `NOT_ADMITTED` (`VERSION_UNDECLARED`, `REQUIREMENTS_UNDECLARED`, `RISK_UNDECLARED`) mesmo com digest e grant completos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | A04, A13 |
| SK05       | Recusa estática. Diretório de skill que é symlink para fora (marcador ausente), arquivo symlink, symlink interno, root symlink, root não canônico (pai simbólico), hardlink, FIFO e socket. `MOUNT_POINT_REFUSED` via `mapStat`. Com `trace`: **nenhum `open`** em entrada recusada pelo `lstat` (mata MU01b, MU02a e MU03a). O FIFO não bloqueia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | A05      |
| SK05b      | Corridas, por ganchos. (i) Arquivo vira symlink entre o `lstat` e o `open`: `SYMLINK_REFUSED` (`ELOOP`); sem `O_NOFOLLOW` daria `FILE_CHANGED_DURING_READ` (MU01a). (ii) Diretório vira symlink para fora entre o `lstat` e o `open`: `SYMLINK_REFUSED` (`ENOTDIR`) e marcador ausente; sem `O_NOFOLLOW` no diretório daria `TREE_CHANGED_DURING_READ` (MU01c). (iii) **ABA:** a fixture espera pelo menos 50 ms depois da última escrita; depois de fixar o diretório da skill, ele é renomeado e trocado por symlink para fora; o item é lido; o `beforeItemCheck` desfaz a troca. O `SKILL.md` de fora tem o marcador no corpo **e** na `description`. Asserções: o `sha256` do `BODY` é o dos bytes de dentro; o marcador não aparece no relatório; o item sai `TREE_CHANGED_DURING_READ` e `INCOMPLETE`. Mata MU04 (abrir por caminho leria o arquivo de fora e mudaria o `sha256`) e MU05 (conferir só dev/ino daria `COMPLETE`). (iv) Hardlink criado entre o `lstat` e o `open`: `FILE_CHANGED_DURING_READ` (MU02b). (v) Arquivo cresce depois do `fstat`, pouco: `FILE_CHANGED_DURING_READ`; acima do cap: `CAP_EXCEEDED` (MU03b daria `FILE_CHANGED`). (vi) Subdiretório criado no root durante a chamada, com espera de 50 ms antes (muda `nlink` e não depende de tique): root `TREE_CHANGED_DURING_READ` e relatório `INCOMPLETE` | A05, A15 |
| SK06       | Cada linha de cobertura do §7.3, excedida por 1 e no limite exato. Listagem do root com 65 entradas e cap 64: `trace` mostra no máximo 65 leituras de `Dirent` e nenhum `lstat` dos filhos (mata MU06 e MU07); o mesmo em subdiretório com `maxFilesPerSkill`. Limite 0, -1, 1,5, `NaN`, `Infinity` ou acima do teto: `INPUT_INVALID`, com `trace` vazio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | A06      |
| SK06b      | Relógio injetado: prazo vencido no meio de um arquivo de 200 KiB lido em blocos dá `DEADLINE_EXCEEDED`, e os itens seguintes não aparecem (MU09)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | A06      |
| SK07       | Drift. (a) Inventário, troca de 1 byte no `SKILL.md`, seleção com o digest antigo: `DIGEST_MISMATCH`. (b) `version` alterada muda o `itemDigest`, e o aprovado anterior não admite. (c) `expected.inputDigest` diferente: `EXPECTED_INPUT_DIGEST_MISMATCH`. (d) A API não aceita relatório como entrada (teste de tipo)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | A07, A14 |
| SK07b      | Gancho troca o conteúdo do `SKILL.md` depois do hash e antes do retorno: o corpo devolvido tem o sha256 do `itemDigest`, sem releitura (MU24)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | A07      |
| SK08       | Estimativas com as fixtures da REA: permanente 13 e 13; invocação 17 e 1.505; CVG_JSON 15 e `NO_BODY`. Corpo presente e vazio: `BODY`, 0 tokens (MU32). A projeção não contém o sentinela do corpo, e o relatório não contém o corpo (MU36)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | A08      |
| SK08b      | Duas skills válidas e pequenas, `chosen` e `other` (`skill.json` + `SKILL.md` dentro dos caps). Na seleção de `chosen`, o `trace` não tem `open` nem `opendir` de `other`, só o `lstat` de busca de nome. `bytesRead` = bytes de `chosen` (MU11)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | A08      |
| SK08c      | Consistência I13: para a mesma árvore, admissão do item e seleção concordam nos casos admitido, digest divergente, tool sem grant, recusa em outro item, **arquivo regular com o mesmo nome em outro root** (caso t10 da sonda do crítico: `NAME_CONFLICT` nos dois; MU38) e **`EACCES` na busca** (root com leitura e sem busca: `NAME_LOOKUP_FAILED` nos dois; MU39). Ordem: com espera de 50 ms antes, o `beforeLookup` remove a duplicata em outro root e o `afterLookup` a devolve; a conferência final dá `COVERAGE_INCOMPLETE` (MU40). As exceções (a) a (d) do I13 dão o comportamento declarado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | A08, A12 |
| SK09       | Separação de permanente, invocação e referências, com `estimator`. Corpo acima do cap: `UNKNOWN` com motivo (MU35). A árvore fica igual antes e depois. Varredura estática: sem API de escrita nem import de usage, budget ou ledger (MU34)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | A09      |
| SK10       | Admissão: `TOOL_NOT_GRANTED`; `*` dá `WILDCARD_GRANT_NOT_ACCEPTED`, mesmo com `requiredTools` vazio (MU15); `allowed-tools: fs.write` não muda nada (MU14); a skill `constructor` com `approvedItemDigests = {}` dá `DIGEST_NOT_APPROVED` (MU33). Paridade com `agentExposesTool` numa tabela de casos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | A10      |
| SK10c-base | Kernel público (`createOperationalHarness` com `ScriptedOrchestrator`/`ScriptedModelGateway`, sem provider): perfil sem `synthetic.write`; o roteiro pede `synthetic.write`; `POLICY_DENIED`, `execute` não chamado. **Controle de regressão, verde na base**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | A10      |
| SK10c-new  | Dois controles: (i) skill declara `synthetic.write` fora do mesmo array `AgentProfile.tools`/`grantedTools`: seleção `REFUSED`, razão `TOOL_NOT_GRANTED`, array intacto e kernel `POLICY_DENIED`, corpo da ferramenta zero; (ii) skill declara somente ferramentas concedidas e tem corpo que instrui WRITE: seleção `SELECTED`, grant continua intacto e WRITE continua `POLICY_DENIED` no kernel. Nos dois controles o array é congelado ou comparado antes/depois; a seleção não ganha autoridade. Mata MU14b e MU47. Vermelho na base                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | A10      |
| SK11       | Com o redator real (teste de consumidor): `api_key=…`, `Bearer …` e e-mail somem da descrição. Requisito `token:abc` dá `SECRET_PATTERN_IN_IDENTIFIER`, exibido como `<redacted:1>`; o mesmo id em `hostIdentifiers` não é redigido (R2-O1, MU45). `version` `123.456.789-09` e id `5551234567` (R2-O9) são redigidos; nesses itens, `itemDigest` e o `sha256` do arquivo saem `null`, e nenhum prefixo do sha256 do valor bruto aparece no relatório (MU41). Corpo com segredo não aparece. `.env` com `read: false`. Nenhum caminho absoluto em relatório, finding, erro ou `skillPath` do loader. Acrescentar chave desconhecida contendo caminho absoluto e `api_key` sintética: loader e consumidor dist retornam somente categoria estática `campo desconhecido`, sem chave, valor ou prefixo; strict continua recusando o manifesto. No relatório da inspeção, o mesmo manifesto dá `MANIFEST_INVALID` com `validatorCode` `UNKNOWN_FIELD` e sem `field` (MU48). O segredo sintético é montado no teste por concatenação, sem literal no fonte. Limitação documentada: `ghp_…` na descrição passa, o que fixa o alcance de A11                                                                                                                                                                                                          | A11      |
| SK11b      | HOME, cwd, `CVG_SKILLS_DIR` e `CLAUDE_CONFIG_DIR` apontando para skills e `CLAUDE.md` marcados: nenhum marcador; só os roots informados (MU20)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | A11      |
| SK12       | Formato `VALID` com requisito ausente: `NOT_ADMITTED`. `runtimeGrant` `NONE` em tudo. O tipo não tem campo de ativação, approval ou corpo. O pacote não exporta função de ativar nem os ganchos. Teste estático: nenhum módulo fora de teste importa o setter dos ganchos, e nada os liga por variável de ambiente ou `globalThis` (MU23, MU44)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | A12      |
| SK13       | Consumidor do `dist`: superfície e caminho feliz. **Negativos no `dist`:** diretório symlink para fora (A05); seleção com digest divergente (A07); `TOOL_NOT_GRANTED` (A10); redação real e ausência de caminho absoluto (A11)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | A16      |
| SK14       | Loader: uma linha de teste por linha da tabela do §7.12. As linhas de mudança têm first red na base; `pdsh-015` e `pdsh-031` verdes. Casos de F02: chave desconhecida com caminho absoluto e segredo montado no teste dá só "campo desconhecido"; diretório com nome divergente dá só "id difere do nome do diretório"; nenhum dos dois traz a chave, o id ou o nome (MU46)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | A17      |
| SK15       | Redação fail-closed: redator que lança, ou que devolve não-string, dá `[redaction-failed]`, `REDACTION_FAILED` e não admite (MU31). Redator ausente ou não função dá `REDACTOR_MISSING`, com `trace` vazio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | A11      |
| SK16       | Conhecimento: sem `availableKnowledge` dá `KNOWLEDGE_NOT_EVALUATED`; com outra lista dá `KNOWLEDGE_NOT_AVAILABLE`; com a certa, admitido                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | A13      |
| SK17       | Conflito: `name` ou `description` diferente entre `skill.json` e frontmatter dá `MANIFEST_FRONTMATTER_CONFLICT`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | A03      |
| SK18       | `FORMAT_NOT_ENABLED`: root só `cvg-json` com `SKILL.md` presente, e root só `markdown` com `skill.json` presente. Arquivo não lido, item `INCOMPLETE`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | A03, A06 |
| SK19       | Erro de FS: root com modo 000 dá `ROOT_UNREADABLE` + `EACCES`; arquivo com modo 000 dá `READ_FAILED` + `EACCES`; root inexistente dá `ROOT_NOT_FOUND`. Sem mensagem em lugar nenhum (MU19)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | A11      |
| SK20       | Plataforma (gancho `platform`): `darwin`, constante ausente ou `/proc/self/fd` ausente dão `PLATFORM_UNSUPPORTED` antes de qualquer acesso ao root (`trace` vazio), na inspeção, na seleção e no loader (MU37)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | A18      |

### 12.1 Mutantes nomeados

| Mutante | Descrição                                                                        | Morto por                    |
| ------- | -------------------------------------------------------------------------------- | ---------------------------- |
| MU01a   | `open` de arquivo sem `O_NOFOLLOW`                                               | SK05b(i)                     |
| MU01b   | `stat` no lugar de `lstat`                                                       | SK05 (`trace`)               |
| MU01c   | `open` de diretório sem `O_NOFOLLOW`                                             | SK05b(ii)                    |
| MU02a   | sem `nlink` no `lstat`                                                           | SK05 (`trace`)               |
| MU02b   | sem a comparação de assinatura depois do `open`                                  | SK05b(iv)                    |
| MU03a   | sem teto pelo tamanho do `lstat`                                                 | SK05 (`trace`) e `bytesRead` |
| MU03b   | leitura sem limite de cap + 1                                                    | SK05b(v)                     |
| MU04    | abrir por caminho em vez de `/proc/self/fd/<dfd>/<nome>`                         | SK05b(iii)                   |
| MU05    | recheck do item só por `dev`/`ino`                                               | SK05b(iii)                   |
| MU06    | `readdirSync` completo                                                           | SK06                         |
| MU07    | processar a parte listada quando a listagem estoura                              | SK06                         |
| MU08    | admissão ignora a cobertura do item                                              | SK06, SK12                   |
| MU09    | prazo ignorado                                                                   | SK06b                        |
| MU10    | digest com caminho absoluto, mtime ou `bytes` de symlink                         | SK01                         |
| MU11    | seleção adquire todas as skills                                                  | SK08b                        |
| MU12    | digest sem ordenação                                                             | SK01                         |
| MU13    | seleção confia no digest sem recalcular                                          | SK07                         |
| MU14    | tool declarada ou `allowed-tools` vira grant                                     | SK10                         |
| MU14b   | seleção altera o grant recebido                                                  | SK10c-new                    |
| MU15    | curinga aceito                                                                   | SK10                         |
| MU16    | campo desconhecido descartado                                                    | SK03                         |
| MU17    | Markdown recebe defaults                                                         | SK04                         |
| MU18    | descrição sem redação                                                            | SK11                         |
| MU19    | `error.message` em finding ou erro                                               | SK19, SK03                   |
| MU20    | autodiscovery                                                                    | SK11b                        |
| MU21    | `import()` de arquivo da skill                                                   | SK02                         |
| MU22    | duplicata admitida                                                               | SK01b                        |
| MU23    | `runtimeGrant` derivado da admissão                                              | SK12                         |
| MU24    | seleção relê o corpo depois do hash                                              | SK07b                        |
| MU25    | `name` ≠ diretório aceito                                                        | SK01b                        |
| MU26    | BOM removido em silêncio (`TextDecoder` default)                                 | SK03                         |
| MU27    | decodificação não fatal (U+FFFD)                                                 | SK03                         |
| MU28    | código proibido aceito na descrição do `skill.json`                              | SK03                         |
| MU29    | chave duplicada comparada sem decodificar escape                                 | SK03                         |
| MU30    | mensagem do `JSON.parse` copiada                                                 | SK03                         |
| MU31    | falha do redator tolerada (descrição crua)                                       | SK15                         |
| MU32    | corpo vazio vale 1 token                                                         | SK08                         |
| MU33    | consulta de digest pelo protótipo                                                | SK10                         |
| MU34    | estimativa única para permanente e invocação                                     | SK09                         |
| MU35    | desconhecido vira zero                                                           | SK09                         |
| MU36    | corpo na projeção permanente                                                     | SK08                         |
| MU37    | sem checagem de plataforma                                                       | SK20                         |
| MU38    | seleção ignora arquivo regular com o mesmo nome                                  | SK08c                        |
| MU39    | erro na busca tratado como ausente                                               | SK08c                        |
| MU40    | conferência dos roots antes da última busca                                      | SK08c                        |
| MU41    | marcador ou digest calculado sobre o valor redigido                              | SK11                         |
| MU42    | CR aceito no corpo ou em referência                                              | SK03                         |
| MU43    | `0x…` ou `.5` aceito como texto                                                  | SK03                         |
| MU44    | gancho ligado por variável de ambiente ou `globalThis`                           | SK12                         |
| MU45    | isenção de redação além da igualdade exata                                       | SK11                         |
| MU46    | loader reinterpola na mensagem a chave desconhecida, o id ou o nome do diretório | SK14, SK11                   |
| MU47    | seleção dá `SELECTED` com ferramenta declarada fora do grant                     | SK10c-new (i), SK10          |
| MU48    | inspeção publica em `field` uma chave fora do vocabulário fixo                   | SK11                         |

## 13. Aceites numerados

Coluna **T07**: "base" é aceite do cartão PAR-T07 (`0380:537`). "Proposta" é ampliação proposta à T07, sujeita à revisão do dono (o Codex) antes do BUILD (`0383:13`).

| Aceite | Origem     | Texto                                                                                                                                                                                                                                                                  | Prova                       | T07                                                  |
| ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------- |
| A01    | SI01       | JSON-CVG válido gera inventário com origem por label e caminho relativo, e o hash canônico de skill é estável em qualquer caminho e ordem. Duplicata não é admitida                                                                                                    | SK01, SK01b                 | proposta                                             |
| A02    | SI02       | Markdown declarativo é distinguido e nunca executado ou importado                                                                                                                                                                                                      | SK02                        | proposta                                             |
| A03    | SI03       | Erro de sintaxe, de decodificação, de gramática, campo ou chave desconhecida, chave duplicada e conflito são reportados com escopo, sem mensagem de terceiros; item `INVALID`                                                                                          | SK03, SK17, SK18            | proposta                                             |
| A04    | SI04       | Sem versão, requisitos e risco de fonte explícita, não há admissão                                                                                                                                                                                                     | SK04                        | proposta                                             |
| A05    | SI05       | Sob o modelo do §3, symlink, hardlink, especial, montagem e root não canônico não são seguidos; nada de fora do root é lido, mesmo com troca ABA                                                                                                                       | SK05, SK05b                 | proposta                                             |
| A06    | SI06       | Limites finitos, inclusive a listagem; o efeito segue o §7.3; limite inválido é erro antes do disco                                                                                                                                                                    | SK06, SK06b, SK18           | proposta                                             |
| A07    | SI07       | Skill sem hash aprovado, ou com hash divergente, não é admitida nem selecionada; drift entre aquisição e uso e relatório antigo não valem; o corpo devolvido é o buffer do hash                                                                                        | SK07, SK07b                 | **base** ("sem hash aprovado não entra no catálogo") |
| A08    | SI08       | Custo permanente só da projeção; corpo nunca no relatório; seleção lê e devolve só a skill escolhida; admissão e seleção consistentes                                                                                                                                  | SK08, SK08b, SK08c          | proposta                                             |
| A09    | SI09       | Custos separados e versionados; sem base dá `UNKNOWN`; nada escreve em usage                                                                                                                                                                                           | SK09                        | proposta                                             |
| A10    | SI10       | Skill que exige ferramenta fora do grant não é admitida nem selecionada; declaração não concede; no kernel continua `POLICY_DENIED`. Com ferramentas concedidas, corpo que instrui WRITE é `SELECTED`, e o WRITE continua `POLICY_DENIED` (F01)                        | SK10, SK10c-base, SK10c-new | **base** ("tool fora do grant falha ao carregar")    |
| A11    | SI11       | Saída sem caminho absoluto, sem mensagem de terceiros e sem segredo **nos padrões do redator do host**; redação falha fechado; mensagens do validador e do loader são categorias estáticas, sem chave, valor ou caminho de terceiros (F02); nada fora dos roots é lido | SK11, SK11b, SK15, SK19     | proposta                                             |
| A12    | SI12       | Validação, cobertura e admissão separadas; `runtimeGrant` `NONE`; nenhuma ativação                                                                                                                                                                                     | SK12, SK01b, SK08c          | proposta                                             |
| A13    | 0395 T02   | Manifesto válido com requisito de admissão ausente (inclusive conhecimento) permanece não admitido                                                                                                                                                                     | SK04, SK16                  | proposta                                             |
| A14    | 0395 T02   | Versão alterada não reaproveita aceite                                                                                                                                                                                                                                 | SK07                        | base (efeito do hash)                                |
| A15    | 0395 T02   | Cobertura incompleta e upgrade concorrente não reaproveitam aceite                                                                                                                                                                                                     | SK05b, SK06                 | proposta                                             |
| A16    | superfície | Exports experimentais, pins e `PUBLIC_API`; negativos de A05, A07, A10 e A11 no `dist`; fronteira neutra respeitada                                                                                                                                                    | SK13                        | —                                                    |
| A17    | P8         | Loader endurecido conforme a tabela do §7.12, com mensagens do validador em categorias estáticas (F02), sem afrouxar testes                                                                                                                                            | SK14                        | —                                                    |
| A18    | §3         | Fora de Linux com `/proc`, recusa explícita, sem modo degradado                                                                                                                                                                                                        | SK20                        | —                                                    |
| A19    | 0383 T01   | O aceite do pai fica mantido no recorte (descoberta, recusa e seleção). A invocação pelo modelo é da 0255-C. **Não fecha C100-T01**, e CC100-05-01 a 03 seguem `NOT_RUN` no pin                                                                                        | —                           | —                                                    |
| A20    | 0380 T07   | A 0255-A **não fecha a PAR-T07**: faltam precedência de origem, watcher, catálogo persistido e ferramenta de catálogo do modelo (§5)                                                                                                                                   | —                           | —                                                    |

## 14. Gate e pré-requisitos do BUILD

**Trilha T3:** contrato público novo, parsing não confiável e fronteira de admissão.

**O BUILD da 0255-A só começa com todos os itens abaixo provados e registrados:**

1. **Crítico independente** desta SPEC com `APPROVE` e zero obrigatórios. Pelo `0383:15`, há até dois retrabalhos; a r2 e a r3 foram os dois, e a r3 teve `APPROVE`. A r4 é o [replanejamento registrado](../04_audit/evidence/C100-T01-INSPECT-SPEC-20261022/replan-20261023.md): o crítico revisa só o delta r3 → r4. Se ele pedir mais um obrigatório, a SPEC para e volta ao usuário, sem r5, com as opções de cortar o escopo da 0255-A, aceitar o resíduo como risco declarado ou passar a autoria ao dono do programa (R3-O6).
2. **Revisão dos aceites pelo Codex**, dono do Claude100 (decisão de 22/10), **depois** do `APPROVE` do crítico e **antes** da revisão do usuário (R2-O6). Cada aceite "proposta à T07" do §13 é aceito, ajustado ou cortado, e a revisão é registrada. Se o Codex mudar qualquer aceite, a SPEC ganha nova revisão e novo sha256, e o crítico revisa de novo antes de seguir. A revisão do Codex sobre a r3 deu REVISE (F01 e F02); a r4 aplica o patch dele, e o Codex confere a r4 antes da revisão do usuário.
3. **Revisão explícita do usuário (T3)**, presa ao sha256 que passou pelos itens 1 e 2, com os defaults do lead (§2.10 e §17.2, inclusive a P22) e as premissas abertas (§17.3).
4. **C100-Q01 `DONE` no 0383**, com o comparador e a jornada M1 qualificados no mesmo SHA (`0383:194`). Os nove reusos da Q01: PAR-Q03 e PAR-Q04 `DONE`; PAR-K01, K03, S01, X01, X02, X03 e X04 abertos (recon §1).
5. **PAR-K05 integrada e qualificada no 0380.** Ela é dependência da PAR-T07 (`0380:536`), e a 0255-A é SPEC da T07.
6. Claim próprio com o conjunto de escrita do §11. Nenhuma migration, lockfile ou dependência nova; se surgir, a execução para e volta ao usuário.

Pela decisão de 22/10, a PAR-C06 não é gate da 0255-A. Ela continua reuso da C100-T01 no 0383, para a 0255-C. A colisão da migration 0029 não é aceite da Q01 e fica como risco (§16) e observação ao integrador (O12).

**BUILD da 0255-B:** os itens 1 a 4 e 6, mais a 0255-A entregue, PAR-H04, K04 e H02 integradas e qualificadas, e uma revisão futura com o §10 completo.

**Estado em 23/10/2026:** o item 1 precisa da rodada do crítico sobre o delta da r4; os itens 2 a 5 estão abertos. O BUILD está **bloqueado**.

## 15. Gates de pronto (quando houver BUILD)

- Node 22 em Linux; `npx prettier --check` nos tocados; `npm run -s lint`; `npm run -s typecheck`; `npm run -s docs:check-links`.
- SK01–SK20; `npm test`; cobertura do CI, `coverage:critical` e `mutation:guard`, sem baixar limiar.
- `node scripts/workspace-dependency-audit.mjs` sem violação.
- `test:postgres` e E2E da barra T2, com claim; `certify` no fim da rodada com código.
- MU01a–MU48 registrados com o teste que os mata; first red com saída bruta.
- Crítico de código independente, com até dois retrabalhos (`0383:15`).
- Nada autoriza deploy, produção, release, dado real ou mudança de pin.

## 16. Riscos

- **Timestamp grosso (P22).** Em kernel sem multigrain, troca ou escrita no mesmo tique pode não mudar a assinatura. Isso nunca leva a ler de fora (G1). Os efeitos possíveis estão no §3: leitura rasgada de dentro, ABA de diretório não sinalizado e duplicata transitória não vista.
- **Dependência de `/proc` e Linux.** Ambiente sem `/proc/self/fd` (contêiner sem `/proc` montado, outro SO) recusa. Desenvolvimento em macOS não roda a inspeção nem o loader endurecido.
- **Loader endurecido.** Symlink no root, mais de 64 entradas, `skill.json` acima de 16 KiB e outras plataformas passam a erro (§7.12). Não há consumidor de runtime hoje.
- **Estimador grosseiro**, sem medir consumo real.
- **Compatibilidade baixa com skills do Claude** (P4, P7, P19, P23), por escolha.
- **CRLF recusado (P23, R3-O5).** `SKILL.md` ou referência com CR em qualquer ponto, inclusive arquivo salvo com CRLF, sai `INVALID` (R2-O4). Falha fechado.
- **Redator do host com cobertura limitada** (§7.11). A11 vale só nos padrões dele.
- **Falsos positivos da redação de identificadores (P18).** Versão CalVer (`2024.10.22`), arquivo com esse nome e ids como `token:refresh`, `secret:read` e `credential:lookup` são redigidos pelo `redactSensitiveText` de hoje e deixam o item `INVALID`. A exceção são os ids passados em `hostIdentifiers` ou concedidos. Falha fechado.
- **Parser próprio de frontmatter**: subconjunto, não YAML. Divergências são recusadas.
- **Cópia da primitiva de leitura física.** Já existem cópias em `boundary-installed-identity.mjs`, `release-image-contract.mjs`, `build-installed-reference.mjs` e `release-image-record.mjs`. A do harness é a quinta, forçada pela fronteira. A consolidação fica registrada como achado (O7), sem bloquear.
- **Três leitores de skill até a consolidação.** O gerador de catálogo fica igual (achado para o PDSH-014).
- **Cadeia de gate.** Q01/M1 e K05 (← K04 ← K01) adiam o BUILD.
- **Colisão da migration 0029** na fundação (recon §1.3). Atrasa Q01/M1; é assunto do integrador.
- **Digests aprovados vindos do chamador** até existir o catálogo da T07 (P11).
- **Memória:** até `maxTotalBytes` em buffer; os buffers do corpo ficam vivos até o retorno da seleção.
- **Prazo síncrono** de até 60 s bloqueia o event loop (I12).

## 17. Decisões, defaults e premissas

### 17.1 Decisão do usuário (22/10/2026)

- **D1 (antes P1/P2).** A 0255-A é a primeira SPEC da PAR-T07. O `itemDigest` é o hash canônico de skill. O lead escreve, e o Codex revisa os aceites. Não há avaliador paralelo. O BUILD espera Q01/M1, a PAR-K05 e a revisão T3. Aplicada no §2.9, no §5, no §13 e no §14.
- **Revisão do Codex sobre a r3 (22/10/2026):** REVISE com F01 (SK10c-new) e F02 (mensagens do validador). Aplicada na r4 pelo patch dele, conforme o [replanejamento](../04_audit/evidence/C100-T01-INSPECT-SPEC-20261022/replan-20261023.md).

### 17.2 Defaults do lead (22/10/2026), aplicados e sujeitos à revisão T3

- **Ameaça:** escritor concorrente não confiável no root; falha fechado (§3).
- **Plataforma:** Linux com `/proc`; fora disso, `PLATFORM_UNSUPPORTED` (§3).
- **P8:** endurecer o loader, com a tabela do §7.12. Pela F02, as mensagens do validador viram categorias estáticas.
- **P4:** chave fora da gramática (inclusive `license` e `metadata`) dá `INVALID` (§7.5).
- **P11 (O5):** digests vêm do chamador na 0255-A; a 0255-C só usa digests do catálogo aprovado da T07 (§7.10).
- **P12 (M2):** tabela do §7.3. O estouro de listagem não processa nada daquele diretório. O teto de `maxEntriesPerRoot` cai para 256.
- **P15 (M4d):** recusar chave duplicada comparando a chave decodificada (§8.10).
- **P22 (R2-M4), kernel:** a G1 vale sempre. A G2 depende de timestamp; em kernel sem multigrain (antes do 6.13), troca no mesmo tique pode passar sem detecção. Não se fixa versão de kernel; a limitação fica declarada (§3).

### 17.3 Premissas abertas, com default proposto

O crítico da r1 julgou seguros P3, P5, P6, P7, P9, P10, P13, P14 e P16. O da r2 julgou seguros P17 a P21, com os ajustes desta revisão.

- **P3:** os campos que o Markdown não declara vêm só do `skill.json`. Default proposto: sim.
- **P5:** grant com `*` não é aceito na admissão, mesmo sem requisito (R2-O5). Default proposto: sim.
- **P6:** recusar todo symlink e todo hardlink, mais ponto de montagem. Default proposto: sim.
- **P7:** arquivos fora do conjunto fechado não são lidos. Default proposto: sim.
- **P9:** tipos em `@cvg/harness` como experimental. Default proposto: sim.
- **P10:** sem CLI ou console. Default proposto: sim.
- **P13:** estimador `cvg-chars4-v1`, com vazio = 0. Default proposto: sim.
- **P14:** projeção `<id>@<version>: <description>`, sempre uma linha. Default proposto: sim.
- **P16:** o 2.1.308 entra como desenho CVG, sem paridade; pin e denominador inalterados. Default proposto: sim.
- **P17 (nova):** precedência de origem da T07. Default proposto: recusar id duplicado (`DUPLICATE_ID`); precedência fica para uma fatia futura da T07, decidida pelo dono.
- **P18 (nova, O2):** identificadores passam pelo redator; mudança vira `SECRET_PATTERN_IN_IDENTIFIER` e `INVALID`, com marcador ordinal (R2-M2). Isenção: igualdade exata com `hostIdentifiers`, `grantedTools` ou `availableKnowledge` (R2-O1). Falsos positivos conhecidos: CalVer e ids `token:`, `secret:` e `credential:` fora da isenção. Default proposto: sim.
- **P19 (nova, O11):** recusar escalar ambíguo de YAML em `name` e `description`, inclusive `0x…`, `.5` e `+.5` (R2-O2); o falso positivo `1b` é aceito. Default proposto: sim.
- **P20 (nova, M3c):** admitir um item não exige a cobertura do relatório inteira, só a do item, roots abertos e unicidade por busca. O relatório só sai `ADMITTED` com cobertura `COMPLETE`. Default proposto: sim. Justificativa: alinha a admissão com a seleção, que não lista (M2). A busca de nome é única para os dois caminhos e falha fechado em qualquer erro (R2-M1).
- **P21 (nova):** recusar filho com `dev` diferente do root (`MOUNT_POINT_REFUSED`). Não pega bind mount do mesmo sistema de arquivos (fora do modelo) e pode recusar subvolume btrfs e overlayfs, o que falha fechado (R2-O7). Default proposto: sim.
- **P23 (nova, R3-O5):** recusar CR em `SKILL.md` e nas referências, inclusive CRLF no corpo. Default proposto: sim.

## 18. Atos do usuário e do dono do programa

- **Usuário:** revisar esta SPEC; confirmar ou trocar os defaults do lead (§17.2) e as premissas abertas (§17.3); depois do crítico e do Codex, aprovar ou recusar o BUILD da 0255-A pelo sha256.
- **Codex (dono do Claude100):** revisar os aceites marcados "proposta" no §13, como dono da PAR-T07; registrar a revisão.
- **Integrador:** registrar a 0255 como SPEC da PAR-T07 no 0380 e a colisão da 0029, nos ledgers dele.
- **Fazer o merge do PR do BUILD,** quando houver.

A SPEC não assume aprovação do Codex, renumeração da 0029 nem qualquer ato em produção.
