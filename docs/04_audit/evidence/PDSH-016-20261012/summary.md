# PDSH-016 — evidência de construção local — 12/10/2026

- Escopo: SPEC [0201](../../../02_spec/0201_pdsh016_exam_egress.md), ferramentas de egress sintético, kernel governado, SSRF/DNS-bound e journal existente.
- Status: DONE_LOCAL no escopo do cartão. Não é certificação, revisão independente ou release.
- Recuperação: guarda interrompida tinha 8 falhas/5 passes; após DNS injetado, 6 falhas/7 passes porque TEST-NET-2 é endereço reservado recusado corretamente. Fixture corrigida usa endereço público com fetch totalmente simulado. Foram corrigidos reserve/claim antes da rede, UNCERTAIN em falha ambígua, replay FAILED, hash de conteúdo e limite de resposta.
- Verificação focada inicial: 5 arquivos/43 testes PASS (28 unitários de egress, 1 transporte loopback, 3 integração kernel, 7 superfície pública, 4 catálogo). Teste negativo de drift em cópia temporária imprime `stale` esperado.

## Procedimentos observados

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| `npm test`, Node 22, PG próprio | PASS: 376 arquivos/3180 testes, 1 skip | [log completo](unit-with-pg-node22-verified.log) |
| `npm run test:postgres`, Node 22, PG 16.15 | PASS: 37 arquivos/302 testes, zero skips | [log completo](postgres-node22-complete.log) |
| Fronteira ADR-010 | PASS local, zero violações/diagnósticos/lock drift | [gate](boundary-node22-final.log) |
| Egress + kernel + catálogo + públicos + negativos da fronteira | PASS: 6 arquivos/173 testes | [foco](focused-node22-verified.log) |
| Fix de compatibilidade PDSH-001 (PG original + guards de execução/cancelamento) | PASS: 4 arquivos/144 testes | [foco PG](pg-regression-fix.log) |
| Typecheck/lint/catalog/prettier em Node 22 | PASS | [gates estáticos](static-node22.log); typecheck/lint também reexecutados após fix |
| Links/higiene | PASS inicial; rechecagem após ledgers no fechamento | comando `npm run docs:check-links` |

## Self-review separada e decisão

- Critérios: nenhuma chamada de rede sem reserva/claim, FAILED não vira sucesso em replay, ambiguidade não autoriza reenvio, hash inclui bytes, lease perdida não confirma, stream limitado, destino revalidado, approval/sandbox executáveis pelo kernel. As guardas observam estado do journal e ausência/contagem de fetch, não apenas strings.
- Alternativa descartada: HEAD de pré-validação (gerava egress adicional). Escolha: guard estático+DNS sem HTTP e transporte DNS-bound existente, com reserve→claim antes de POST/GET. Não foi introduzido spine alternativo.
- Fronteira: 13 sítios de subprocesso existentes nos cartões 011/014 revisados separadamente, vinculados a expressão/linha/ocorrência e hash de arquivo inteiro. Pins de scripts são dependências adicionais de uma exceção, nunca sítios exceptuáveis. Negativos cobrem mutação de probe/gerador e import de produto; as outras 128 guardas continuam verdes. Esse self-review não substitui aceite independente HISO-005.
- Falha real corrigida na fatia antiga PDSH-001: opt-in de signal no contrato legado. Cancelamento solicitado recebe signal combinado; default não insere objeto host em invocação de aplicação.

## Histórico de falhas preservado

- [Primeira suíte Node 22](unit-node22.log): interrompida pelo orçamento de 120 s, sem veredito.
- [Suíte sem PG](unit-node22-final.log): 355 arquivos/2975 PASS, 203 skips; histórico antes do fix PG.
- [Primeiro gate PG](postgres-node22.log): 301 PASS/1 FAIL na composição aprovada; não era bloqueio de infraestrutura.
- [Primeiros negativos de fronteira](focused-node22-final.log): duas falhas de fixture (módulos sem aliases), corrigidas sem remover asserções.
- [Bateria com PG interrompido](unit-with-pg-node22.log): 70 falhas em cascata e um erro quando o tmpfs de 512 MiB encheu; [log do contêiner](postgres-container-failure.log) mostra PANIC ENOSPC em pg_wal. Novo banco 4 GiB, checkpoint de 1 min, WAL max 256 MiB; gate final acima é outra execução.
- `postgres-node22-verified.log` é captura parcial: a suíte anterior levou 493 s e o comando encadeado foi interrompido aos 600 s. O comando PG foi reexecutado isoladamente em 89 s e seu resultado válido é `postgres-node22-complete.log`.

## Limites e próxima ação

- Confinamento de path da composição não promete proteção contra um processo host adversarial substituindo ancestors no intervalo síncrono; tenant/raiz e seams injetados são responsabilidade confiável da composição.
- Journal in-memory nas guardas de exame não comprova durabilidade de envio real. Nenhum host externo de exame foi contatado; um teste de transporte usa somente listener loopback descartável.
- Um skip permanece na suíte completa; nenhum no gate PG. E2E/certify/coverage e CI remoto NOT_RUN nesta rodada. Sem commit/push/release; produção NO_GO.
- Próxima ação: PDSH-020, especificar envelope/versionamento de sessão antes do store PDSH-021. CI de catálogos fica PDSH-033; Dockerfile sandbox continua diferido.
