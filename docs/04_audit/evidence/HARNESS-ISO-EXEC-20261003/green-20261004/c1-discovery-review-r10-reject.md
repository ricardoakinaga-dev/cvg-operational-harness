Os links locais abaixo apontam para o arquivo compactado. Os caminhos originais e bytes exatos estão no [manifesto](c1-discovery-review-r10-reject-artifact-manifest.json); o relatório bruto e seus links relativos estão preservados dentro dele.

**VALID · REJECT — C1_PHYSICAL_DISCOVERY_FRESH_REVIEW_R10**

Fresh independent checker/source review: global physical manifest discovery, supported workspace grammar, global npm/file/link references, core→product graph, unknown provenance/closure, lexical/CJS/TS/pattern/scalar helpers. No installed/global acceptance.

Os **442/442 casos estáticos supplied passaram** sem mudar asserts. A revisão nova contém **411 observações**, com **81 divergências** repetidas em variantes causais e **cinco achados**. PASS da suíte supplied não fecha a descoberta física nem a soundness lexical. Os 253 originais não foram executados; seu resultado pelo Lead não integra este parecer.

| Achado                                                                                  | Severidade  | Expected → observed            |
| --------------------------------------------------------------------------------------- | ----------- | ------------------------------ |
| F1: Manifestos físicos fora das raízes fixas não entram na validação global             | HIGH / P1   | bloqueio → PASS                |
| F2: Workspace com prefixo suportado pode esconder core → product e unknowns alcançáveis | HIGH / P1   | INCOMPLETE → PASS; FAIL → PASS |
| F3: Validação de referência file/link local perde o contexto na recursão                | MEDIUM / P2 | bloqueio → PASS                |
| F4: Fallback shorthand recebe identidade errada e perde labels nos dois consumidores    | HIGH / P1   | INCOMPLETE → PASS              |
| F5: Versão do alias npm é validada só por não estar vazia                               | MEDIUM / P2 | bloqueio → PASS                |

**F1 — Manifestos físicos fora das raízes fixas não entram na validação global**

physicalManifestPaths é preenchido apenas por files() nas raízes packages/apps/legacy/products. tools, examples, config e diretórios físicos omitidos não são enumerados; dist/build/coverage também são pulados. A comparação de cobertura usa esse inventário parcial e permite PASS com manifestos inválidos ou sem workspace.

- Repro `global-tools-unused-array`: expected `BLOCK`, observed `PASS`, CLI exit `0`. [Observação local](c1-discovery-review-r10-reject-raw-evidence.tar.gz), SHA-256 `5bc232b82de377a5655a39a2af9d7ae0fc868de5b9df957e18905cb914606c88`. Fixture: [raw/independent-fixtures/global-tools-unused-array](c1-discovery-review-r10-reject-raw-evidence.tar.gz).
- Repro `global-tools-unused-missing-local`: expected `BLOCK`, observed `PASS`, CLI exit `0`. [Observação local](c1-discovery-review-r10-reject-raw-evidence.tar.gz), SHA-256 `5bc232b82de377a5655a39a2af9d7ae0fc868de5b9df957e18905cb914606c88`. Fixture: [raw/independent-fixtures/global-tools-unused-missing-local](c1-discovery-review-r10-reject-raw-evidence.tar.gz).
- Repro `global-tools-unused-invalid-npm`: expected `BLOCK`, observed `PASS`, CLI exit `0`. [Observação local](c1-discovery-review-r10-reject-raw-evidence.tar.gz), SHA-256 `5bc232b82de377a5655a39a2af9d7ae0fc868de5b9df957e18905cb914606c88`. Fixture: [raw/independent-fixtures/global-tools-unused-invalid-npm](c1-discovery-review-r10-reject-raw-evidence.tar.gz).
- Repro `physical-packages-core-dist-unused`: expected `BLOCK`, observed `PASS`, CLI exit `None`. [Observação local](c1-discovery-review-r10-reject-raw-evidence.tar.gz), SHA-256 `53ed019c4667861a2788f99eec68697a4f45511a596fc2bf2e049e01385a5ed2`. Fixture: [raw/independent-fixtures/physical-packages-core-dist-unused](c1-discovery-review-r10-reject-raw-evidence.tar.gz).

Controles: `physical-packages-unused`, `physical-products-unused`, `physical-legacy-unused`, `physical-apps-unused`. [Resultados dos controles](c1-discovery-review-r10-reject-raw-evidence.tar.gz).

**F2 — Workspace com prefixo suportado pode esconder core → product e unknowns alcançáveis**

A gramática aceita qualquer prefixo literal relativo seguido de /\* e descobre tools/aux/package.json, mas sourceFiles continua restrito às quatro raízes. Os edges manifesto → fonte são construídos só para sourceFiles já descobertos. core → manifesto tools/aux termina sem visitar sua implementação; referência faltante, parse error, env de consumidor e import de produto podem resultar em PASS.

- Repro `declared-tools-source-to-product`: expected `FAIL`, observed `PASS`, CLI exit `0`. [Observação local](c1-discovery-review-r10-reject-raw-evidence.tar.gz), SHA-256 `5bc232b82de377a5655a39a2af9d7ae0fc868de5b9df957e18905cb914606c88`. Fixture: [raw/independent-fixtures/declared-tools-source-to-product](c1-discovery-review-r10-reject-raw-evidence.tar.gz).
- Repro `workspace-causal-outside-metadata-unknown`: expected `INCOMPLETE`, observed `PASS`, CLI exit `0`. [Observação local](c1-discovery-review-r10-reject-raw-evidence.tar.gz), SHA-256 `5bc232b82de377a5655a39a2af9d7ae0fc868de5b9df957e18905cb914606c88`. Fixture: [raw/discriminant-fixtures/workspace-causal-outside-metadata-unknown](c1-discovery-review-r10-reject-raw-evidence.tar.gz).
- Repro `declared-tools-parse-error`: expected `INCOMPLETE`, observed `PASS`, CLI exit `0`. [Observação local](c1-discovery-review-r10-reject-raw-evidence.tar.gz), SHA-256 `5bc232b82de377a5655a39a2af9d7ae0fc868de5b9df957e18905cb914606c88`. Fixture: [raw/independent-fixtures/declared-tools-parse-error](c1-discovery-review-r10-reject-raw-evidence.tar.gz).
- Repro `declared-tools-consumer-env`: expected `FAIL`, observed `PASS`, CLI exit `0`. [Observação local](c1-discovery-review-r10-reject-raw-evidence.tar.gz), SHA-256 `5bc232b82de377a5655a39a2af9d7ae0fc868de5b9df957e18905cb914606c88`. Fixture: [raw/independent-fixtures/declared-tools-consumer-env](c1-discovery-review-r10-reject-raw-evidence.tar.gz).

Controles: `workspace-causal-standard-metadata-unknown`, `workspace-causal-standard-metadata-product`, `workspace-causal-outside-import-unknown`, `workspace-causal-outside-import-product`. [Resultados dos controles](c1-discovery-review-r10-reject-raw-evidence.tar.gz).

**F3 — Validação de referência file/link local perde o contexto na recursão**

boundaryManifest(target/package.json) é chamado sem repositoryRoot. O target é físico e contido, mas suas próprias refs file/link não são verificadas. Quando o target está fora das quatro raízes e não é workspace declarado, root/consumer aceitam referências inválidas no segundo nível.

- Repro `nested-local-root-dependencies-file`: expected `BLOCK`, observed `PASS`, CLI exit `0`. [Observação local](c1-discovery-review-r10-reject-raw-evidence.tar.gz), SHA-256 `5bc232b82de377a5655a39a2af9d7ae0fc868de5b9df957e18905cb914606c88`. Fixture: [raw/independent-fixtures/nested-local-root-dependencies-file](c1-discovery-review-r10-reject-raw-evidence.tar.gz).
- Repro `nested-local-consumer-peerDependencies-link`: expected `BLOCK`, observed `PASS`, CLI exit `None`. [Observação local](c1-discovery-review-r10-reject-raw-evidence.tar.gz), SHA-256 `3f797f91e60bec959d1f958a69d1202b72510b59fadf132e1f9c1d9e350b55b5`. Fixture: [raw/independent-fixtures/nested-local-consumer-peerDependencies-link](c1-discovery-review-r10-reject-raw-evidence.tar.gz).

Controles: `local-causal-root-packages-file`, `local-causal-root-tools-file`, `local-causal-consumer-packages-link`, `local-causal-consumer-tools-link`. [Resultados dos controles](c1-discovery-review-r10-reject-raw-evidence.tar.gz).

**F4 — Fallback shorthand recebe identidade errada e perde labels nos dois consumidores**

identity() chama getShorthandAssignmentValueSymbol(parent) para qualquer Identifier cujo parent é ShorthandPropertyAssignment. Em ({token=Seed}={}), Seed é o objectAssignmentInitializer e deve usar seu próprio símbolo; recebe o símbolo de token. assignedValues seleciona corretamente o fallback, mas a propagação usa a identidade errada. O checker e auditDynamicCodeExecution perdem o label.

- Repro `module-shorthand-mts`: expected `INCOMPLETE`, observed `PASS`, CLI exit `0`. [Observação local](c1-discovery-review-r10-reject-raw-evidence.tar.gz), SHA-256 `5bc232b82de377a5655a39a2af9d7ae0fc868de5b9df957e18905cb914606c88`. Fixture: [raw/shorthand-fixtures/module-shorthand-mts](c1-discovery-review-r10-reject-raw-evidence.tar.gz).
- Repro `opaque-shorthand-mts`: expected `INCOMPLETE`, observed `PASS`, CLI exit `0`. [Observação local](c1-discovery-review-r10-reject-raw-evidence.tar.gz), SHA-256 `5bc232b82de377a5655a39a2af9d7ae0fc868de5b9df957e18905cb914606c88`. Fixture: [raw/shorthand-fixtures/opaque-shorthand-mts](c1-discovery-review-r10-reject-raw-evidence.tar.gz).

Controles: `module-renamed-mts`, `module-array-mts`, `module-direct-mts`, `opaque-renamed-mts`, `opaque-array-mts`, `opaque-direct-mts`, `neutral-shorthand-mts`. [Resultados dos controles](c1-discovery-review-r10-reject-raw-evidence.tar.gz).

**F5 — Versão do alias npm é validada só por não estar vazia**

O validator verifica targetName e sufixo não vazio, mas admite versões com protocolos locais/URL e espaços, por exemplo npm:neutral@file:missing e npm:neutral@bad tag. Essas formas não estabelecem uma referência registry npm verificável; a validade global fica indevidamente PASS.

- Repro `alias-version-root-16`: expected `BLOCK`, observed `PASS`, CLI exit `0`. [Observação local](c1-discovery-review-r10-reject-raw-evidence.tar.gz), SHA-256 `5bc232b82de377a5655a39a2af9d7ae0fc868de5b9df957e18905cb914606c88`. Fixture: [raw/discriminant-fixtures/alias-version-root-16](c1-discovery-review-r10-reject-raw-evidence.tar.gz).
- Repro `alias-version-root-20`: expected `BLOCK`, observed `PASS`, CLI exit `0`. [Observação local](c1-discovery-review-r10-reject-raw-evidence.tar.gz), SHA-256 `5bc232b82de377a5655a39a2af9d7ae0fc868de5b9df957e18905cb914606c88`. Fixture: [raw/discriminant-fixtures/alias-version-root-20](c1-discovery-review-r10-reject-raw-evidence.tar.gz).
- Repro `alias-version-consumer-21`: expected `BLOCK`, observed `PASS`, CLI exit `None`. [Observação local](c1-discovery-review-r10-reject-raw-evidence.tar.gz), SHA-256 `75e876ec6258f903d229eed72ce458a57d5c165e2e2bd082b7efb61d05bbdb4a`. Fixture: [raw/discriminant-fixtures/alias-version-consumer-21](c1-discovery-review-r10-reject-raw-evidence.tar.gz).
- Repro `alias-version-core-26`: expected `BLOCK`, observed `PASS`, CLI exit `None`. [Observação local](c1-discovery-review-r10-reject-raw-evidence.tar.gz), SHA-256 `1950196ec5b83c3c765da762e5c64c2eecf6fedfbee38dda39a83eb9e6fe1933`. Fixture: [raw/discriminant-fixtures/alias-version-core-26](c1-discovery-review-r10-reject-raw-evidence.tar.gz).

Controles: `global-ref-root-dependencies-npm`, `global-ref-consumer-dependencies-npm`, `global-ref-core-dependencies-npm`, `alias-version-root-18`. [Resultados dos controles](c1-discovery-review-r10-reject-raw-evidence.tar.gz).

Gramática revisada: `prefixo/*` literal relativo é o suporte implementado; prefixes arbitrários e aninhados foram testados, inclusive pai ausente. Glob recursivo, glob intermediário, classe, brace, extglob, exclusão, path exato, absoluto, dot/dotdot, backslash e componentes vazios foram recusados. A aceitação de prefixes adicionais é justamente o discriminante de F2. Shape de workspaces e paths, duplicidade, quatro campos de dependência, nomes/aliases/file/link, direção consumer → core e core → produto receberam positivos e negativos.

Os controles de closure preservam **INCOMPLETE** em unknowns alcançáveis de core, vendor, test e legacy; um consumidor alcançado produz **FAIL**. Há evidências de alvos types/runtime separados e diagnósticos com origem. Isso não desculpa F2 nem F4. Os helpers foram consumidos diretamente com labels simbólicos, identidades de leitura/escrita, catch, parâmetros/body, inicialização de função, static blocks, CJS, TS erased, padrões, branches e escalares. Nenhum fixture novo contém call/new/tagged-template; nenhum evaluator/process/vm/worker foi construído ou executado.

O censo físico cobre **369 manifestos e 3.332 entradas de dependência** (26 nas raízes de fonte, root, 341 vendor e um gerado). [Manifestos](c1-discovery-review-r10-reject-raw-evidence.tar.gz) · [Dependências globais](c1-discovery-review-r10-reject-raw-evidence.tar.gz). O censo não certifica a instalação; desconhecidos alcançáveis continuam bloqueantes. O auditor não foi invocado no repositório copiado inteiro porque a autorização permite apenas fixtures comprovadamente inertes.

**Validade e integridade.** Só os quatro inputs autorizados foram usados; não houve leitura/escrita Root, outros packets, pareceres prévios, Builder/história ou herança de julgamento. Hashing/cópia física não interpretaram documentação histórica. Node 22.23.2; runtime físico em `runtime`, sem hardlinks nem symlinks externos. Inventário before/after inclui hashes de arquivos, targets de symlinks, modos, uid/gid, tamanho, inode/device, nlink, mtime/ctime de arquivos e diretórios. Leituras não tratam atime como imutável. Os 21.352 entries de Source e os três arquivos de autoridade permanecem idênticos; freeze e frozen-inventory conferem. Os targets de symlinks foram suplementados a partir do frozen-inventory antes das comparações finais; a identidade SHA do snapshot coincide com a captura original.

As execuções usaram ambiente mínimo, namespace de rede vazio e strace de rede para todos os descendentes trusted. **network0: zero chamadas e zero tentativas IP**. Sem rede, PG, Docker, provider, env privado, dados reais ou subagentes. Workers ordinários do Vitest são infraestrutura autorizada. O hook apenas arquivou os fixtures supplied no cleanup; não mudou flags/asserts/bar.

[Reports nativos JSON](c1-discovery-review-r10-reject-raw-evidence.tar.gz) · [JUnit](c1-discovery-review-r10-reject-raw-evidence.tar.gz) · [stdout real](c1-discovery-review-r10-reject-raw-evidence.tar.gz) · [Probes](c1-discovery-review-r10-reject-raw-evidence.tar.gz) · [Helpers](c1-discovery-review-r10-reject-raw-evidence.tar.gz) · [Discriminantes](c1-discovery-review-r10-reject-raw-evidence.tar.gz) · [Shorthand](c1-discovery-review-r10-reject-raw-evidence.tar.gz) · [CLI/API parity](c1-discovery-review-r10-reject-raw-evidence.tar.gz).

[Integridade antes](c1-discovery-review-r10-reject-raw-evidence.tar.gz) · [Integridade depois](c1-discovery-review-r10-reject-raw-evidence.tar.gz) · [Resumo final](c1-discovery-review-r10-reject-raw-evidence.tar.gz) · [Cópia física](c1-discovery-review-r10-reject-raw-evidence.tar.gz) · [Inventário runtime final](c1-discovery-review-r10-reject-raw-evidence.tar.gz) · [network0](c1-discovery-review-r10-reject-raw-evidence.tar.gz).

**Arquivo finito:** [raw-artifacts.tar.gz](c1-discovery-review-r10-reject-raw-evidence.tar.gz), SHA-256 `28a753acf337a82eb61a653d4ea15b336aa6b9338a58043af5f2f9c2350207b7`. [Índice com links locais de todos os raw artifacts](c1-discovery-review-r10-reject-raw-evidence.tar.gz) · [Inventário SHA/bytes](c1-discovery-review-r10-reject-raw-evidence.tar.gz) · [Report estruturado](c1-discovery-review-r10-reject-raw-evidence.tar.gz). Os fixtures supplied removidos do TMPDIR foram preservados e remapeados em [supplied-path-map.json](c1-discovery-review-r10-reject-raw-evidence.tar.gz).

**REJECT no escopo independente.** Nenhum allowlist, exceção, installed/global approval ou release. Todos os rawpaths e SHA completos por repro estão no JSON e no índice; o runtime permanece em output/runtime para reprodução com Node aprovado.
