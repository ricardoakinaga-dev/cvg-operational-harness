# Checkpoint — BUILD0240 — 18/10/2026

Checkpoint solicitado pelo usuário para reiniciar a sessão. **A aprovação0240 está resolvida e os473 controles focais v3 terminaram PASS.** Não pedir novamente nem iniciar outra frente. Fonte, cópias e evidências estão salvas em disco; a candidata tem alterações ainda sem commit.

## Onde retomar

- Repositório compartilhado: `/home/ricardo/Área de trabalho/cvg-operational-harness`.
- Candidata: `/mnt/ia/cvg-hiso005-build0240-20261018`, branch `candidate/hiso005-build0240-20261018`, HEAD/base `84d8d4b4ed053493533d7e9ad55e574a9e6f9047`.
- Runtime privado: `/mnt/ia/cvg-hiso005-build0240-runtime-20261018`.
- [Estado atual do BUILD](../../04_audit/evidence/HISO005-P2-BUILD-0240-20261018/state.json), [snapshot da retomada](../../04_audit/evidence/HISO005-P2-BUILD-0240-20261018/session-restart/checkpoint.json), [contrato e MS01–12](../../04_audit/evidence/HISO005-P2-BUILD-0240-20261018/task-contract.json), [plano0391](../../03_build/0391_hiso005_semantic_proof_execution.md).
- [Autoridade explícita](../../04_audit/evidence/HISO005-P2-BUILD-0240-20261018/authority-build0240.json): “Aprovo o BUILD local da SPEC0240”, para [SPEC0240](../../02_spec/0240_b6_node_metadata_resolution_scope.md) SHA `1c14d92852a6d33475a67b533aadfd22ce01e54b86252c404258d33ef0895161`.

Ler AGENTS, docs07,99,20,30 e a coordenação antes de alterar arquivos. Usar o controle CVG nativo e0391; `.agent` pertence a outra frente. O status blocked visto no serviço de goals é anterior à aprovação; não significa ausência de autoridade atual. A API de goals não oferece operação de resume, portanto não forjar conclusão nem pedir a mesma aprovação como substituto.

## Resultado confirmado

| Verificação         | Resultado e referência                                                                                                                                                        |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preflight           | Candidata84d8 preparada, dependências físicas/pins/lock conferidos;20 fontes da referência preservadas                                                                        |
| Baseline v2         | 398 testes em sete arquivos,398 PASS/zero falhas/zero skips; `baseline-v2-command.json`                                                                                       |
| Primeiros vermelhos | Seis positivos novos falharam na v2 pelos motivos de metadados esperados;67 demais casos foram excluídos pelo filtro, sem representar gate final; `first-red-v2-command.json` |
| Helper antigo na v3 | 124 PASS/zero falhas/zero skips; `legacy-helper-v3-attempt1-command.json`                                                                                                     |
| Suíte nova atual    | 75 PASS/zero falhas/zero skips; `new75-v3-attempt2-command.json`                                                                                                              |
| Suíte nova inicial  | 69/73 PASS, quatro falhas de configuração de fixture preservadas; ver diagnóstico abaixo                                                                                      |
| Lint                | PASS antes da última integração das fixtures do teste novo; repetir o lint focal antes do freeze                                                                              |
| Resolução real      | Vitest import/require agora seleciona os mesmos arquivos do Node; ReactDOM/OTel com browser continuam recusados. Observação pré-freeze, sem prova de corpo ou qualificação    |

Node obrigatório `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node`, SHA `3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327`; TypeScript6.0.3, parser SHA `569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39`. Não usar o Node24 padrão.

## Regressão concluída durante o checkpoint

O job legado terminou com **exit0,398 PASS,zero falhas e zero skips**, conferidos no receipt real e no report JSON. Os75 novos controles mais os398 de regressão somam **473 controles focais v3 verdes**; os124 controles do helper são subconjunto dos398, não uma soma adicional.

Nenhum job ou agente próprio está pendente. A sessão28585/PID3486863/startticks47306522/PGID3486863 e supervisor3486857 são identidades históricas, preservadas no JSON; o PID foi reaped e não deve ser tratado como vivo ou relançado. Receipts atuais: `legacy398-v3-attempt1-command.json` e `legacy398-v3-attempt1.vitest.json` na evidência do BUILD. A observação anterior de processo vivo foi preservada separadamente em `session-restart/checkpoint-before-regression-terminal.json`.

1. **HISO005-P2-BUILD-0240:LINT_CURRENT_COMPOSITION** — conferir os nove hashes atuais contra o snapshot e executar lint/formato focais em Node22. O lint registrado precede a última integração das fixtures; o comportamento completo75+398 já passou com a fonte atual. Não repetir a regressão já concluída sem mudança ou preocupação nova que justifique.
2. Com fonte estável e checks verdes, fazer commit somente dos nove paths próprios na candidata e criar freeze. Não commitar o root ou copiar trabalho alheio. O teste novo não rastreado está copiado integralmente no snapshot.
3. Abrir crítica fresca da implementação, máximoR1/R2/zero usadas. Depois seguir qualificação/consumidor/proveniência/medição e promoção condicionada descritas abaixo. Nenhuma dessas etapas adicionais foi iniciada depois do pedido de checkpoint.

## Alterações salvas e sua razão

São **nove arquivos alterados, ainda sem commit**, todos na candidata: helper/engine; teste novo; seis testes antigos com versões/pais de fixture ajustados. Lista, hashes e cópias integrais `.source.txt` ficam em `session-restart/source/**`. O patch dos oito paths já rastreados fica em `session-restart/tracked-source.patch.txt`; o teste novo também possui cópia integral. Isso é backup de retomada, não freeze aprovado de código. Não aplicar o patch sobre a candidata existente nem usar reset/restore/stash/clean.

Helper implementa elegibilidade de imports inativo, exports literal exato com pattern não selecionado e novo perfil `node22-linux-exact-metadata-v1`; revalidação recompõe traces, rejeitando alterações de branch/metadados. Engine usa a mesma elegibilidade no carregamento e kernel `semantic-kernel-v3-exact-metadata`. Checker recebe a versão dinamicamente e não precisou de alteração. Browser, padrões ativos, corpo opaco e proveniência dist permanecem impeditivos.

Cinco pais de fixtures foram movidos mecanicamente para este runtime para não escrever nos runtimes históricos. Dois testes têm apenas a versão literal migrada, além da relocação onde aplicável. Demais asserts antigos foram preservados.

O builder Hubble entregou73 casos e foi encerrado. Os quatro primeiros erros eram um conflito da fixture: ela registrava `products/*` e simultaneamente exigia zero leitura de qualquer arquivo de produto. A reprodução controlada em quatro combinações confirmou aquisição somente do `package.json` registrado, nunca do alvo JS/CJS, sempre VIOLATION/zero provas. A integração mantém zero aquisição nos casos de registry genérico e acrescenta dois casos registrados permitindo **somente o manifesto exato**, com código-alvo ausente dos inputs. [Diagnóstico](../../04_audit/evidence/HISO005-P2-BUILD-0240-20261018/test-fixture-correction.json) e raw permanecem preservados. Nenhuma alteração de kernel foi feita para contornar esses quatro erros. O manifesto original do builder vincula o teste73 histórico; sua cópia `test-builder-original.test.js.source.txt` preserva esse hash, e a versão atual tem75 casos.

## O que ainda falta

- Conferir os resultados terminais398v3 e fonte estável; repetir lint/formato focal da composição atual.
- Commit seletivo apenas dos próprios nove paths, freeze e crítico fresco da implementação. **Zero rodadas de revisão de código usadas**, máximoR1/R2; nenhum crítico ativo. Não reutilizar a revisão documental nem os críticos0237.
- Após revisão sem obrigatórios: preparação de runtime/build, nova referência compilada da mesma fonte/raiz, consumidor fresco,16 gates Node22 e verificador corrente38 hashes. PG e portas ainda não foram criados; reservas futuras56240/API3426/web4426 exigem nova checagem de disponibilidade/identidade.
- Medição B6 integral normal/strict, paridade de SDK/default/P1, conservação de origens/multiplicidade/negativos. Não creditar mudança de contagem como prova. Depois, promoção somente dos deltas próprios por pré-imagens atuais, cleanup por identidade e T1/selo finais.

MS01–12 integrais ainda não foram aceitos. B6 continua INCOMPLETE;1609/zero provas é a última baseline qualificada0237, **não** uma medição atual da v3. Nenhuma promoção para o root, produção, push ou deploy ocorreu.

## Preservação

Root compartilhado continua em `archive/local-audit-records-20261011`, HEAD `7ecc5b53944dcbc50fc26a95cfaec05bb1c62eb5`; índice e20 preimagens conferidos intactos. Preservar trabalho do outro agente.137 artefatos selados do recon0240 e590 do0237 foram reconferidos no checkpoint; não editar nenhum dos dois pacotes, revisões antigas ou candidatas anteriores. Claim da candidata privada permanece vigente para retomada; recursos de outros agentes não pertencem a esta task.

Para a próxima sessão: **“Leia este checkpoint e retome o BUILD0240 já aprovado, começando pela conferência dos473 controles já concluídos, dos hashes e do lint/formato focal; não repita a aprovação nem relance a regressão já concluída.”**
