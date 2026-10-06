# I9 — crítica independente da SPEC 0162

**Decisão: REVISE**  
**Artefato avaliado:** `docs/02_spec/0162_webhook_clock_highwater_marker.md`  
**SHA-256 verificado antes da leitura:** `433c46bb7fe0c66c1b2926ed8592cca023209b3374439af8de5d603b04fae40a`  
**Escopo desta revisão:** somente o conteúdo dessa SPEC. Nenhum relatório/revisão anterior, arquivo-fonte ou outro documento foi consultado. Nenhum teste, BUILD, SQL ou migration foi executado.  
**Autorização:** este parecer não autoriza BUILD.

## Resumo

O objetivo, os principais estados de serving e várias fronteiras de segurança estão descritos com cuidado: a reserva precede o comando; ACK depende de prova externa; falhas incertas mantêm gates fechados; a redução do marcador usa approvals separadas e função privilegiada restrita; e failover depende de fencing testemunhado. Ainda assim, a SPEC não está pronta para implementação: três requisitos normativos são incompatíveis ou deixam duas transições possíveis, com consequências diferentes para o high-water e para a abertura do serviço.

## Achados

### P1 — O limite `statement_timestamp()` não pode ser satisfeito pelo sample testemunhado anterior à escrita

**Referências:** § Estado durável, item 6 (linhas 33–34); § Avanço e decisão, itens 1 e 3 (linhas 44–46); § Verificação, itens 2 e 3 (linhas 86–87).

A linha 33 exige que o trigger recuse `NEW.highest_seen_at` abaixo de `statement_timestamp()`. A linha 44 manda adquirir o lock, medir PostgreSQL/chrony, persistir o high-water e a reserva em conjunto. A linha 29 exige registrar e testemunhar `SAMPLE` antes de qualquer escrita SQL. A ordem normativa da linha 86 também coloca a amostra e o append externo antes do COMMIT da reserva.

No caminho ordinário, o timestamp PostgreSQL do `UPDATE` é obtido quando a instrução começa, depois da coleta e do round-trip de append/receipt. Se o `UPDATE` grava o sample testemunhado, esse valor pode ser menor que `statement_timestamp()` e o trigger o rejeita. Se a implementação elevar o valor para `statement_timestamp()` ou para um `clock_timestamp()` do trigger, essa parcela mais recente não está no `SAMPLE` que a witness confirmou antes da escrita; portanto o estado SQL pode avançar além da prova externa que define o máximo durável. O texto não define um protocolo que satisfaça simultaneamente as duas condições.

**Exemplo concreto:** sample witnessado `12:00:00.100`; o append leva 20 ms; o `UPDATE` começa às `12:00:00.120`. Gravar `.100` falha no limite inferior do trigger. Gravar `.120` faz o marker conter um instante que não consta do `SAMPLE` testemunhado.

**Aceite sugerido:** especificar uma regra executável para o valor gravado e sua prova externa, incluindo como a amostra que satisfaz o limite do trigger é testemunhada antes do write sem uma corrida temporal impossível. Acrescentar um teste com barreira que atrase o append após capturar o sample, confirme o valor exato observado pelo trigger e prove que SQL, ledger e witness terminam com máximos compatíveis. O teste deve falhar se a solução simplesmente elevar o marker sem registrar essa observação.

### P1 — Bootstrap não define um único baseline quando a amostra fresca supera o `BOOTSTRAP`

**Referências:** § Atomicidade da migration e bootstrap (linha 21); § Estado durável, item 3 (linha 29); § Verificação, itens 1 e 4 (linhas 85 e 88).

A linha 21 define `BOOTSTRAP` como o registro cujo sample é `baseline_highwater`, diz que seu receipt estabelece o primeiro head e exige inserir a linha singleton exatamente com esse baseline. Já a linha 29 determina, antes do primeiro insert, reconciliar os ledgers, colher uma amostra PostgreSQL/chrony fresca e “gravar a maior máxima comprovada”. Não diz se essa coleta é o próprio `BOOTSTRAP`, um novo registro append-only, ou uma atualização do baseline/receipt. Se for posterior ao receipt, pode exceder o baseline que a linha 21 manda inserir; se for anterior, falta definir como a reconciliação e a coleta se ordenam em relação à validação do head e à inserção. São protocolos diferentes para bootstrap e retomada após crash.

**Exemplo concreto:** o receipt `BOOTSTRAP` ancora `12:00:00.100`; a coleta requerida pela linha 29, antes do insert, resulta em `12:00:00.140`. Inserir `.100` satisfaz “exatamente seu baseline”, mas não registra a maior coleta exigida. Inserir `.140` não corresponde ao baseline do receipt que estabeleceu o primeiro head.

**Aceite sugerido:** declarar um único protocolo de bootstrap, com tipos/ordem de append e valores exatos usados em cada etapa. Especificar como crash depois de cada append/receipt e antes/depois do insert retoma sem mudar o baseline nem aceitar um sample não ancorado. Testar os dois casos de corrida: coleta fresca menor e maior que o baseline já testemunhado; em ambos, readback, head witnessado e gate precisam concordar sobre o valor final.

### P1 — A fase `COMPLETE` é descrita como liberando readiness antes do anchor `RECOVERY_REBASE`

**Referências:** § Estado durável, item 7 (linha 34); § Recuperação break-glass, ordem normativa (linha 72); § Verificação, item 4 (linha 88).

A linha 34 ordena `COMPLETE_EXPORT`, depois append/testemunho de `RECOVERY_REBASE`, e só permite ao controller reabrir após validar esse receipt e o readback SQL no novo epoch/baseline. A linha 72 descreve o passo 7 como `COMPLETE_EXPORT` que “libera readiness”. A linha 88, por sua vez, exige que readiness só abra após receipt `COMMITTED` e `RECOVERY_REBASE` verificados/testemunhados e readback SQL. Assim, não está definido se `COMPLETE_EXPORT` é apenas uma fase interna necessária para permitir o append de rebase, ou se já pode tornar readiness elegível/aberta. A diferença importa precisamente em crash entre esses passos.

**Exemplo concreto:** SQL já está no epoch novo, `COMPLETE_EXPORT` foi confirmado, mas o append de `RECOVERY_REBASE` falha ou seu ACK é incerto. Pela linha 72 readiness foi liberada; pelas linhas 34 e 88, o controller ainda não pode reabrir. O estado permitido e a ação no retry não ficam determinados pela ordem normativa.

**Aceite sugerido:** definir a máquina de estados completa e os guard conditions de readiness. Recomenda-se explicitar que `COMPLETE_EXPORT` não abre readiness, que o recovery continua pendente até o receipt `RECOVERY_REBASE` e readback do marker, e que só então o controller pode registrar `GATE_OPEN`. Incluir testes de crash/ACK incerto após cada passo, provando ausência de abertura antecipada e retomada idempotente com o mesmo `recovery_id` e digests.

## Avaliação dos demais tópicos solicitados

- **Estados e transições:** migration e serving têm gates e estados nomeados; UNKNOWN_COMMIT, pending e recuperação também têm tratamento fail-closed. A ambiguidade de transição apontada no terceiro P1 precisa ser resolvida antes de congelar a máquina de estados.
- **Concorrência e transações:** lock `FOR UPDATE` antes da amostra, `READ COMMITTED`, deadline monotônico e separação entre reserva e finalização formam um contrato verificável. A incompatibilidade trigger/sample do primeiro P1 impede confirmar a atomicidade efetiva do avanço.
- **Atomicidade:** migration transacional e claims de rebase são especificadas como atômicas. O bootstrap e a publicação da nova epoch ainda têm as lacunas descritas nos P1.
- **Identidade e aprovações:** nonce, freshness, roots separadas, registry de identidade, `person_id` distinto entre aprovadores e executor, revogação e attests com escopo estão especificados em detalhe. A execução continua dependente de artefatos e contratos externos, mas os testes sintéticos propostos são em geral observáveis.
- **Fencing e HA:** a promoção depende de prova de fencing do recurso, CAS de epoch, fence WAL e identidade de standby; restart normal diferencia corretamente `pg_last_wal_replay_lsn() = NULL`. Os critérios de aceitação são concretos, embora a implementação dependa dos serviços externos citados.
- **SQL, RLS e ACL:** grants por coluna, owner NOLOGIN, trigger invoker, funções recovery fixas, membership transitivo, `PUBLIC`, `session_replication_role` e preflight têm verificações explícitas. Não identifiquei, só pela SPEC, outro bloqueador SQL/ACL independente dos P1 listados. O desenho precisa preservar a fronteira global fora das tabelas tenant-scoped.
- **Evidências e critérios verificáveis:** há cenários de falha, barreiras de concorrência, critérios de failover/rollout e perfil de performance com população e p99 definidos. Os testes propostos devem ser ajustados para cobrir os contratos corrigidos acima; as evidências de BUILD não foram produzidas nesta revisão.

## Conclusão

**REVISE.** Resolver os três P1 e atualizar os cenários de aceitação correspondentes antes de solicitar nova crítica ou gate humano. Nenhum resultado deste parecer constitui aprovação humana T3 ou autorização de BUILD.
