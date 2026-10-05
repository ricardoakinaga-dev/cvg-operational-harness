> Cópia de leitura: apenas links relativos foram redirecionados ao arquivo de evidências versionado. O relatório original byte-exato está no archive, com SHA-256 por arquivo no manifesto. Veredito e conteúdo técnico preservados.

# Revisão funcional independente — GREEN INBOUND_FRESH_REVIEW_R1

**ACCEPT no escopo funcional solicitado.** Nenhum finding do produto reproduzido. Sem aprovação de produção, T4 ou conclusão global.

Packet: `/home/ricardo/.cache/cvg-harness-green-20261004/inbound-session-review-r1`. Claim: `Lead GREEN INBOUND_FRESH_REVIEW_R1`. AUDIT concluído em `2026-10-05T01:01:47.822952+00:00`. Fonte/dependências/dist congelados permanecem somente leitura; a revisão usou `output/work`, cópia física própria.

| Escopo | Veredito | Casos de prova em `independent-r2.json` |
| --- | --- | --- |
| bootstrap | **ACCEPT** | FIXTURE-01, BOOT-MISSING-CVG_OPERATOR_SESSION_DATABASE_URL, BOOT-MISSING-CVG_OPERATOR_AUTH_SCHEMA … |
| route-boundary | **ACCEPT** | HEALTHY-PROBES-none, HEALTHY-PROBES-unknown, HEALTHY-PROBES-expired … |
| sessions | **ACCEPT** | SESSION-DURABLE-CREATE, OPERATOR-CONTROLS, TOKEN-REPLAY … |
| ingress-tenant | **ACCEPT** | BODY-CLAIM-0, BODY-CLAIM-1, BODY-CLAIM-2 … |
| ingress-cookie-independence | **ACCEPT** | HEALTHY-INGRESS-none, HEALTHY-INGRESS-unknown, HEALTHY-INGRESS-expired … |
| auth-fault | **ACCEPT** | FAULT-PROBES-none, FAULT-INGRESS-none, FAULT-PROBES-unknown … |
| replay-restart | **ACCEPT** | INGRESS-COMMITTED-REPLAY, DATA-FAULT-INGRESS-RECOVERY, MAIN-SIGTERM-RESTART-DURABLE … |
| two-tenants | **ACCEPT** | TENANT-B-CANONICAL-RESTART, INJECTED-RESOLVER-PRESERVED-PG, UNKNOWN-METADATA-NO-AUTHORITY … |
| hygiene | **ACCEPT** | HYGIENE-OWN-OBJECTS |

## Evidência executada

- Node **22.23.2**, PostgreSQL **16.15** real em `127.0.0.1:55598/cvg`; schemas/roles somente `green_inbound_i1*`. Preparação executa as **27 migrations canônicas de dados**, auth migrations/grants canônicos por owner separado, e preflights reais com serving roles distintas, sem superuser/BYPASSRLS/replication.
- Compilação atual da closure do runtime: **exit 0**, [build.log](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `build.log`). Entry point oficial `output/work/apps/api/dist/main.js`, SHA-256 `d5022f3bd97e5c67258bd77c63376fad1c6947f4f14a35ebd01988e97613b461`. **15 processos oficiais**, 10 negativos antes de listen e 5 positivos/restarts; sinais SIGTERM/SIGINT encerraram os processos próprios. [Lifecycle e casos](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `independent-r2.json`), [higiene de processos](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `process-hygiene.json`).
- **19 arquivos / 220 testes relacionados PASS / 0 FAIL / 0 SKIP**, com PostgreSQL obrigatório configurado. [JSON](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `original-tests.json`), [log](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `original-tests.log`). Apenas constantes de nomes de recursos das fixtures na cópia receberam o prefixo exclusivo. Identidade exata de **120 expressões SQL e 421 expressões de asserção** confirmada por AST: [prova](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `immutable-original-tests.json`), [deltas de namespace](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `original-fixture-namespaces.json`).
- Novo teste independente: **68 casos PASS / 0 FAIL / 0 INVALID**, **238 requests HTTP**. [Teste reproduzível](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `work/review-ingress-main.mjs`), [resultados](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `independent-r2.json`), [transcript](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `http-r2.jsonl`), [log](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `independent-r2.log`). Assinatura HMAC gerada por `createHmac` sobre os bytes exatos do body, sem mocks no processo oficial.

## Observações funcionais

GET/HEAD de `/health`, `/live`, `/ready` e `/health/metrics` preservam seu comportamento com cookies ausentes, desconhecidos, expirados, revogados, válidos e de outro tenant. Em produção, métricas já são desativadas e retornam **404**, inclusive sem cookie; isso foi preservado. A sonda instrumentada do hook compilado registrou **zero leituras de cookie / zero session.get** nos nove pares públicos, e quatro leituras/consultas recusadas nas quatro variantes registradas de método/template. O processo oficial também recusou 20 pares protegidos com token/cookie durante falha de auth, além de cinco aliases brutos; isso é evidência dirigida, sem nova cobertura global.

Após revogar somente o EXECUTE de `operator_session_get` da role própria, `/ready` retorna **503** e identifica `operator-session-store` failed; `/live` e `/health` permanecem **200**. HMAC legítimo com todos os cookies continua **200 / outbox pending**. Rotas de operador/sessão retornam **503**. Restaurar o grant recupera readiness e identidade durável. Config ausente, schema compartilhado, role reutilizada/excessiva, grant excessivo, função com search_path alterado e DB auth inacessível recusam o startup oficial, com exit1 e mensagem sanitizada.

HMAC inválido precede os claims e retorna **401**. Com HMAC válido, divergência/malformação de `body.tenantId` ou `x-tenant-id` retorna **403** com `forbidden / Inbound tenant claim is invalid`, sem dados no envelope. As contagens de **todas as 40 tabelas de tenant**, inclusive outbox, outbox_effects e três journals de efeitos, permanecem iguais antes/depois de cada recusa. A lease é liberada: mesma requisição recusada continua403, e claim corrigido permite retry; no header, os mesmos bytes e HMAC são reutilizados. Ausência e claims coincidentes preservam a fila; cookie e metadados aninhados não escolhem tenant.

A fila persiste após restart, assim como sessões e revogação; replay HMAC/token é recusado. Falha no INSERT de outbox resulta **500**, rollback sem novas rows e retry200 após recuperação. Dois tenants canônicos passam pelo main oficial em restarts separados, inclusive com mesmo externalMessageId e cookies cruzados, produzindo outboxes distintos. Resolver explicitamente injetado conserva sua autoridade tenantB quando a env contém tenantA; essa prova complementar usa a composição production-bootstrap compilada com PostgreSQL real.

## Incidente de fixture preservado

`I1-FIXTURE-01`: primeira execução **INVALID como evidência de aceite**, com 53 casos verdes e 15 falhas derivadas de três erros próprios: coluna `session_digest` em vez de `token_digest`; oracle de métricas200 apesar do contrato existente404; resolver de identidade obrigatório omitido no cenário de injeção. Sem finding do produto. Falhas/logs/transcript/script originais preservados; correção somente na fixture própria e reteste **68/68 PASS**. [Incidente](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `fixture-incidents.json`), [diff](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `fixture-correction-r2.diff`), [falha bruta](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `independent-r1.json`).

## Proteção e higiene

Inventário congelado SHA-256 **`a0d55067fda5aada9f87716abeb2146a15ae5a7bf38c5efd42bb29986a62d97f`**: **19.326 arquivos / 48 symlinks internos**, sem mudanças before/after, links escapando ou regular files com inodes compartilhados entre source e cópia. Fontes, dependências e dist têm fingerprints before/after próprios. [Before](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `protection-before.json`), [after](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `protection-after.json`). Recibos de aprovação conferem com os hashes exatos das duas emendas: bootstrap `2559fec7558358dc03d28fd8eabf8d5c3416f31c217088641988375a5cee6b45`; ingresso `18bc60cfb0005abb2089461d09e30f7caff3f3a6e82341f2d1c4939954c19770`.

Somente processos e objetos próprios encerrados/removidos. **Zero schemas, roles ou conexões próprias residuais**; os 15 PIDs oficiais já não existem. Catálogo estrutural completo antes/depois idêntico, SHA-256 **`a2ee8d69d73f9a5b59bf509cc7c55a3cd9ef84caaff9076accdd518bd6276dd0`**; PG continua respondendo e o container permaneceu. [Before](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `catalog-before.json`), [after](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `catalog-after.json`), [processos](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `process-hygiene.json`). [Manifesto de SHA-256 das provas](inbound-session-independent-review-r1-evidence.tar.gz) (arquivo interno `evidence-manifest.json`).

## Limites e handoff

O packet seletivo não contém coordenação/runtime/log/backlog; o Root/Main não foi acessado. Claim e continuidade estão somente em output. Nenhum SQL de origem, asserção original ou fonte do packet foi alterado. Nenhum histórico externo de crítico/builder, `.env` real, chave real, scratch alheio, subagente, provider, rede externa, push ou release foi usado. Filas e falhas foram medidas sem iniciar worker ou efeito externo. O HTTPS é reconhecido por proxy sintético sobre loopback, sem qualificação de TLS/IdP/firewall reais; o main conserva o listen wildcard existente. Não houve certificação global, coverage global, E2E completo, qualificação de imagem ou CI remoto.

Próxima ação do Lead: consumir este **aceite funcional limitado** nos gates integrados pertinentes. Nenhuma remediação de fonte é indicada pelos casos desta revisão.
