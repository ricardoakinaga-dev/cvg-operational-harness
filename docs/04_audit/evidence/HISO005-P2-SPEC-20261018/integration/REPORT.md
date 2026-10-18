# Preflight de integração HISO005/B6

**IMPLEMENTED — somente preflight; sem autoaprovação.** Root observado em `7ecc5b53944dcbc50fc26a95cfaec05bb1c62eb5`; candidata0234 em `b7032f8245fbfbec5570c585518172de9ab7f075`. Nenhuma fonte, candidata, catálogo central, ledger ou índice foi alterado; sem commit, instalação, teste/gate, rede/apps, PG ou descendentes. A autorização desta lane está no primeiro claim HISO005-P2 da coordenação; os registros centrais ficam com o Lead.

## Resultado concreto

São **10 paths de código/testes mais o runbook0803**: sete arquivos novos e três existentes. Os nove paths congelados em source-freeze-r2 conferem com o commit e o disco da candidata. A0228 tem cinco paths; a0234, nove; a união tem11. O runbook vigente fica preservado. As pré-imagens dos10 paths de código estão limpas no root; nove podem receber exatamente os bytes b703. O checker requer composição com os deltas já commitados no root. O patch completo foi preparado, reconstruído apenas em memória e não aplicado.

Root não está apenas com documentação suja: **19 arquivos Markdown, um catálogo e quatro testes rastreados modificados**, além das fontes novas Claude100 e evidências/planos novos. Os quatro testes são `tests/conformance/harness-runtimes.conformance.test.ts`, `tests/consumers-sdk-session.test.ts`, `tests/doc-source-moves.test.js` e `tests/replay/execute-fixture.ts`. São disjuntos do código HISO, pertencem à integração Claude100 e devem permanecer intactos. [Status inicial](root-status.initial.txt), [status final](root-status.final.txt).

## Caminhos e hashes exatos

SHA-256 de pré-imagem = bytes de trabalho do root; nos10 paths abaixo, iguais a HEAD e ao índice. ABSENT exige ausência física, incluindo ausência de symlink. Os hashes de5a/f11/b703, disco da candidata, índice e documento sujo estão completos no [inventário](integration-preflight.json).

| Path relativo | Fase | Promoção proposta | SHA-256 pré-imagem root | SHA-256 pós-imagem proposta |
| --- | --- | --- | --- | --- |
| `scripts/boundary-installed-identity.mjs` | 0234 | cópia exata b703 | `ABSENT` | `3d282e4f9a54ecd5668fdfb4d9d0e80c9f699b65b4495bfeaf368233b040d5cf` |
| `scripts/boundary-manifests.mjs` | 0228+0234 | cópia exata b703 | `1c9b9a668617750b5aa58de7980fcf662a70f4c0c4a4d3f7d05f4c5150a54b00` | `40cd1375d45e3059e797e0fc41795b71a07dbc529e257ef77572958dc40880e5` |
| `scripts/boundary-reference-process.mjs` | 0234 | cópia exata b703 | `ABSENT` | `e5c5cd31404ba865227ae747b0d8e8491138916951a6a1a5287f896837f22ab8` |
| `scripts/build-installed-reference.mjs` | 0234 | cópia exata b703 | `ABSENT` | `d2633c9d4710b9776430bf9063ae204180e44d8a71fd1f84a64939829f637075` |
| `scripts/check-product-boundary.mjs` | 0228+0234 | mescla3vias | `98829bbcf4aea0f4d162bf10796004a26633a0116f18019520f4b515f11e2c7a` | `a3893ca1c5f4e440532a40a0edf532e99b92e390de8796ecbe6745e9af4e0503` |
| `tests/b6-0228-boundary-containment.test.js` | 0228 | cópia exata b703 | `ABSENT` | `a0c5bce34d500072ca212923725c1ebe05caef44af07aa84c6ad3d82adbc5dae` |
| `tests/b6-0234-boundary-integration.test.js` | 0234 | cópia exata b703 | `ABSENT` | `fae928a8a0282519d444021c46c9ab7e3567d1255195cecd219b068200471c2b` |
| `tests/b6-0234-installed-identity.test.js` | 0234 | cópia exata b703 | `ABSENT` | `ce4feeafbdc2b36a392e34106dafd3b4aadfb2614ea6a4dd59db9ce58b24bddb` |
| `tests/b6-0234-reference-recipe.test.js` | 0234 | cópia exata b703 | `ABSENT` | `82aa69be8c2f45498d0353fced08d1cd0a2c431046f29458df9035ed143ca55d` |
| `tests/product-boundary.test.js` | 0228 | cópia exata b703 | `60709142a8a9cf72814cb543f684622790df25fcb9538e4ae93eca7c63175fe0` | `38132e99aeb79b7561906d4d4e4224cd5e1fa5fbdc0ea424a18d3093aa836655` |

O11º path, `docs/08_runtime/0803_runbook_gates_locais.md`, tem HEAD `361912f98e59a3b89ea459e05cad7490a6c1469b85d81326fb2794f446573809`, trabalho `efecabd78de76f7acf4f42a8a9d57fe58b6d030c423c2bea65433f7669935578` e candidata `787e651cef9b2c6ed48f8568933097de9ae6249963a2c311eea5e4cedc8564d2`. O trabalho já contém instruções0228/0234 e parágrafos posteriores ao checkpoint; substituir pelo documento da candidata perderia essas informações. Nenhum patch documental foi preparado. O Lead deve atualizar somente o estado presente do runbook depois da integração efetiva.

## Base anterior e composição do checker

A candidata descende de `f11f762f6a176417a40d2d53bdb67c633d7e1cef`, que descende de `5a199668eef5db4ca7aa2adc3853169ca0953cbf`. Root e candidata divergem; merge-base registrado: `c2bdb684336bfefdf9737fad93664300c827ed5c`. Não fazer merge integral da branch: isso alcançaria fontes/locks/ledgers/evidências de outras frentes e bases antigas.

Os helpers `scripts/boundary-code-execution.mjs`, `scripts/boundary-lexical.mjs`, `scripts/tsconfig-path-grammar.mjs` e `scripts/build-runtime.mjs` já estão presentes com bytes iguais à5a/candidata; não há promoção adicional desses paths. Preservar o runtime build já corrigido, incluindo sandbox. As dependências instaladas semver/TypeScript/Vitest e o toolchain pinado são requisitos do código, sem instalação nesta lane.

`package.json`, `package-lock.json` e `packages/platform/package.json` diferem da candidata: o root conserva dependências platform→harness/harness-contracts e scripts PARE. `scripts/ci-bar.mjs` conserva buffers16MiB ausentes na base antiga. Todos ficam intactos. A referência `cd897a3831dbe0713eeb2e251f327dfb55d203149f4c739c76c437b27df43cdf` pertence à resolução da candidata; não transfere identidade para os manifests/lock diferentes do root. Uma execução futura exige referência própria revisada nos termos da0234.

Copiar integralmente o checker b703 apagaria hardening de pins regulares/físicos, regras literais do exemplo/child SDK e estes seis grupos PARE exclusivos: `pare100-attested-parser-identity`, `pare100-contained-runner-compiled`, `pare100-sandbox-probe-compiled`, `pare100-sdk-owned-example-child`, `pare100-sdk-owned-test-child`, `pare100-session-json-compiled-reflection`. Há também atualização root do grupo canonical compilado. A composição `git merge-file -p --diff3 ROOT_HEAD CORE_FIX_5A CANDIDATE_B703` terminou **exit0/zero conflitos textuais** e manteve o catálogo root byteidêntico. Preservou `const exceptions = []`, `exceptionsApplied: false` e recusa de pedido legado; a única retirada por `diagnostics.splice` continua sendo a filtragem anterior por alcançabilidade, sem chamada para supressão por exceção. São observações textuais, sem execução semântica.

O resultado proposto do checker tem SHA-256 `a3893ca1c5f4e440532a40a0edf532e99b92e390de8796ecbe6745e9af4e0503`, diferente da fonte certificada b703. Exige revisão independente/gates próprios. [Composição](checker-three-way.review.txt), [preservação](checker-merge-preservation.json). Nenhuma equivalência de certificação foi inferida.

## Claims e colisões

- **Catálogo central:** writer ativo Claude100, coordenação linha112 no input congelado. Apenas ele integra ou libera a escrita; não assumir liberação por estar sem alteração recente. A lane preparou artefatos, sem tocar o destino.
- **Fonte root:** o claim HISO005-P2 vigente permite somente preparação, com fontes readonly. A reserva histórica PARE de checker está na linha1274, com promoções posteriores já commitadas; a integração futura precisa reconciliar o ownership e registrar claim dos10paths, sem reabrir exceções. Nenhum outro dirtywrite foi observado nesses10paths.
- **Runbook e ledgers:** trabalho documental do Lead/HISO e reconciliação DOCS-ISOLATION; são readonly para esta lane. Manter todo delta e conteúdo anterior. Os demais backlogs/catalogs/controller pertencem às frentes CODEX100/CLAUDE100/PARE100.
- **Temporários dos testes:** `tests/b6-0234-installed-identity.test.js:16` fixa `/tmp/cvg-hiso005-0234-20261017/comparer`; `tests/b6-0234-reference-recipe.test.js:23` fixa `/tmp/cvg-hiso005-0234-20261017/runner`. Criam filhos aleatórios próprios, mas usam pais retidos da rodada anterior. TMPDIR não os redireciona. Antes de executar, claim explícito de novos filhos disjuntos ou namespace isolado/adaptação de fixtures com novos hashes revisados; preservar fixtures/evidências anteriores. Nenhum teste foi executado.

## Delta central de artefatos vazios

Catálogo observado com **359linhas** (HEAD352), SHA-256 `8031b76574225b436bbe3c7ceee7e87ca279ca437c82b2b5f75f149258d2e15f`. As **23linhas**0234 estão **todas ausentes**, zero já incluídas e zero colisões de chave/metadata. Os23 arquivos existem e têm0byte; hash dos bytes vazios é `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. Cada decisão por path está no inventário JSON. A colisão é de ownership da escrita, não de dados duplicados.

A [proposta aditiva](central-catalog-additive-proposal.json) teria382linhas e preserva todas as359entradas existentes, ordem, campos, metadados globais e bytes anteriores até o fim do último registro. Nenhuma alteração de `generatedAt`, preenchimento de metadata null ou inferência de sucesso. SHA-256 proposto `212ac5fe0a2ec01c9be7637f917b31d39fd11f022b533f38f9570e6afc996954`. O [patch somente para revisão](central-catalog-additive.review-only.patch) depende exatamente da pré-imagem acima; qualquer append concorrente exige releitura/rebase aditivo, deduplicação porpath e preservação de todas as demais entradas. Não aplicar sob claim alheio.

## Artefatos de promoção e sequência segura

[Patch completo de fonte](forward-source-complete.review-only.patch):10paths, nove cópias exatas+checker mesclado, SHA-256 `4dfd4781dcb32e53df212a9d7bf5485cf7438cd519d8bcc85d00f28d638e270b`. [Subset exato](forward-source-safe-subset.patch):novepaths, incompleto e impróprio para execução isolada. [Reconstrução em memória](patch-byte-reconstruction.json):10/10pós-imagens exatas, nenhuma aplicação. Os patches não incluem lock/manifests, dist/cache/node_modules, certificação, documentos ou fontes Claude/PARE. Aplicação está fora da autoridade desta lane.

1. Close this readonly preflight as IMPLEMENTED; lead reviews artifacts and exact claim collisions. No selfapproval or source promotion. Gate: current scout lane only; satisfied by deliverables.

2. Before integration, register new explicit claim for exact10sourcepaths, runbook block if needed and own gates/outputs. Reconcile legacy root-checker/PARE ownership; central writer remains separate. Refresh rootHEAD/index/working preimages, candidateHEAD/freeze and absence of all seven new files; abort on any drift. Gate: claim and preimage equality; not granted/executed by scout.

3. Prepare isolated integration on current root base retaining its manifests/lock/PARE changes and disjoint Claude sources. Compose0228 before0234, or use full forward patch after confirming each postimage. Carry three-way checker exactly as reviewed; retain root runbook and all other sources. Never merge/revert whole candidate/base branch. Gate: proposed merged checker is new hash outside b703 certification; requires review, not blanket byteexact certification transfer.

4. Fresh independent review of forward delta and merged checker preservation/0228 refusal; inspect existing regression source assertions, normal/strict equivalence, invalidoptin exit2, known product FAIL and identity still verifiedfalse; no fallbackonline/no exception revival. Gate: future review and scoped controls in owned candidate; NOT_RUN here.

5. In explicitly claimed isolated integration, Node22 typecheck/lint/npmtest + PG/E2E; compiled consumers and new resolution-specific reference only via existing approved recipe, private cache/resources. Use full required certification plus verify evidence hashes at candidate close under exclusive claim. Preserve exit1/INCOMPLETE as expected uncertainty, mismatch not suppressed. Resolve the two hardcoded fixture-parent ownership reservations before any focused/full unit execution; TMPDIR alone does not isolate them. Gate: future approved-scope gates, not run here; current reference cannot transfer across different lock/config.

6. Only after scoped review/gates, promote exact approved10sourcepostimages to root after revalidating preimages/owners and run scoped verification with ownoutputs; root concurrent docs/code retain bytes. Update runbook present-tense status and lead ledgers. Gate: new source promotion authority/claim required; no global rootcertification inferred.

7. Catalog independent of source promotion: Claude writer either appends23rows or explicitly releases catalog. Re-read latest baseline; dedupe bypath exact; conflictingmetadata requires owner decision; append only missingrows preserving all oldbytes/order/metadata. Gate: central ownership release/writer-owned append; prepared382-row proposal only valid for359-row sha8031b765....

8. Keep semantic P2 and receiver/loaders/compiled mirrors proof separate from mechanical P1 integration. New T3 semantic contract reviewed before BUILD; P3/newB6 after those proofs. Gate: no B6/production acceptance; lead maps semantics independently.

## Evidência e limite

[Preflight estruturado](integration-preflight.json), [coleta e comandos exatos](collection.json), [digest dos inputs](input-digest.json), [reconferência final](final-freshness.json) e [readback do índice](index-readback.json). Scripts de coleta/composição/verificação estão preservados como `.source.txt`; execução original somente em `/tmp/cvg-hiso005-p2-20261018/integration/`. O digest SHA-256 de todos os artefatos desta lane fica em `evidence-digest.json` e `SHA256SUMS.txt`, sem recursão de auto-hash.

Heads,11paths de trabalho root/candidata e catálogo central permaneceram iguais entre as capturas; os conteúdos do índice nos11paths também conferem. Nenhum drift dos24arquivos rastreados inicialmente sujos foi observado na janela final. Controles/documentos externos à lane podem evoluir depois desta captura. Não se afirma igualdade global do arquivo binário do índice, que não teve snapshot bruto inicial; não houve comando de escrita do índice.

**Resultado limitado: IMPLEMENTED para este preflight.** Não é aprovação de patch, certificação do root, prova semântica, B6 aceita ou release. P2/P3 seguem com o Lead. Encerrada a lane sem integração e sem retomar outra frente.
