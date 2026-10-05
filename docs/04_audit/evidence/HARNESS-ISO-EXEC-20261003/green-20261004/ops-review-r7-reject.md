> Cópia de leitura: links internos apontam para o archive versionado. O relatório original byte-exato e os hashes estão no archive e manifesto. Veredito e texto técnico preservados.

**OPS_FRESH_REVIEW_R7 — REJECT, escopado ao produto operacional local sintético.**

Há um defeito reproduzido de integridade de recibos duráveis. As 503 regressões existentes passaram (24 arquivos, zero falhas e zero skips), a recompilação pública passou e sete dos oito probes próprios principais passaram. Esse resultado não concede aceite FullMain, PostgreSQL, CI, segurança, piloto ou produção.

**OPS_R7_F01 — P1: evidência bruta contraditória promove entrega verificada.**

Em `source/products/shift-assistant/src/vertical-state.ts:230–242`, o reducer verifica o SHA-256 de `raw` e a identidade derivada dos campos projetados separadamente. Ele não verifica que o callback bruto contém a mesma tupla. A rotina de promoção usa esses campos projetados para vincular a entrega.

Reprodução: o processo oficial recompilado recebe `ajuda` pelo webhook HTTP e envia uma vez a um WAHA fictício em loopback. Depois de parar o processo, a API exportada `ShiftStore.commit` recebe `delivery_receipt_recorded` com conta/ID projetados iguais ao envio aceito, mas `raw` com outra conta e outro ID e o SHA-256 correto desse raw. Acrescentar `delivery_receipt_committed` promove `outbox.delivery.commitVerified=true`. Fechar e reabrir mantém essa entrega, com storage saudável e efeitos habilitados. Nenhum evento anterior foi reescrito.

A matriz isolou conta, ID da mensagem, destinatário e provider; também usou raw não JSON. **As cinco variantes inconsistentes foram aceitas e permaneceram verificadas no replay.** O controle positivo com raw correto passou. A primeira reprodução e a confirmação independente obtiveram o mesmo resultado.

Alcance: entrada local confiada na API de commit/replay, como adaptação ou migração de recibos. A rota HTTP autenticada constrói raw consistente e rejeitou cinco negativos de conta/ID/provider/destinatário/auth sem alterar o journal. Não foi demonstrado acesso remoto indevido. O defeito compromete a consistência entre documento preservado e entrega apresentada como comprovada.

Evidências: [tupla bruta/projeção](ops-review-r7-reject-evidence.tar.gz) (arquivo interno `raw-tuple-confirmation.json`), [matriz com controle positivo e cinco negativos](ops-review-r7-reject-evidence.tar.gz) (arquivo interno `raw-receipt-matrix.json`), [probe e asserção](ops-review-r7-reject-evidence.tar.gz) (arquivo interno `main-confirmation.mjs`), [resultado principal](ops-review-r7-reject-evidence.tar.gz) (arquivo interno `main-confirmation.json`). Recomenda-se validar o schema bruto do recibo sintético e comparar exatamente provider, accountRef, providerMessageId, recipient, deliveryStatus e simulation antes da admissão/promoção e durante replay. Preservar recibos legados sem prova como documentos não verificados; não fabricar evidência retrospectiva.

As provas executadas foram:

| Probe próprio | Resultado |
| --- | --- |
| R7-HTTP-RECEIPT-CROSSBIND-RESTART | PASS |
| R7-ACCEPT-DISCONNECT-NO-SECOND-SEND | PASS |
| R7-EARLY-CALLBACK-CRASH-LOCK-HOLD | PASS |
| R7-BACKUP-COMPLETE-INVENTORY-NEGATIVES | PASS |
| R7-ORGANIZER-PAUSE-SHUTDOWN-RESTART-LATE-RESULT | PASS |
| R7-DURABLE-RAW-RECEIPT-TUPLE-INTEGRITY | FAIL |
| R7-PENDING-LIMIT-TTL-DEDUP-ATOMIC-PROMOTION | PASS |
| R7-CLINICAL-UNKNOWN-TENANT-VERSION-HASH-POLICY | PASS |

O processo oficial comprovou callback exato/dedup após restart e troca de sessão, desconexão após receber POST sem segundo envio da outbox incerta e continuidade de uma nova entrada. SIGKILL com callback antecipado preservou lock e journal; startup e backup recusaram o lock residual. Uma cópia reconciliada sob hold recuperou dispatch como uncertain, sem associar o recibo antecipado e sem reenviar.

Backup adquiriu o lock exclusivo e recusou escritor ativo. O inventário incluiu bytes de recovery e mídia órfã; restore válido conservou todos os documentos e a projeção sob hold. Os negativos missing, extra, corrupted, forged-sequence, missing-hash e unsafe-path foram recusados antes de criar destino. Restart do restore respondeu readiness 503, e o comando gerencial não liberou hold nem produziu novo envio. Os testes originais também exercitaram symlinks, inventários duplicados, permissões e reconstrução mais ampla de notas/tarefas/recibos.

A organização usou apenas uma fixture estática local, sem modelo/provider. Pausa via HTTP abortou trabalho ativo em menos de 1 s, devolveu o orçamento persistente de tentativa e conservou o checkpoint. Shutdown conservou o trabalho; restart produziu uma nota única. Respostas antigas resolvidas depois de pausa ou restart não foram aplicadas.

O probe complementar preencheu 1.000 recibos pendentes pela rota HTTP: overflow foi recusado sem delta, vínculo conhecido ainda foi aceito, dedup não gerou commits. Reabrir manteve capacidade/histórico. Após 24 h + 1 ms, apenas pendentes expiraram e vínculos comprovados permaneceram. Batch com promoção seguida de evento inválido falhou sem delta durável ou em memória; promoção válida posterior permaneceu após reopen. CLINICAL foi policy_denied, unknown inválido falhou fechado, e tenant/versão/hash divergentes foram recusados com inputs válidos; provider teve zero chamadas e documentos de budget ficaram byte-exatos. Veja [resultados complementares](ops-review-r7-reject-evidence.tar.gz) (arquivo interno `supplemental.json`).

**Freeze, fronteiras e higiene.** A autoridade e o freeze foram os únicos inputs da primeira ferramenta; a segunda leu a constituição interna do packet. O SHA-256 do inventário permaneceu `ccb17b4a4a5a7426f58bdd8a66c314a8ce5d0fe9b3387f67b7638130b60a8d85`: 19.379 entradas, 19.331 arquivos e 48 links; nenhum overlay.

Os snapshots completos before/after cobriram conteúdo, dev/ino, modo, nlink, tamanho, mtime/ctime, targets de links e metadata de diretórios, incluindo dependências e dist. Houve **zero mudanças, extras ou divergências do freeze**. Atime foi excluído da comparação. Os 72 arquivos originais de regressão/fixtures permaneceram byte-exatos na cópia de execução. A cópia tinha zero inodes de arquivos compartilhados com source; todos os links resolviam internamente a output. O bundle do consumer e a cópia runtime têm SHA-256 `b36d561b748a80fad8cc596c6f71381f659e9399a5355eb057350775c8ef9e62`, inodes distintos, e o diretório runtime contém só o bundle. Veja [integridade e higiene](ops-review-r7-reject-evidence.tar.gz) (arquivo interno `integrity-hygiene.json`) e [isolamento físico](ops-review-r7-reject-evidence.tar.gz) (arquivo interno `copy-isolation.json`).

As 20 instâncias oficiais rastreadas das duas execuções principais encerraram. Todas as 34 portas rastreadas puderam ser reabertas; nenhum PID rastreado estava vivo e nenhum recurso ativo restou na checagem final. Os scripts principais registraram TCP wraps imediatamente depois do fechamento; o event loop drenou e os processos saíram. O complementar também terminou com zero recursos. Não houve inventário global de processos de outros agentes.

Leituras semânticas ficaram no packet: SPEC0179, contratos/docs/backlog do produto, fontes/config/scripts/testes do consumer e interfaces pertinentes de gateway/shared. Root AGENTS, coordenação, ledgers globais, skills e narrativas de críticos/Builder não foram consultados. Os bytes de todos os arquivos congelados foram tratados mecanicamente para hash/cópia, inclusive documentos proibidos para leitura semântica. A enumeração do inventário inicialmente produziu saída excessiva de paths/hashes; não expôs conteúdo desses documentos. Executável externo somente Node22 absoluto aprovado. Testes/build executaram exclusivamente na cópia física privada; cache/TMP/HOME privados e ambiente dos filhos limpo de credenciais. Não houve execução em source/node_modules. Nenhuma gravação fora de output.

**Tentativas e limites.** A primeira tentativa complementar usou um oracle incorreto: duplicate expirado podia retornar 200 accepted:false, sem delta, em vez de 400. Também usava classificação unknown inválida em todas as variantes do gateway, impedindo atribuir a recusa às guardas de tenant/versão/hash. Esses inputs/assertivas foram corrigidos somente nos probes próprios; a tentativa original está preservada em `attempt-1-supplemental.*` e não conta como defeito do produto. O helper complementar sobrescreveu o primeiro `probes.json`; stdout, volumes e primeira evidência permanecem, e a repetição integral tem resultado separado em `main-confirmation.json`. Nenhum fixture/teste/assertiva original foi modificado.

Hashes de backup são prova de integridade relativa ao inventário, sem autenticação contra reescrita integral por operador. Provas de processo/fsync não qualificam queda elétrica, storage físico, NFS ou multiwriter. A organização clínica de modelo e seu transporte integrado permanecem fora de autoridade; respostas estáticas não fecham esse gate. Nenhum provider/canal/dado/segredo real, rede externa, PG, Docker, subagente, certify, push ou deploy foi usado. Os três casos gatewaytuple fora do produto não foram somados às 503 regressões. A suíte original usa aliases Vitest na cópia privada; os probes independentes usam módulos recompilados pelos exports públicos e processo oficial isolado.

Próxima ação: corrigir OPS_R7_F01 numa lane autorizada do produto e repetir os negativos de append/replay, controles positivos e as 503 regressões. Esta revisão não modifica código do repositório e não autoriza produção.
