Os links locais abaixo apontam para o arquivo compactado. Os caminhos originais e bytes exatos estão no [manifesto](ci-native-pg-review-r8-reject-artifact-manifest.json); o relatório bruto e seus links relativos estão preservados dentro dele.

# CI_NATIVE_PG_FRESH_REVIEW_R8 — REJECT

Revisão independente local, restrita ao packet congelado. **R8-F01 (HIGH) impede ACCEPT:** cobertura crítica real de 94,999% passa como 95% após arredondamento. R8-F02 é uma lacuna MEDIUM de admission unitário com bloqueios posteriores preservados. Nenhuma correção foi feita.

Freeze: `e286bb09949b5bb5d8019a864105a6774bf86a290d3623d3c9816eb22b162b26`. SPEC 0180 aprovada: `7971771ca8e4a12be90e58536ea105c8399d844e28c47093b2a50575afff6dc2`. Node absoluto: `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node`. [Resultado estruturado](ci-native-pg-review-r8-reject-raw-evidence.tar.gz).

## Achados e reprodução

**R8-F01 — HIGH, bloqueante.** [coverage-gate.mjs](ci-native-pg-review-r8-reject-raw-evidence.tar.gz) compara o percentual arredondado de branches com 95. A reconstrução independente em [hiso-snapshot-types.mjs](ci-native-pg-review-r8-reject-raw-evidence.tar.gz) repete a decisão. Uma summary inerte contém todos os paths críticos aprovados, cada um com covered=94.999 e total=100.000; o total global soma os arquivos únicos. Razão real: **94,999%**. Produtor: **PASS**; snapshotSchema: **ACCEPT**; verifySnapshots: **ACCEPT**. Counters são integrais e a summary é internamente coerente. O controle abaixo de 94,995% é recusado. Isso demonstra admissão abaixo do limiar, sem V8 ou claim de execução remota. [Report nativo reproduzido](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [sondas](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [execução](ci-native-pg-review-r8-reject-raw-evidence.tar.gz).

**R8-F02 — MEDIUM, sem bypass final demonstrado.** [validateReport(unit)](ci-native-pg-review-r8-reject-raw-evidence.tar.gz) confere suites e counters nativos, mas não compara file/name/occurrence com a coleta. Duas ocorrências coletadas de mesmo nome viram uma assertion executada sem erro; substituir um título também é aceito. [runScope](ci-native-pg-review-r8-reject-raw-evidence.tar.gz) só compara a identidade depois de copiar snapshots, e então falha o gate. O verificador independente recusa ambas as sondas com requiredTestIds; esses controles continuam funcionando. [Admissão observada](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [recusas posteriores](ci-native-pg-review-r8-reject-raw-evidence.tar.gz). O Lead deve compartilhar a comparação exata antes do snapshot; esta revisão não altera a implementação.

Reprodução autorizada, a partir da raiz do packet:

`/home/ricardo/.nvm/versions/node/v22.23.2/bin/node output/run.cjs semantics ../semantics-probe.mjs`

As 30 sondas próprias usam JSON, constantes, AST e computeMetrics puro. Elas não contam como casos Vitest nem instanciam evaluator/agent/capacidades ofensivas. O código de reprodução está em [semantics-probe.mjs](ci-native-pg-review-r8-reject-raw-evidence.tar.gz).

## Execução nativa e controles

**345 testes reais passaram; 0 falhas, 0 pending/todo/skips; seis arquivos.** As 22 suites nativas incluem describes e não equivalem a 22 arquivos. [JSON Vitest](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [stdout](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [stderr](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [comando/ambiente](ci-native-pg-review-r8-reject-raw-evidence.tar.gz).

| Arquivo                                    | Executados | PASS | FAIL |
| ------------------------------------------ | ---------: | ---: | ---: |
| tests/coverage-gate.test.js                |          3 |    3 |    0 |
| tests/hiso-ci-scopes.test.js               |        199 |  199 |    0 |
| tests/hiso-effective-inputs-own.test.js    |         15 |   15 |    0 |
| tests/hiso-security.test.js                |          3 |    3 |    0 |
| tests/hiso-snapshot-membership-own.test.js |        113 |  113 |    0 |
| tests/hiso-variant.test.js                 |         12 |   12 |    0 |

O collector separado observou 345 casos/6 arquivos e **executou zero testes**. Membership e multiplicidade coincidem com o report real. [Contagens reconciliadas](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [coleta bruta](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [execução collection-only](ci-native-pg-review-r8-reject-raw-evidence.tar.gz).

- PG: 12 casos do produtor real via mock puro fornecido. A identidade ESM Client é provada antes de cada import do produtor. 160000/169999 passam; dez entradas inválidas não emitem recibo de sucesso. Nenhum Client real conectou; PG integração executado=0. Safe integer/range também existem no admission, verifier e importer; o importer foi inspecionado estaticamente, sem importar estado legado.
- PG/chaos: admission e snapshots recusam omissão, multiplicidade extra, identidade trocada e status inválido; positives completos aceitam. Unit tem a ressalva R8-F02. [Sondas próprias](ci-native-pg-review-r8-reject-raw-evidence.tar.gz) e testes fornecidos preservados.
- Eval: projeção pura das 48 constantes atuais, com 14 membros adversariais, aceita resultado perfeito e falha ordinária tolerável; recusa numerator fracionário, grupo contraditório, métrica omitida e threshold enfraquecido. Os testes fornecidos também passaram. Isso verifica semântica de receipts, não execução de evaluator ou suíte eval.
- Coverage: counters integrais, denominadores nativos, groups/files e tolerância de zero por arquivo apagado foram exercitados. O limiar crítico bruto falha R8-F01; nenhuma porcentagem de cobertura deste candidato foi medida nesta rodada.

## Public SDK, inputs e projeção física

**Build público real e smoke público: PASS.** Compilação forçada das closures de model-gateway/harness, exports reais sem aliases de fonte; 170 arquivos dist tiveram mtime reemitido e conteúdo idêntico ao frozen dist. SourceHash antes/depois: `bf3f7bf57411905cceb53f96df2c9a16a372a2829f6db0cd27d5a5388f34ab43`. O smoke externo contém somente packages públicos construídos, declarations resolvidas e fixture determinística; clinicalCalls=0, unknownCalls=0, normalizer/budget-denial comprovados. [Build](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [emissões](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [SourceHash](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [smoke](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [resolução runtime](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [declarações](ci-native-pg-review-r8-reject-raw-evidence.tar.gz).

Exclusões de build-info/emissões são derivadas do compiler/config efetivo, com testes fornecidos para leaf alterada e unknown helpers. Dez sondas inertes adicionais em nested dist/node_modules/.gauntlet/vendor/certification/docs permanecem vinculadas ao SourceHash. [Nested probes](ci-native-pg-review-r8-reject-raw-evidence.tar.gz).

Preservação validada: **371 originais byte-preservados + 43 paths novos = 414 paths aprovados; coverage 275+6=281** (253 executáveis/28 apagados); 34 gates legados selados mantidos no contrato. Projeção neutra física via prepareVariant: products ausente, sete configs exatas, 250 paths de coverage (222 executáveis/28 apagados). Nenhuma alteração da barra, schema ou suíte original. [Baseline/contrato](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [projeção física](ci-native-pg-review-r8-reject-raw-evidence.tar.gz).

**R8-I01 — INFO: 8.400 Main versus 8.402 no collector do packet.** Todos os **8.400 inputs reais Main** conferem exatamente por path/hash/size, sem omissão ou troca. O collector sobre a fonte imutável e a cópia física retorna 8.402, incluindo precisamente dois documentos congelados adicionais relativos ao manifesto Main: production-bootstrap-amendment.md e production-bootstrap-user-approval.json. Seus conteúdos foram apenas hash opaco. O inventário congelado tem 26.405 arquivos/links, pois inclui tooling/dist, outra definição. Hash Main=`4e492ceae7b5b459f50214a4f8004d998a0cbfade9c9256eac59b6f1829a4ae9`; hash packet=`bf3f7bf57411905cceb53f96df2c9a16a372a2829f6db0cd27d5a5388f34ab43`. Não removi extras nem forcei igualdade. Origem/meaning dos extras e identidade Main devem ser reconciliados pelo Lead, sem inferência histórica deste crítico. [Diferença exata e definições](ci-native-pg-review-r8-reject-raw-evidence.tar.gz).

## Integridade, conformidade e limites

**Fonte integral inalterada:** 29.341 entradas antes/depois = 26.357 arquivos + 48 links + 2.936 diretórios. Zero diferenças de conteúdo, membership de diretórios, inode/device/mode/nlink/uid/gid/size/mtime/ctime/birthtime, incluindo node_modules/vendor/dist. Hash dos dois snapshots integrais: `61885a0beaccea6832db876dc8ca054401614f680c3eaca471929f2d27e4950d`. Atime não foi comparado por ser efeito de leitura; hashing usa O_NOATIME. [Before](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [after](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [resultado](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [freeze/input proof](ci-native-pg-review-r8-reject-raw-evidence.tar.gz).

Execuções, caches, temporários, builds e probes ficaram sob output; cópia física, sem symlinks/hardlinks/links externos remanescentes. O guard de APIs de rede registrou **zero tentativas**, inclusive nos subprocessos Node do smoke; não houve DNS/conexão PG/provider/rede. Não foi coletado trace de syscalls do kernel. [Conformidade](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [cópia física](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [guard](ci-native-pg-review-r8-reject-raw-evidence.tar.gz).

Não consultei Root/outros candidatos, narrativas/ledgers/pareceres prévios para reasoning, skills, segredos/private.env ou subagentes. Machine fixtures autorizadas foram preservadas; testes fornecidos permanecem originais. Não rodei PG real, E2E, full suite, V8, Docker, remote CI ou certify. Importer tem cobertura estática nesta rodada; projeção neutra não prova integração runtime. Sem fixes/commit/push/release ou certificação.

Estado, log e backlog desta revisão estão locais em [runtime-state.json](ci-native-pg-review-r8-reject-raw-evidence.tar.gz), [execution-log.jsonl](ci-native-pg-review-r8-reject-raw-evidence.tar.gz) e [backlog.json](ci-native-pg-review-r8-reject-raw-evidence.tar.gz). Claim/integração/ledgers Root pertencem ao Lead. Próxima ação: tratar R8-F01, conferir parity de R8-F02 e reconciliar R8-I01 em lane autorizada; emitir revisão nova sobre novo freeze. [Índice hash das evidências](ci-native-pg-review-r8-reject-raw-evidence.tar.gz).
