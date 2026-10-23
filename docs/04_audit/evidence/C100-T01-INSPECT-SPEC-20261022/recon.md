# Recon C100-T01/T02 — inspeção offline de skills e plugins

Task `C100-T01-INSPECT-SPEC-20261022`, 22/10/2026. Rodada T1, só leitura. Base: `main` `420b97b3373389f30ac82c4d4078a21b2363fdf9`, worktree detached própria. As âncoras `arquivo:linha` são dessa base. Material de entrada do Codex lido na worktree `cvg-d9ef-rea-plan-20261022`, sem editar: roadmap 0394, backlog 0395, relatório 0623, contrato proposto SI01–SI12, matriz, sonda do loader e snapshot dos cartões. Hashes de entrada em [spec-r1.json](spec-r1.json).

Nada aqui fecha cartão, concede paridade, move o pin 2.1.302 ou muda o denominador 134. Nenhum dado real, provider, canal ou rede. Nenhum conteúdo de skill ou plugin foi executado. A única execução foi uma sonda do loader do repositório com fixtures sintéticas em diretório temporário ([script](loader-probe.mjs.txt), [saída](loader-probe-output.json)).

## 1. C100-Q01 e a fundação M1

### 1.1 O que o cartão exige

- C100-Q01 está `IN_PROGRESS`, P0, trilha T3 (`docs/03_build/0383_backlog_paridade_claude_code.md:186`).
- Aceite: par referência/CVG conhecido correto PASS; adulteração, tenant trocado e referência ausente FAIL; jornada M1 e controles obrigatórios qualificados no mesmo SHA. "Sem isso, todos os consumidores permanecem bloqueados" (`0383:194`).
- Reusos obrigatórios: PAR-Q03, Q04, K01, K03, S01, X01, X02, X03 e X04 (`0383:191`). "A entrega correspondente precisa estar integrada e qualificada" (mesma linha).
- M1 = abrir sessão, READ, WRITE retida, approval autenticado, retomada e restart sem efeito extra, com Q01 e as fatias PAR-K01/K03/S01/X01–X04 qualificadas e o comparador rejeitando resultado errado (`docs/03_build/0382_roadmap_paridade_claude_code.md:50`).

### 1.2 O que está provado, e por qual receipt

| Item | Estado | Receipt |
| --- | --- | --- |
| Comparador e CLI locais (SPEC0229) | CQ01–CQ08 locais: 399 testes, 39 cenários independentes, 16 gates, 38 hashes (`0383:195`) | `docs/04_audit/evidence/CLAUDE100-EXEC-20261017/spec0229-build/REPORT.md` |
| Porta de referência (SPEC0235) | NP01–NP10 locais, auditoria independente 163/163; "Zero crédito M1/funcional" (`0383:196`) | `.../spec0235-runtime/REPORT.md` |
| Captura da referência 2.1.302 (SPEC0238 r5, run3) | TEXT, READ (R1) e WRITE_DENIED (W1) capturados; `REFERENCE_CAPTURE_ONLY`, revisão `PENDING`, `semanticQualification` `NOT_GRANTED` (`0383:200`) | `.../ref-capture-build/r5-run/state.json` |
| PAR-Q03, kit de test-support | `DONE` (`docs/03_build/0380_backlog_paridade_100_deepseek.md:128,134`) | `.../q03/cert-r2/manifest.json` |
| PAR-Q04, servidor de falhas | `DONE` no escopo sintético (`0380:138,145`) | `.../q04/REPORT.md` |

Os quatro pré-requisitos C100-G01–G04 estão `DONE` (`0383:124,139,154,169`). O G04 aprovou só o BUILD local da SPEC0229 (`0383:178`).

### 1.3 O que falta

- **Jornada M1 do lado CVG.** Nenhum receipt mostra sessão → READ → WRITE retida → approval autenticado → restart sem duplicar efeito, no mesmo SHA do comparador. Todos os receipts acima dizem "zero crédito M1".
- **Comparador semântico do conteúdo do READ**, gate externo RC10 e verificação externa RC11 (`0383:200`).
- **Qualificação da fundação.** O checkpoint 5e3b registra três suítes originais com 51 PASS e 43 FAIL, 7 pins em DRIFT e qualificação global aberta (`0383:198`; `.../foundation-qualification-preparation/REPORT.md:16`).
- **Journal 0225 (PAR-K03).** Ação ativa `C100-FND-JOURNAL-0225-BUILD-001:GROUPED-REWORK-R1:J07-NATIVE-BUILD`, com "implementação ... NÃO INICIADOS" (`.../CLAUDE100-EXEC-20261017/execution-state.json`, campos `active_action_id` e `last_completed_action`, gravado em 18/10). O campo `pending_authority` ainda aponta a SPEC0238, já resolvida em 19/10 (`0383:200`). O arquivo está defasado.
- **Reusos PAR de M1:** 2 de 9 `DONE` (Q03, Q04). K01 e K03 `IN_PROGRESS` (`0380:178,196`). S01, X01, X02, X03 e X04 `TODO` (`0380:354,259,268,277,286`). A SPEC0220 (K01) está adiada, e as SPECs 0221 (S01), 0222 (K04) e 0225 (K03) estão aprovadas com ajustes (`0380:53-57`).
- **Achado novo: colisão de número de migration.** A fundação reservou `0029` para a composição 0217 (`0029_controlled_published_kernel.sql`; o crítico da r1 contou 2.147 linhas em 1.367 arquivos de `docs/`, e a r1 desta recon dizia "1.635 menções" por outra regex, corrigido na r2 da SPEC), depois `0030` e `0031` (`0380:59`; `.../functional-capture-recon/m1-foundation-authority-reconciliation.json`, campo `migration_order`). A `main` já tem `packages/persistence/migrations/0029_case_assignment_authorization.sql` (SPEC0176, PR #13, commit `24cdb463`). Não achei registro dessa colisão nos ledgers. Isso precisa de renumeração decidida pelo dono antes do BUILD 0225/0221, e atrasa o fechamento de M1. Achado para o integrador; nada foi alterado.

**Conclusão:** Q01 e M1 continuam abertos. Nada nesta recon os marca como fechados.

## 2. Reusos PAR de T01 e T02 no 0380

C100-T01 depende de C100-Q01 e reusa PAR-T07, PAR-C06 e PAR-K05 (`0383:310-311`). C100-T02 depende de C100-T01 e reusa PAR-H04, PAR-K04 e PAR-H02 (`0383:324-325`).

| PAR | Estado | Depende de | "Hoje" e aceite | Âncora |
| --- | --- | --- | --- | --- |
| T07 — skills com origem, hash e catálogo | `TODO` | K05 | Hoje: registry, loader com `requiredTools` e uma skill. Aceite: tool fora do grant falha ao carregar; sem hash aprovado não entra no catálogo | `0380:530-537` |
| C06 — instruções de workspace e referências | `TODO`, P3, F6 | T09 | Hoje: ausente. Aceite: instrução de origem não aprovada não entra no prompt; nada fora do workspace é listado | `0380:1190-1197` |
| K05 — perfis e presets declarativos | `TODO` | K04 | Sem perfil nomeado, herança ou skills por sessão | `0380:212-219` |
| H04 — formulário e gestão de plugins | `TODO`, P2, F5 | H02, K04 | Catálogo e aprovação de capability existem; sem inventário carregado. Aceite: plugin não revisado não instala | `0380:813-820` |
| K04 — lifecycle de capabilities com quiescência | `IN_PROGRESS` (SPEC0222 aprovada com ajustes) | K01 | Sem gerações, recarga nem quiescência | `0380:203-210`, `0380:55` |
| H02 — configuração tipada com dump | `TODO` | K05 | Sem schema exportável. Aceite: dump nunca contém segredo | `0380:795-802` |

Cadeias até um cartão já iniciado:

- T07 ← K05 ← K04 (`IN_PROGRESS`) ← K01 (`IN_PROGRESS`).
- C06 ← T09 ← S05 ← S01 (`TODO`) ← K03 (`IN_PROGRESS`) ← K01 (`0380:472`, `0380:358`, `0380:200`).
- H04 ← H02 ← K05 ← K04; H04 ← K04.

Nenhum dos seis reusos está fechado. Pelo 0383, BUILD de T01 e de T02 fica bloqueado até eles estarem integrados e qualificados (`0383:311,325`). A fatia offline não consome C06 nem K05 diretamente. Ela sobrepõe parte do PAR-T07 (origem e hash). O 0383 manda acrescentar aceites na SPEC do dono do PAR, sem reconstruir o executor (`0383:13`). Isso vira premissa da SPEC.

## 3. O que já existe no harness

### 3.1 Skills

- `SkillDefinition` tem seis campos: `id`, `version`, `description`, `requiredTools`, `requiredKnowledge`, `riskLevel` (`packages/contracts/src/contracts.ts:88-95`). Não há origem, digest nem corpo. `AgentProfile.skills` é lista de `SkillRequirement` (`contracts.ts:22-32,83-86`).
- O loader (SPEC0200) lê só `skills/<id>/skill.json`, com vocabulário fechado e fail-closed: campo desconhecido é erro, campo ausente é erro, id igual ao diretório (`packages/harness/src/skills/loader.ts:16-23,47-56,68-70,131`). Esse validador estrito é o ponto de reuso para não afrouxar o formato.
- Registry com lookup por id; id duplicado lança erro (`packages/harness/src/skills/registry.ts:8-27`, numeração do arquivo). `assertSkillsAvailable` cobre ausência e versão divergente (`packages/harness/src/skills/assert.ts:4-31`).
- Exports experimentais em `@cvg/harness` (`packages/harness/src/index.ts:88`; `docs/architecture/PUBLIC_API.md:98-102`; pins em `tests/consumers-public-surface.test.ts:80-81`).
- **Nenhum runtime consome skills.** Fora dos testes, o loader e o registry não têm chamador. As composições usam `skills: []` (`packages/sdk/src/server.ts:126`; `packages/platform/src/controlled-kernel-execution.ts:441`).
- O gerador de catálogo tem um segundo leitor de skills, sem validação estrita (`scripts/gen-tool-catalog.mjs:103-129`). Uma inspeção nova não pode virar um terceiro.

### 3.2 Lacunas do loader, provadas pela sonda

Sonda sobre `loader.ts` (sha256 `4fdf6d79…`), Node v22.23.2, fixtures sintéticas ([saída](loader-probe-output.json)):

| Caso | Resultado |
| --- | --- |
| A — diretório de skill que é symlink para fora do root | carregado; marcador externo aparece no resultado |
| B — `skill.json` que é symlink para arquivo fora do root | carregado; marcador externo aparece |
| C — `skill.json` como hardlink de arquivo externo | carregado |
| D — descrição de 2 MiB | carregada inteira; não há teto de bytes |
| E — diretório só com `SKILL.md` | `ok: false`; a mensagem traz o caminho absoluto (vem de `error.message`, `loader.ts:138-140`) |
| F — formato do retorno | só os seis campos; nenhum digest nem origem |

Causa: `statSync` e `readFileSync` seguem symlink e não limitam bytes (`loader.ts:104,123,134`). O probe do Codex já tinha mostrado o caso E e o controle JSON (`REA-CLAUDE-20261022/harness-skill-probe.json`).

### 3.3 Plugins, registry e grant

- `PluginManifestSchema` é `.strict()`: `name`, `version` exata (sem `latest`), `capabilities`, `permissions`, `tools`, `hooks`, `dependencies`, `configSchemaVersion`. O `superRefine` exige unicidade, permissão de tool declarada e proíbe autodependência (`packages/platform/src/contracts.ts:391-470`). **O schema não tem campo de skills, agentes ou servidores MCP.** Agrupar skills num plugin (CC100-05-05) muda contrato público.
- `PluginRegistry` normaliza com `PluginManifestSchema.parse`, exige handler e validadores de entrada e saída por tool, e recusa hook não declarado (`packages/platform/src/plugin-gateway.ts:120-208,801-865`). A atestação de plugin revisado amarra manifesto canônico, handler e validadores (`packages/platform/src/plugin-execution-core.ts:37-73,118-128`).
- `CapabilityGateway.execute` só executa depois de: binding resolvido, `actorAuthorizer` presente e concedendo a permissão da tool, policy `allowed` ou `requires_approval`, e approval válido quando exigido (`plugin-gateway.ts:478-539`).
- Catálogo de plugins por tenant com estados `DRAFT`, `APPROVED` e `ARCHIVED` (`contracts.ts:474-507`), rotas admin (`apps/api/src/server.ts:2536-2660`) e `resolveApprovedPlugin` (`packages/platform/src/control-plane-store.ts:815-837`). `resolveApprovedPlugin` não tem chamador fora dos testes. A única composição de produção do registry é o plugin controlado de agenda (`packages/platform/src/controlled-plugins.ts:87-98`).
- Grant de ferramentas no kernel: exposição deny-by-default; lista vazia não expõe nada e `*` expõe tudo (`packages/harness/src/kernel/kernel-runtime.ts:84-96`). Tool fora de `AgentProfile.tools` termina em `POLICY_DENIED` antes de policy e sandbox (`kernel-runtime.ts:490-499`). Esse é o ponto público para provar que `requiredTools` declarado não concede nada.
- Egress: `resolveAndGuardOutboundUrl` (`packages/shared/src/ssrf.ts:267-276`). A inspeção offline não abre rede; o egress só entra como invariante ("nenhuma chamada").

### 3.4 Peças reutilizáveis sem sistema paralelo

| Necessidade | Peça existente | Restrição |
| --- | --- | --- |
| Validação estrita do manifesto de skill | `validateManifest` (`loader.ts:34-97`, hoje privado) | Mover para módulo interno e reusar no loader e na inspeção, sem mudar comportamento |
| Digest canônico | `canonicalizeJson` (`packages/contracts/src/canonical-json.ts:31`, tetos em `:13-14`) | Já é dependência permitida do harness |
| Estimador de tokens | `estimateTokens` = `max(1, ceil(text.length / 4))` (`packages/harness/src/context-engine.ts:39-41`) | Conta unidades UTF-16, não bytes; não tem nome de versão |
| Leitura sem seguir symlink | Padrão `lstat` → `open(O_RDONLY\|O_NOFOLLOW\|O_NONBLOCK)` → `fstat` mesmo inode, `nlink 1`, teto (`scripts/release-image-contract.mjs:205-245`; `packages/channel-gateway/src/exam-egress.ts:127-149`) | Não pode ser importado pelo harness (ver abaixo); o algoritmo é reaproveitado |
| Confinamento de caminho | `confinePath` (`packages/sandbox/src/confine.ts:14-62`) | Aceita symlink que resolve dentro do root; o harness não pode importar `@cvg/sandbox` |
| Redação de segredos | `redactSensitiveText` (`packages/shared/src/audit-governance.ts:235-271`), `redactValue` (`packages/observability/src/redaction.ts:26-55`) | O harness não pode importar `@cvg/shared`; entra por port injetado |
| Manifesto de plugin, registry, catálogo e atestação | §3.3 | Ficam na `@cvg/platform`, que já depende de harness e shared |

**Restrição de fronteira:** a política de dependências só permite `@cvg/harness` → `@cvg/harness-orchestrator` e `@cvg/harness-contracts` em produção (`config/workspace-dependency-policy.json:130-136`). Por isso a parte de skills fica no harness com `node:fs`, como o loader atual, e a parte de plugins fica na platform.

## 4. Delta entre a referência observada 2.1.308 e a baseline 2.1.302

- Pin do programa: Claude Code 2.1.302, sha256 `60d7eb7f…` (`docs/03_build/0381_plano_executivo_paridade_claude_code.md:38-39`; `docs/03_build/tracking/claude100_catalog_v1.json`, campo `reference`). Denominador 117 e total 134 (`0381:15,24,68`).
- Observado pela REA de 22/10: 2.1.308, sha256 `356733f1…` (`REA-CLAUDE-20261022/source-manifest.json`; `version-delta.json`, `baselineMoved: false`).
- Requisitos atribuídos: T01 tem CC100-05-01, 05-02 e 05-03; T02 tem 05-05, 05-07, 05-08 e 05-09; 05-04 e 05-06 são de PAR-T07 e PAR-H04 (`0383:313,327,729-737`). Todos são `FUNCTIONAL_PARITY`, com `reference_validation: NOT_RUN` no catálogo.

| Observação | 2.1.302 (pin) | 2.1.308 (observado) | Uso nesta SPEC |
| --- | --- | --- | --- |
| `plugin details` (inventário e custo projetado) | anunciado na ajuda: "Show a plugin's component inventory and projected token cost" (`REA-CLAUDE-20261017/rea-evidence-bundle.json`) | executado com fixture sintética: always-on ~17 tok; on-invoke < 20 com corpo curto e ~1,5 mil com corpo de 6.098 bytes; "Token counts are estimates" (`ev_32789eef…`, `ev_1c404fb7…`) | adotar a separação permanente/invocação como desenho CVG; sem crédito de paridade |
| `plugin validate --profile directory` | "unknown option '--profile'" (`ev_80f40d34…`, exit 1) | suportado; recusa a fixture por critério de publicação (`ev_bc01172d…`) | adotar perfil, cobertura e decisão como campos separados; não copiar regras de marketplace |
| validação normal × strict | não capturado | normal aceita warning (exit 0), strict recusa (exit 1) (`ev_74cdf166…`, `ev_80659b1d…`) | CVG não aceita campo desconhecido em nenhum perfil |
| flags da ajuda principal | — | nenhum nome novo; ajuda de `plugin eval` idêntica (`version-delta.json`) | sem efeito |

A estimativa do 308 bate com chars/4: o frontmatter da fixture tem cerca de 66 caracteres (~17 tokens), e 6.098 / 4 ≈ 1.525. O `estimateTokens` do CVG usa a mesma família. Isso não mede consumo real.

**Regra mantida:** o pin fica em 2.1.302 e o denominador em 134. Observação do 308 é insumo de desenho CVG (`CVG_CONTROL`). Ela não gera receipt `FUNCTIONAL_PARITY` (`0383:883`). Fechar CC100-05-0x exige captura funcional no pin, ou decisão registrada de mudar o pin.

## 5. Consequências para a SPEC0255

1. BUILD bloqueado hoje: Q01/M1 aberto e os seis reusos abertos.
2. A inspeção de skills fica no harness, reusando o validador estrito, `canonicalizeJson` e `estimateTokens`. Leitura própria sem seguir symlink, pelo padrão já usado no repo, porque a fronteira proíbe importar sandbox e shared.
3. Redação por port injetado pelo host.
4. A inspeção de plugins fica na platform, sobre `PluginManifestSchema` sem mudança.
5. As lacunas do loader (A–F) são o first red de contraste. Endurecer o loader é decisão do usuário.
6. Agrupar skills em plugin muda o schema strict: fora desta SPEC.
7. A colisão da migration 0029 vai para o integrador da fundação.
