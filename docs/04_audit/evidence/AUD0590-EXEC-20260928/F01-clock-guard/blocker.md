# PR301-WEBHOOK-CLOCK-GUARD-BUILD-001 — primeira fatia diagnóstica

Estado: `BLOCKED_FOR_SAFE_0028 / SYNTHETIC_ONLY / NO_GO`. Esta evidência **não** satisfaz a SPEC 0162 nem autoriza serving. Fonte normativa: SPEC 0162, SHA-256 `c33410876ef204faa655e41c663630bed127a9d9df274c50fd9427f86a07e53e`, aprovada pelo usuário para BUILD T3 sintético. Branch isolado baseado em `aad04d9ace6ed5b6d9c9902f4ddcad67b87a4abc`.

## Observação executada

`scripts/probes/pr301-webhook-clock-gap.ts` é uma sonda diagnóstica deliberadamente fora da suíte de regressão: não fixa o comportamento vulnerável como contrato. Executada em Node 22.23.2, PostgreSQL 16.15 descartável, loopback 55593, migrações reais até 0027, tenant/payload/chave sintéticos:

1. O catálogo não contém `0028_webhook_clock_guard` nem `webhook_clock_guard`.
2. Um role runtime sem superuser/BYPASSRLS e com os grants atuais do inbox obteve `state=acquired` e persistiu uma linha `pending`. Não houve marker, receipt de observer/witness ou attest. Isso demonstra que o store atual não impõe o high-water; não é prova de produção ou de efeito externo.
3. Em mock controlado de relógio, a instância antiga de `PostgresChronyWebhookClockHealth` rejeitou um recuo de 700 ms, enquanto uma instância nova aceitou o mesmo recuo porque `previousSample` é local ao processo. A segunda parte não altera o relógio real do PostgreSQL e não substitui teste de restart/restore da SPEC.

Comando de reprodução no worktree, após iniciar um PostgreSQL 16 **descartável próprio**:

```sh
TEST_DATABASE_URL='postgres://postgres:<senha-sintetica>@127.0.0.1:55593/cvg_clock_gap' \
  /home/ricardo/.nvm/versions/node/v22.23.2/bin/node \
  node_modules/tsx/dist/cli.mjs scripts/probes/pr301-webhook-clock-gap.ts
```

A sonda cria schema/role com sufixo único e os remove no final. O banco inteiro também deve ser destruído após a rodada. A URL acima é apenas exemplo local sintético.

Verificação desta rodada: sonda 2/2 diagnósticos observados; consulta pós-execução encontrou 0 schemas e 0 roles temporários. Prettier direcionado, ESLint direcionado e typecheck direcionado da sonda passaram em Node 22.23.2. O typecheck global ficou bloqueado por dependência `openid-client` ausente neste checkout (`oidc-client-corporate.ts`/`oidc-client-local.ts`); não houve instalação nem alteração do lockfile. Os testes PG16 de monotonicidade/trigger/ACL da 0028 **não foram executados**, porque a migration segura ainda não existe. Nenhum E2E ou certificação foi executado.

## Bloqueio preciso de uma migration parcial

Um singleton com `CHECK` e trigger monotônico isolado seria enganoso neste baseline. A SPEC exige que o valor aplicado seja **exatamente** o `clock_timestamp()` de microssegundos capturado sob `FOR UPDATE` após o lock e testemunhado em `SAMPLE`; o receipt e o HMAC one-use devem anteceder qualquer escrita SQL. O store atual calcula microssegundos via `extract(epoch)*1000000` e `Number`, usa `previousSample` em memória, e executa `INSERT`/`SELECT`/takeover com outro `clock_timestamp()` em vez de uma única amostra witnessada. Nenhum observer, witness, verificador, trust manifest, attestation key ring, ingress lease ou protocolo de reconciliação está conectado nesta branch. Inserir `0028` no runner agora poderia marcar o schema completo sem proteger a decisão HTTP, inclusive depois de rollback ou restart. Por isso **não** foi criada migration, função `SECURITY DEFINER`, claim ou grant provisório, nem um guard que aceita prova autodeclarada.

O próximo corte implementável precisa chegar junto, em ambiente sintético, com estes limites verificáveis:

1. Emissão/validação de receipt testemunhado e attest one-use ligados a amostra UTC de seis casas, epoch, `operation_id`, PID/txid e valor OLD/NEW. Falha, timeout, replay, rollback ou head divergente devem fechar o gate antes da decisão.
2. `0028` transacional completa em roles separadas, funções fixas, trigger invoker, chave privada, ACL efetiva, preflight e checksum. Bootstrap só insere o valor de `BOOTSTRAP` já witnessado; repetição não reseta marker. Testes PG16 com dois runners, restart e negativos de DML/trigger/role/`session_replication_role`.
3. Reserva/lookup migrados para uma transação `READ COMMITTED` que bloqueia singleton **antes** da amostra; marker e autorização têm o mesmo COMMIT. Readback e receipt observer de COMMIT precedem comando/2xx. Nenhum serving abre sem witness, reconciliation de samples pós-rollback, lease e inventário de instâncias completos.

Esses itens são dependências de correção, não uma redução da SPEC. A2 chrony/PG, bootstrap/recovery, rotação HMAC, HA/fencing, leases, testes de concorrência/crash/performance, B3 pendentes, D-06, provider, root/CI/atestação/staging e os gates de produção permanecem abertos. Nenhuma certificação, deploy, push ou dado real foi usado.
