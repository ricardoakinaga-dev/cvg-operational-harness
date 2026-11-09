# 0400 — U13/SRV-01: monitor externo privado do harness

Task `GBRAIN-LOOP-20261023-U13`,23/10/2026. Contribuição local da [U13](0399_backlog_producao_aud0624.md#u13), sob SRV-01 do0374. Fonte9a56a9c9. Esta SPEC curta define o componente de observação/entrega e seu ensaio sintético, não o aceite operacional no hospital.

## Recon, risco e escopo

O core já avalia heartbeat/fila e envia alertas pelo processo da API. Se a API ou o host caírem, esse detector também para. `/ready` já retorna `{success:true,data:{ready,checks},error:null,meta}`. O relay atual aceita apenas `worker_down`/`queue_stalled` e não retorna `{receiptId,payloadSha256}`. Um200 desse relay não deve ser contabilizado como recebimento do novo monitor.

O produto tem implementação própria que serve de referência conceitual; não será importada/copied como dependência do núcleo. O monitor novo executa num processo e máquina independentes e consulta só a URL configurada de readiness. Worker/fila continuam com os detectores existentes; a prova integrada dos dois caminhos e a parada física ficam na U16/U13 operacional.

Trilha local proposta **T2**, conforme SRV-01 e0399: ferramenta operacional privada e teste, sem mudar contrato público da aplicação, exports de pacote, schema/migration, política de papel/tenant ou secret mechanism existente. Nenhum novo listener/receiver de produção é criado nesta fatia. A revisão deve confirmar a classificação antes de BUILD; mudança em ingresso público/política fica fora e exige seu gateT3.

Os seguintes caminhos são novos, somente na candidata própria: `deploy/harness/external-monitor/{monitor,state,cli}.mjs`, README, unidade systemd de exemplo e `tests/deploy-harness-external-monitor.test.js`. Host alvo Linux com Node22 e `/usr/bin/flock`, coerente com o Ubuntu do0393; não se instala ferramenta nesta rodada. Dados de monitor locais, em diretório próprio; não reutilizar journal/volume do produto. Root compartilhado, relay antigo, API/worker, CI, lockfile e fontes dos pares permanecem readonly.

## Contrato privado

Configuração por ambiente: `HARNESS_MONITOR_READY_URL`, `HARNESS_MONITOR_RECEIVER_URL` (endpoint exato), `HARNESS_MONITOR_SECRET_FILE`, `HARNESS_MONITOR_STATE_DIR`, `HARNESS_MONITOR_INSTANCE_ID` e `HARNESS_MONITOR_CANDIDATE_DIGEST`. A URL deve usar HTTPS, sem userinfo/query/fragment; HTTP só para127.0.0.1/localhost/::1 com **ambos** `NODE_ENV=test` e `HARNESS_MONITOR_TEST_HTTP=1`. Redirect é recusado. O operador controla os destinos; qualificação de egress pertence ao destinoT4. Nunca derivar URL/credencial de corpo de health ou resposta de alerta.

Secret regular privado, sem symlink final, lido de arquivo limitado a4096bytes, mínimo32caracteres, sem conteúdo em argv/log. Reusar autenticação HMAC SHA-256 de `${timestamp}.${body}` com headers `x-cvg-alert-timestamp`/`x-cvg-alert-signature`; o receptor compatível ainda precisa ser qualificado. Ler secret uma vez no bootstrap; rotação pelo procedimento operacional existente.

Parâmetros propostos para o ensaio: `HARNESS_MONITOR_INTERVAL_MS` default10000, inteiro1000–300000; `HARNESS_MONITOR_TIMEOUT_MS` default2000, inteiro100–10000, nunca maior que o intervalo; `HARNESS_MONITOR_FAILURES` e `HARNESS_MONITOR_SUCCESSES` default2, inteiros2–10. Com ambos `NODE_ENV=test` e `HARNESS_MONITOR_TEST_HTTP=1`, os mínimos de intervalo/timeout podem ser10ms; os máximos e demais regras não mudam. Test flag fora de `NODE_ENV=test` é recusada, mesmo com HTTPS. Valores fora do intervalo, fracionários, não finitos ou vazios são configuração inválida. Instance ID segue `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`; digest `^sha256:[a-f0-9]{64}$`; receipt ID `^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`; IDs de episódio/evento são UUIDv4 e datas têm forma canônica ISO UTC com milissegundos. URLs limitadas a2048caracteres. São defaults propostos, não limiares de operação humana já aprovados. Um ciclo é serial: health→persistência→no máximo uma tentativa de entrega→espera, sem sobreposição. SIGTERM/SIGINT abortam operações e espera; o processo deve encerrar em até5000ms no filesystem local qualificado, com fail-safe de término próprio se o cleanup assíncrono não concluir; nenhum SIGKILL em processo de par.

Health é bom somente com HTTP200, JSON/envelope válido, `success:true`, `error:null`, `data.ready:true` e checks não vazios/consistentes sem failed. Corpo inválido/maior que16KiB, timeout, erroTLS/rede, status diferente e redirect contam como indisponibilidade. O conteúdo dos checks é descartado; não se copia texto/URL/status arbitrário para alerta.

Evento com chaves fechadas: `version:1`, `product:'operational-harness'`, `alertId` UUID, `candidateDigest` SHA256, `instanceOpaqueId` restrito, `reasonCode:'readiness_unavailable'`, `firstObservedAt`, `observedAt`, `state:'firing'|'resolved'`. Cada evento também tem `eventId` UUID distinto e `sequence:1|2` (firing1,resolved2). `alertId` identifica o episódio; deduplicação do receptor é por `eventId` com payloadHash igual, nunca só poralertId. Um episódio tem umalertId e dois eventos possíveis; uma falha isolada não cria episódio. Reinício mantém contador/episódio e eventos pendentes. Não criar lembretes/updates periódicos sem necessidade.

Entrega usa bytes exatos persistidos do evento; assinatura pode usar timestamp novo por tentativa. Aceite somente HTTP201 com JSON limitado a16KiB, `receiptId` não vazio/restrito e `payloadSha256` exatamente igual ao SHA256 dos bytes enviados.200 sem receipt, hash errado, resposta excessiva, redirect e timeout são falha, nunca prova de recebimento. O receiver usado pelo ensaio é uma fixture loopback, não uma implementação de produção.

São cinco tentativas por evento, com intervalos30s/2min/10min/30min após a primeira, conservados em disco. Antes de cada dispatch, incrementar/persistir tentativa e próxima data. Depois de um receipt válido, persistir remoção da pendência antes de registrar entrega concluída. Se a entrega externa puder ter ocorrido mas o receipt/commit local se perder, retry mantém bytes/alertId; o receptor deve deduplicar. **Não se promete exactly-once externo.** Ordem: enfileirar firing antes de resolved e escolher o primeiro pending elegível emFIFO; enquanto ele aguarda o prazo, não furar a fila com resolved ou evento posterior. Resolved não é elegível enquanto seu firing existir pendente ou failed. Se firing esgotar/ficar incerto, conservar o resolved como bloqueado e expor reconciliação necessária; não enviá-lo como se a queda tivesse sido entregue. Eventos failed/bloqueados não impedem novos episódios independentes de avançar. Receipt perdido ou falha de commit local repetem exatamente eventId/bytes/hash; receptor compatível deve devolver recibo do mesmoevento, sem novo encaminhamento. Isso é obrigação do receptor a provar depois, não dedup externo já demonstrado. Falha esgotada permanece explícita e não desaparece do status; outros eventos não ficam permanentemente bloqueados por ela. Limite64eventos retidos, corpo/estado com limites de tamanho; saturação gera falha operacional visível sem descarte silencioso.

## Persistência e recuperação

Estado privado v1: fingerprint de destinos/instância/limiares, contadores, episódio, fila e total de entregas. Destinos só por hash no estado. O digest do candidato fica em cada evento para preservar a identidade anterior ao upgrade. Fingerprint incompatível, estado inválido, permissões indevidas ou corrupção recusam startup sem zerar histórico. Troca de destino exige procedimento explícito de preservação/arquivo e nova instância; não existe migração de dados de negócio.

Gravar arquivo temporário exclusivo0600, write completo, fsync do arquivo, rename no diretório e fsync do diretório; parent privado0700. Arquivo final/lock não podem ser symlink, ter múltiplos hardlinks ou proprietário diferente. Estado limitado a1MiB, JSON de formato fechado e eventos/contador revalidados ao ler. Falha de persistência interrompe o ciclo antes do efeito quando ocorre no save pré-dispatch; não emitir sucesso após falha pós-receipt.

Um único escritor é imposto por `flock` Linux: abrir lock privado, passar o mesmo open-file-description comoFD3 ao executável literal `/usr/bin/flock` com argv literal `-n 3` e timeout de1s; manterFD no processoNode. Não há shell, comando arbitrário ou path de programa fornecido por usuário. A semântica real de retenção no pai e liberação apósSIGKILL deve ser provada antes de usar o mecanismo. Segundo escritor é recusado; o kernel libera o lock quando as referências fecham. Status é leitura do snapshot publicado e não escreve nem consulta rede. Disco/NFS: apenas disco local é qualificado nesta fatia.

## Decisão de arquitetura

- Manter só o detector daAPI foi rejeitado: não observa a própria queda.
- Reusar o produto por import foi rejeitado pela ADR010; não adicionar export público para um processo operacional privado.
- Um serviço de métricas/broker externo foi rejeitado por não ser necessário à observação de readiness/recibo.
- Selecionado processo Node builtin-only com estado local pequeno, fila limitada e receipt validado. Custo: bootstrap do runtime/lock no segundo host, estado próprio e monitorar o próprio monitor. Esse último ponto é risco operacional a registrar, sem inventar que este componente garante disponibilidade da segunda máquina.

## Aceites congelados

| ID   | Critério e prova que deve rejeitar um caso incorreto                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EM01 | Config/secret/path inválidos recusam antes de I/O; HTTPS default e HTTP sintético duplo opt-in; sem eco de secret/URL                                                                 |
| EM02 | Readiness real do contrato é aceito;200HTML, envelopefalse, readyfalse, checkfailed e corpoexcessivo são recusados                                                                    |
| EM03 | Duas falhas abrem um episódio; falha contínua não gera tempestade; duas boas resolvem com mesmoalertId/eventIds distintos; recuperação antes do retry não entrega resolved primeiro   |
| EM04 | Estado/filas gravados antes do dispatch; falha de save não envia; corrupção/fingerprint não são resetados                                                                             |
| EM05 | HTTP201/receipt/hash corretos confirmam;200genérico/redirect/hash errado não confirmam; HMAC confere os bytes exatos                                                                  |
| EM06 | Timeout/abort de probe e entrega são limitados; ciclos não sobrepõem; filhoCLI termina sobSIGTERM enquanto dependência está presa                                                     |
| EM07 | Cinco tentativas/agenda sobrevivem ao restart; firingfailed bloqueia seu resolved mas não novoepisódio; receipt perdido/commitfalho preservam eventId/hash; limite64 não perde evento |
| EM08 | Lock nativo recusa escritor concorrente e libera apósSIGKILL; nova instância recupera evento/episódio sem perder identidade                                                           |
| EM09 | Upgrade do candidato não reescreve bytes/digest do evento antigo; replay preserva payloadHash                                                                                         |
| EM10 | Logs/status usam códigos/contadores/IDs finitos, sem secret/URL/corpo de resposta ou texto de saúde                                                                                   |
| EM11 | Só builtins e arquivos próprios; nenhuma dependência/import do produto; unidade de exemplo privada sem token emargv/instalação automática                                             |
| EM12 | Ensaios por processo e HTTP loopback real, controles bons/ruins e resultados brutos; não afirmar host/Telegram/produção qualificados                                                  |

## Validação e término desta contribuição

Executar preflight de lock nativo, suíte focal com HTTP/filhos/arquivos sintéticos, lint/formato/typecheck da fonte atual e regressão do relay existente. Revisão fresca do contrato e, depois, do código congelado; Lead inspeciona as provas. Gates amplosT2/PG/E2E/certificação ficam explicitamente NOT_RUN até executados com claim próprio, sem receber PASS por suíte focal. A implementação local não encerra U13 nem SRV-01 sozinha.

Registro no GBrain ao fim de cada etapa, com resultado real e pendências: falta o receptor compatível/Telegram e a instalação na segunda máquina, os limiares acordados, ensaio de host/API/rede/worker no conjunto e dependênciasU10/U12/T4. Esses aceites permanecem parte da meta integral; não foram removidos para concluir a fatia local.

## Registro da rodada local

Contrato r3 recebeu APPROVE técnico independente (Boyle), sem achados obrigatórios, para T2 privado. A revisão do código r1 por Curie retornou REVISE/4P2; as reproduções e os bytes congelados foram preservados. Typecheck/lint globais, scanner8.28, PG338 e E2E12 passaram na primeira candidata; focalr2 teve48PASS/1FAIL de timeout no setup de saturação. Esses resultados não concedem aceite à candidata retrabalhada.

O único retrabalho agrupado corrige término com stdout bloqueado, admissão de FIFO, classificação de resolved esgotado, validação relacional de recuperação e setup da fixture. Requisitos normativos EM01–EM12 permanecem os mesmos. Estado e resultados finais devem ser consultados na [task e evidências desta contribuição](../04_audit/evidence/GBRAIN-LOOP-20261023/u13/task-contract.json) e no [handoff](../08_runtime/handoffs/gbrain_loop_20261023.md). Certificação global e parent U13 permanecem abertos até prova.
