**APPROVE — mandatoryFindings: 0, somente mecanismo/fonte dentro do contrato.** Segunda e última rodada da recuperação `HISO005-0236-RECOVERY-LIFECYCLE-LINEAGE`, commit **75dfef50d0b5bc5a8063829ea4c63af8b4ab8b54**, SPEC SHA256 `cf07fd5dd87220cd3c41704a64d2bd294a8b972bfbf230e38fb6c3453fbffa49`. REC-R1-01 foi fechado por reprodução física. Este parecer não aprova fullcert, promoção, integração no principal, consumidor final, isolamento global, HISO005/B6 ou produção.

[review.json](review.json) registra critérios, limites e handoff. Os17hashes, HEAD, SPEC e árvore limpa conferiram antes/depois: [preflight](preflight.json), [postflight](postflight.json), [freeze do Lead](../../source-freeze-recovery-r2.json). O [diff completo julgado](reviewed-diff.patch) altera somente checker e seu teste CLI. Os outros15inputs, incluindo engine VM, parser/supervisor, helper compilado e seus testes, são byteidênticos à7ba. Os [snapshots17](source-snapshots/) preservam os bytes desta rodada.

**REC-R1-01 fechado: alias recusado não é adquirido pelo emissor.**

Reexecutei a fixture física exata da revisão anterior, em modo somente leitura, pelo CLI real com o par de referência/digest. O resultado permaneceu INCOMPLETE/exit1/verifiedfalse. As origens dos diagnósticos do manifesto alias agora têm file/hash nulos; `requestedFile` conserva somente o label lexical. Nenhuma origem recebe o digest do sentinel externo sintético. A segunda sonda, instrumentada somente no TCB verificador, observou dois lstats de symlink e **zero open/read/readFileSync do emissor** para esse alias. Não houve leitura de arquivo externo real, import ou execução de alvo.

Ver [CLI plain, argv/env/exit e stdout](probes/p01/raw.json), [origens resultantes](probes/p01/output.json), [observação de aquisição zero](probes/p02/output.json) e [observer próprio](probes/observer.mjs). O fixture original continua em `/tmp/cvg-hiso005-integration-20261018/recovery-review-r1/p12/alias-complement`, sem alteração. Esta reprodução satisfaz a recusa exigida pelo achado, além de demonstrar ausência da aquisição que antes ocorreu na linha145.

No código atual, `physicalFileKnown:false` interrompe antes da aquisição. Nas demais rotas, o emissor exige containment, lstat regular, caminho canônico e tamanho até16MiB; abre somente com O_RDONLY/O_NOFOLLOW/O_NONBLOCK. O fstat do FD precisa corresponder ao lstat, por dev/ino/size/ctime/mtime. A leitura aloca e solicita no máximo size+1, detecta crescimento e revalida FD/caminho depois; `finally` fecha o FD. Cache somente é usado quando o stat corrente corresponde ao snapshot. Falha mantém identidade física indisponível. Nenhum span AST é fabricado para uma origem sem bytes correspondentes; `requestedFile` não alimenta prova de implementação.

**16cenários focais, com medições corrigidas explicitamente.**

| ID | Resultado atual observado |
| --- | --- |
| p01 | CLI plain da fixture alias R1: INCOMPLETE, origens file/hash null, sem digest externo e sem verifiedtrue. |
| p02 | Mesmo alias: zero aquisição de bytes pelo emissor. |
| p03 | Arquivo regular: hash físico correto, flags133120 correspondentes a nofollow/nonblock e leitura limitada a size+1; FD fechado. |
| p04 | UTF8 inválido: frontier nonAST conserva hash dos bytes físicos, spansnull e recusa semântica. |
| p05 | Manifesto ausente: origem indisponível/null e nenhuma aquisição do manifesto. O label emitido é o nó instalado `node_modules/vendor`, pois o manifesto não existe. |
| p06 | Manifesto de16777329bytes: rejeição de origem antes de open, pelo cap16MiB. |
| p07 | Troca regular→symlink no open: O_NOFOLLOW/ELOOP, origem baseline recusada antes de ler. Uma aquisição posterior do arquivo regular restaurado é evento distinto. |
| p08 | Troca por outro inode regular no open: primeiro FD recusado antes do read, depois fechado. |
| p09 | Troca do path por alias após open: primeira aquisição recusada no fstat, antes de ler, com FD fechado. |
| p10 | Crescimento durante read: o byte extra é observado; a origem baseline é recusada e o FD fechado. |
| p11 | Escrita de mesmo tamanho durante read: alteração física detectada, origem baseline recusada, FD fechado. |
| p12 | Alteração antes de nova captura de diagnóstico sobre arquivo cacheado: o stat divergente impede reutilização do hash; nenhum segundo open. FAIL conhecido por tripwire de produto permanece FAIL. |
| p13 | EIO injetado no read do primeiro FD: origem baseline recusada e FD fechado. Uma leitura posterior válida de frontier não apaga essa recusa. |
| p14 | Módulo neutro PROVEN; SIGSTOP no worker próprio identificado por PID/starttime/argv resulta UNKNOWN/zero provas em1139ms sob deadline1100ms; profundidade1 e nenhum remanescente. Validação externa também usa um worker controlado e retorna válida no positivo. |
| p15 | Fixture anônima instalada de R1 mantém INCOMPLETE/verifiedfalse. IDs baseline/frontier idênticos aos anteriores e entre repetições; strict CLI produz o mesmo payload semântico. |
| p16 | Fixture física R1 p17computedproduct conserva FAIL/verifiedfalse/zero provas. |

São16IDs de cenários, sem cenário17 e sem terceira rodada de recuperação. [Resultados finais](scenario-results.json), [script de sondas](probes/probes.py), [recheck de medição](probes/recheck.py) e [manifesto de hashes raw](probe-manifest.json) tornam as observações inspecionáveis. Todos os processos próprios terminaram. As sondas de falha usam arquivos sintéticos próprios e injeções no processo verificador; não modificam os17arquivos congelados.

A primeira instrumentação tinha dois defeitos de medição: tratava números de FD reutilizados como uma única aquisição e registrava I/O do próprio injetor como se fosse do emissor. Além disso, o oracle inicial exigia que uma frontier posterior de arquivo já regular permanecesse indisponível, embora essa nova aquisição fosse legítima. O p05 procurava o label de um manifesto inexistente em vez do nó instalado real. Esses resultados iniciais não são falhas confirmadas do checker.

O observer foi corrigido para acompanhar gerações ativas de FD e excluir o I/O do injetor. Repeti somente p07–13 em fixtures novas sob `recheck/`; p05 foi reassessado pelos bytes originais, sem novo processo. [Primeiro script/summary preservados](probes/first-attempt/), [correções justificadas](probes/measurement-correction.json) e outputs iniciais permanecem intactos. A conclusão usa as novas medições válidas: **16cenários finaisPASS**, não uma alegação de que todas as primeiras assertions passaram. O novo p09 demonstra recusa antes da primeira leitura; a inferência anterior de leitura não foi mantida.

**Integração e composição dos controles.**

A inspeção completa17 feita na rodada anterior foi reconciliada com os hashes atuais; os dois arquivos alterados e todos os ramos de aquisição do novo diff foram reinspecionados. Não há mudança em K0–K7, parser VM, transferências de confiança, regra de fechamento instalado, recipe compilada, lock, runtime/produto, tabelas históricas ou156controles originais nesta rodada. A preservação e as diferenças preexistentes de API continuam discriminadas no [relatório R1](../review-r1/REPORT.md); o aceite atual não reclassifica aquele verdict REVISE nem o antigo ciclo FAILED_QUALITY_BAR.

Os dados brutos do Lead foram lidos/hashados e recontados em [lead-evidence-recount.json](lead-evidence-recount.json): alias-first-red1FAIL/20fora do filtro; após o reparo21/21CLI, zero skips. O full135 anterior contém100engine+15compiled+20CLI da fonte7ba, com os inputs engine/recipe inalterados. **Não houve execução única136testes atual.** A [composição explícita](../current-control-composition.json) registra isso; unit completa e gates continuam pendentes. Lint/formatoPASS são evidência declarada pelo Lead, sem rerun amplo pelo crítico.

SP12 é favorável no escopo observado de aquisição, limites, races e lifecycle; SP13 é favorável para null físico, identidade atual, nonAST, encoding, cache e preservação de IDs/partições; SP17 tem zero obrigatórios após esta revisão independente. Os positivos de integração e consumo de provas do conjunto21CLI foram inspecionados com seu resultado atual; as próprias sondas não fabricam um positivo a partir de MATCH. P15/R1 anônimo e P16/produto continuam recusados.

A medição2399=537+1862,303MATCH/zeroverified/zeroresolved recomposta em R1 é da fonte7ba. Não foi renomeada como medição integral75df nem como B6 aceita. Não executei nova partição real, fullcert, verificador38hashes ou consumidor final nesta rodada; pertencem ao Lead. A futura medição precisa identificar a fonte atual.

**Limites e encerramento da revisão.**

Node22.23.2 absoluto, SHA `3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327`; parser TypeScript6.0.3 SHA `569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39`. Ambiente mínimo explícito sem NODE_OPTIONS, TMP próprio criado antes das sondas. Só código verificador/checker/parserTCB foi executado; alvos foram apenas lidos. A observação de processos é amostrada via procfs, apoiada pela identidade inalterada do engine e inspeção da árvore sem parserfilho.

Os races exercitados não são prova exaustiva contra toda interleaving; FIFO real, redução artificial do limite de FDs do sistema e causas de frontier não nulas não foram exercitados nesta rodada. O controle de FD demonstrado é aquisição limitada, geração correta, flags, recusa de identidade/leitura e fechamento em sucesso/falha, não capacidade irrestrita sob EMFILE. Não há prova geral de soundness de JavaScript.

Não houve agentes descendentes, implementação, source/index/commit/lock/install/rede/PG/certify/E2E/SBOM/licenças/produção/dado real, nem edição de ledgers ou índices compartilhados. [Preservação pós-revisão](r1-preservation-post.json) confere os274arquivos de R1 contra o manifesto anterior. Links deste relatório são relativos. Ownership da revisão liberado ao Lead; orçamento de crítica da recuperação encerrado. Próximo passo do Lead: gates/medição integral/verificador corrente/consumidor final e pré-imagens antes de qualquer promoção. Nenhuma rodada adicional é iniciada automaticamente.
