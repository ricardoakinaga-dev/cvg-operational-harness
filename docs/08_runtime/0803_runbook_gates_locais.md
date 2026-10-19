# 0803 — Runbook dos gates locais do harness

- Data: 07/10/2026. Task: `PLAN0374-A-20261007` (plano [0374](../03_build/0374_plano_producao_harness.md), item B4).
- Objetivo: qualquer pessoa ou agente reproduz, num clone limpo, tudo o que o CI e a
  certificação exigem, sem descobrir armadilhas na hora. As armadilhas abaixo foram
  reproduzidas em [FULLTEST-20261007](../04_audit/evidence/FULLTEST-20261007/summary.md).

## Pré-requisitos

- Node 22 (`.nvmrc` = 22.23.2). O preflight recusa Node 24.
- Docker com acesso ao socket (PostgreSQL descartável, imagem, smokes).
- `npm ci` no clone. Nunca rode gates no checkout compartilhado de outro agente: use
  `git worktree add --detach <dir> <sha>` e `npm ci` lá.
- Um PostgreSQL 16 próprio em porta livre de loopback (55598/55599/55449 são do Codex):

```sh
docker run -d --name <seu-prefixo>-pg -p 127.0.0.1:<porta>:5432 \
  -e POSTGRES_PASSWORD=postgres postgres:16-alpine
# aguarde uma consulta real, não só pg_isready (a imagem reinicia uma vez após o init)
docker exec <seu-prefixo>-pg psql -U postgres -tAc 'select 1'
```

Use um banco por gate (`create database cvg_suite; create database cvg_pg; ...`) para
rodar gates em paralelo sem interferência.

## Ordem e variáveis

| Gate                                   | Comando                                                                      | Variáveis obrigatórias                         | Observação                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Formato, tipos, lint, build            | `npm run format:check typecheck lint build`                                  | —                                              | ~1 min                                                                          |
| Suíte com cobertura                    | `npm run test:coverage`                                                      | `TEST_DATABASE_URL`                            | ~10 min; 1 skip catalogado (SKIP-PG-021) sem `PHASE4A_DISPOSABLE_PG`            |
| Suíte PostgreSQL                       | `npm run test:postgres`                                                      | `TEST_DATABASE_URL`                            | ~3 min                                                                          |
| Cobertura crítica, mutação, skips      | `npm run coverage:critical mutation:guard skip:governance`                   | —                                              | Depende de `coverage/` e `certification/*-report.json` da suíte                 |
| E2E (Playwright)                       | `npm run test:e2e:prepare && npm run test:e2e`                               | portas 3199 e 4173 livres                      | **Sem o `prepare`, o dev server do Vite não resolve `@cvg/*` e 10/12 falham**   |
| Prova de browser REM21-014             | `npm run test:e2e:rem21-014`                                                 | —                                              |                                                                                 |
| Worker, chaos, evals, load, restore    | `npm run test:worker:startup test:chaos test:evals test:load test:restore`   | —                                              | `test:load` é contrato em memória, não benchmark                                |
| Provas rem21-010 / rem21-011           | `npm run test:postgres:proof test:observability:proof`                       | `TEST_DATABASE_URL` (010)                      |                                                                                 |
| Fases 2 e 3                            | `npm run verify:phase2 verify:phase3`                                        | `TEST_DATABASE_URL`                            | Sem a variável terminam `environment_blocked` (exit 2) por desenho              |
| Fase 4A                                | `npm run test:phase4a verify:phase4a verify:phase4a:identity`                | `TEST_DATABASE_URL`, `PHASE4A_DISPOSABLE_PG=1` | Sem a flag o gate PostgreSQL falha fechado, não pula                            |
| Docs, fronteira, licenças, SBOM, audit | `npm run docs:check-links licenses:check sbom audit:security`                | —                                              | `boundary:products` ver abaixo                                                  |
| Certificação agregada                  | `npm run certify`                                                            | `TEST_DATABASE_URL`, `PHASE4A_DISPOSABLE_PG=1` | ~25 min; o gate `format` reprova qualquer arquivo seu não formatado no worktree |
| Smoke da pilha de produção             | `npx tsx scripts/production-stack-smoke.ts --image <ref> --output <json>`    | —                                              | Sobe PostgreSQL, job de migração, API e worker próprios; 22 checks              |
| Restore com cadeia de auditoria        | `NODE_ENV=test npx tsx scripts/restore-audit-chain-proof.ts --output <json>` | —                                              | Espera por `select 1` duas vezes (corrigido em PLAN0374-A)                      |
| Segredos e vulnerabilidades da imagem  | gitleaks `git` mode com `.gitleaks.toml`; Trivy na imagem `--target runtime` | —                                              | `gitleaks dir` não aplica os allowlists por caminho (caminhos absolutos)        |

## Armadilhas conhecidas

### BUILD0237 concluído localmente — 18/10/2026

O perfil `semantic-kernel-v2-resolution`/`linux-rootfd-workspace-v1` foi implementado e integrado por sete arquivos da fonte `84d8d4b4`. Revisão final zero obrigatórios,398 focais e16 gates/38 hashes atuais:5.211 unit/302 PG/12 E2E/zero skips,94,39% de linhas/90,21% de branches. Consumidor fresco207 imports/76 exports/oito pacotes/zero rede. [Resultado atual](../04_audit/evidence/HISO005-P2-BUILD-0237-20261018/REPORT.md). B6segueINCOMPLETE1609=537+1072/zero provas; ledger conserva também1721 ocorrências históricas sem resolução presumida. PG próprio removido/clientes0/portas livres. A certificação não foi transferida ao root misturado; a referência compilada de outra raiz física permaneceUNAVAILABLE. As contagensD8 abaixo são históricas.

#### Preparação dos outputs em candidata nova

Os testes legados0215/0216 leem outputs do harness e da plataforma antes do gate E2E. Em clone privado limpo, `npm run build` e a compilação isolada de shared não produzem todos esses arquivos. Com claim próprio, Node22 e `TMPDIR` exclusivo já configurados, preparar antes da certificação:

```sh
node scripts/build-runtime.mjs
node node_modules/typescript/bin/tsc -b packages/shared/tsconfig.json --force
```

O primeiro comando gera os outputs dos workspaces de runtime com os configs próprios da receita existente. O segundo mantém também os outputs de shared/contracts exigidos pela referência compilada. Não usar `tsc -b` da solução raiz nem alterar aliases/manifests para contornar ausência de emit. Conferir fonte limpa e inputs necessários antes do gate.

A tentativa 1 do BUILD0237 registrou92ENOENT por falta desses outputs; foi interrompida e preservada. A preparação corrigida reproduziu93 controles PASS e a suíte completa seguinte passou em5.211 testes/zero skips. [Evidência da preparação](../04_audit/evidence/HISO005-P2-BUILD-0237-20261018/retry-preparation.json), [tentativa preservada](../04_audit/evidence/HISO005-P2-BUILD-0237-20261018/qualification-attempt1-preservation.json). Esses registros são históricos; não instruem reiniciar seus processos.

Para comparar a fronteira completa comD8, também foram gerados21 outputs públicos do SDK com hashes coincidentes comD8/consumidor, sem aliases de fonte. [Receita e comando](../04_audit/evidence/HISO005-P2-BUILD-0237-20261018/sdk-physical-parity-command.json), [paridade](../04_audit/evidence/HISO005-P2-BUILD-0237-20261018/sdk-physical-parity.json). Emissão e declarações não concedem prova semântica; repetir a medição depois de equalizar os inputs físicos.

### Histórico D8 — HISO-005 — 18/10/2026

O P1 de precedência nativa foi corrigido e integrado por dois paths da fonte
`d8e3f8f2d346d4f8d3ddd162384ebbb79a322137`, após reviewindependente0obrigatórios,
173focais/16gatesPASS e verificador corrente38hashes.5.015unit/302PG/12E2E/zero skips;
cobertura94.38linhas/90.19branches. [Resultado corrente](../04_audit/evidence/HISO005-0236-BUILTIN-REPAIR-20261018/REPORT.md).
A promoção preservou78paths e índice; três pré-imagens privadas do peer foram
reancoradas à sua promoção qualificada, sem alterar seus arquivos ou transferir
certificação ao root. Os relatos75df/7ad6 e seus resultados abaixo são históricos.

Sem `--semantic`, permanece o contrato0228/0234, incluindo recusa de exceções.
O opt-in exige o par instalado descrito abaixo. Referência compilada opcional:
`--compiled-build-reference=<reference.json>` e
`--compiled-build-reference-sha256=<digest-revisado>`, somente com semântica.
Referência incompleta é erro estrutural; ausente, mutada ou de outra raiz física
conserva UNKNOWN/UNAVAILABLE. Não existe flag para aceitar UNKNOWN. O operador
revê receita/execução/digest; campo interno não se aprova. Nativos exatos do Node
pinado são recusados antes de pacote/selfreference, sem resumo positivo.

A candidata qualificada retorna INCOMPLETE/exit1 em normal/strict:
2.258diagnósticos=537baseline+1.721novos,303MATCH/zeroverified/zeroresolvidos.
Tuplas, hashes físicos e baseline foram reconciliados; essa contagem não encerraB6.
Rootmisturado observado depois da cópia:default528/INCOMPLETE e semantic2269 com
compiledUNAVAILABLE ao receber receipt de outra raiz física. A certificação da
candidata não se transfere ao root. Para prova compilada nele, preparar fonte
congelada/variante física própria, em vez de reutilizar receipt de outro caminho.
[SPEC0236 congelada](../02_spec/0236_b6_semantic_boundary_proof.md),
[medição corrente](../04_audit/evidence/HISO005-0236-BUILTIN-REPAIR-20261018/real-postcert-state.json).

### Procedimento e histórico

1. **E2E em clone limpo.** `npm run build` só faz typecheck e `build:web`; não produz
   `packages/*/dist`. O dev server do Vite usado pelo Playwright resolve `@cvg/shared`
   pelo `exports` do pacote, que aponta para `dist`. Rode `npm run test:e2e:prepare`.
   Não use `tsc -b tsconfig.json` na raiz: ele emite `.js/.d.ts` soltos em `examples/`
   e `legacy/` e reprova o gate `format`.
2. **`pg_isready` mente uma vez.** A imagem oficial do PostgreSQL responde ao
   `pg_isready` durante o init e depois reinicia o servidor. Espere uma consulta real.
3. **Variáveis das fases.** Fases 2/3/4A e a prova rem21-010 não pulam quando falta o
   banco: falham fechado com mensagem explícita. Isso é intencional (AUD20 skip
   governance).
4. **`boundary:products` — SPEC0228, candidata e checkout principal.** Execute
   separadamente dos outros gates. Na candidata local `f11f762f`, metadados de
   pacotes instalados não provam conteúdo: `UNVERIFIED_INSTALLED_CONTENT` ou
   `INSTALLED_VERSION_MISMATCH` preservam a recusa e o drift. A tabela histórica
   não suprime diagnósticos; normal e `--strict` têm a mesma recusa. A execução
   verificada após os builds terminou em **INCOMPLETE/exit1**, normal12,04s e
   strict10,79s,303instalados/471diagnósticos/zeroexceções. Referências conhecidas
   a produto continuam FAIL; só ausência de violações e incertezas permite PASS.
   [Resultados completos](../04_audit/evidence/B6-0228-BUILD-20261017/boundary-final-receipts.json).

   A atualização deste runbook **não integra o código da candidata ao checkout
   principal**. Enquanto isso, o checker do principal conserva regras legadas;
   eventual PASS não recebe o aceite B6 nem a certificação da candidata. Para
   reproduzir a contenção já verificada nesta estação, com Node22 e a candidata
   preservada, confira o commit exato e execute nela:

   ```sh
   candidate_dir=/home/ricardo/cvg-candidates/b6-0228-20261017
   test "$(git -C "$candidate_dir" rev-parse HEAD)" = f11f762f6a176417a40d2d53bdb67c633d7e1cef
   npm --prefix "$candidate_dir" run boundary:products
   npm --prefix "$candidate_dir" run boundary:products -- --strict
   ```

   Cada execução retorna1 por INCOMPLETE; não encadear os comandos com `&&`
   esperando verde. Os tempos são observações locais, não SLA. Instalação,
   emits e variantes podem mudar o inventário e exigem nova evidência. Não
   reativar exceções ou reinterpretar INCOMPLETE para conceder isolamento.

   Opt-in0234 está implementado na candidata local `b7032f82`, ainda sem
   integração ao principal. [Estado e evidência próprios](../04_audit/evidence/HISO005-0234-BUILD-20261017/REPORT.md).
   A receita real encontrou302MATCH/1MISMATCH entre303instalados da closure;
   o mismatch de esbuild é preservado e todos continuam verifiedfalse. Para
   construir uma nova referência independente, usar
   `node scripts/build-installed-reference.mjs` e flags explícitas no formato
   `--source-root=<caminho>`, `--commit=<sha-completo>`,
   `--output-root=<novo-diretório>` e `--cache-source=<diretório-com-_cacache>`.
   O diretório de saída deve ser novo; cache original é readonly. Usar somente
   Node22.23.2/npm10.9.8 pinados. A receita sanitiza configurações, desativa scripts
   e update notifier, observa processos/rede e recusa instalação parcial.
   Não consumir um recibo antes de revisar logs, origem, inventário e digest.

   Depois da revisão, o checker recebe sempre o par
   `--installed-reference=<reference.json>` e
   `--installed-reference-sha256=<sha256-revisado>`. Opção incompleta, digest
   inválido ou arquivo não regular falha estruturalmente (exit2). A identidade
   aparece por pacote no grafo (`--graph=<arquivo>`) ou em
   `installedContentIdentity` quando não há grafo. MATCH/MISMATCH/UNAVAILABLE/
   UNSUPPORTED conservam `verified:false`, motivos semânticos e drift originais.
   MATCH não concede PASS/B6; normal e strict continuam equivalentes.
   Arquivos extras, ocultos, gerados, links, races e limites são evidenciados;
   não há exclusão permissiva nem fallback online. Recibo/digest fixam bytes,
   não autenticam um operador malicioso. Fontes e ferramentas são revalidadas.

   Para reproduzir a observação atual, somente enquanto o snapshot revisado
   estiver preservado e seus bytes continuarem válidos:

   ```sh
   candidate_dir=/home/ricardo/cvg-candidates/hiso005-0234-20261017
   test "$(git -C "$candidate_dir" rev-parse HEAD)" = b7032f8245fbfbec5570c585518172de9ab7f075
   node "$candidate_dir/scripts/check-product-boundary.mjs" "$candidate_dir" \
     --installed-reference=/tmp/cvg-hiso005-0234-20261017/reference-r3/reference.json \
     --installed-reference-sha256=cd897a3831dbe0713eeb2e251f327dfb55d203149f4c739c76c437b27df43cdf
   ```

   O retorno observado é1 por INCOMPLETE; não promover302MATCH a aceiteB6.
   Snapshot ausente, mutado ou reconstruído exige nova receita/revisão e digest,
   mantendo ambos argumentos pareados. O hash acima não aprova outro recibo.
   O runbook do checkpoint é anterior a esta instrução de reprodução e não é
   alterado para manter a certificação da candidata no mesmo input congelado.

5. **Gates concorrentes no mesmo worktree.** `certify` reescreve
   `certification/*-report.json`; um `skip:governance` disparado ao mesmo tempo falha
   com `skip_report_missing_input`. Rode um de cada vez por worktree.
6. **Arquivos auxiliares.** Qualquer script ou config temporário dentro do worktree
   entra no `format:check`. Guarde auxiliares fora da árvore.

## Fluxo de publicação com o `main` protegido

Desde 07/10/2026 o `main` exige os checks `REM21 CI bar (Node 22)`, `codeql`,
`secret-scan` e `supply-chain` verdes **no SHA enviado**, sem force-push, sem exclusão
e com histórico linear; administradores não estão isentos. Um push direto de um commit
sem checks é recusado. Fluxo:

```sh
git push origin HEAD:refs/heads/candidate/<task>
gh pr create --draft --base main --head candidate/<task>   # Verify e Security só rodam em PR
gh pr checks <número> --watch                       # espere os quatro checks verdes
git push origin HEAD:main                           # mesmo SHA, fast-forward
git push origin --delete candidate/<task>           # fecha o PR draft
```

Os workflows `verify.yml` e `security.yml` disparam em `pull_request` e em push para
`main`; um push só para `candidate/<task>` não roda nenhum check (constatado em 18/10/2026
no PR #3).

Push continua exigindo autorização do usuário, conforme
[coordenação](agent_coordination.md).
