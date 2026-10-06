# Resposta documental aos achados I10 — SPEC 0162

- Parecer analisado: [I10-review.md](I10-review.md), 5 P1 e 2 P2, sem P0.
- Candidato após resposta: [SPEC 0162](../../../02_spec/0162_webhook_clock_highwater_marker.md), SHA-256 `c33410876ef204faa655e41c663630bed127a9d9df274c50fd9427f86a07e53e`.
- Escopo desta resposta: contrato documental e critérios de aceite. Não altera código, schema, migration, runner nem banco; não executa testes comportamentais/SQL/BUILD.

## Matriz de resposta

| Achado I10 | Resposta incorporada | Evidência/aceite |
| --- | --- | --- |
| P1 — modelos de escrita conflitantes | Removido o caminho column-level. Um único modelo normativo usa `advance_guard(sampled_at timestamptz, sample_attest jsonb)` para avanço normal, `initialize_guard` para bootstrap, `reconcile_guard` para reparo monotônico e `APPLY_PREPARED` apenas para rebase. Runtime não tem DML; cada principal recebe somente `EXECUTE` na função própria. | SPEC §§ Estado durável 5–6, Segurança e operação; verificação 3 testa ACL efetiva, `UPDATE` direto, `SET ROLE` e trigger. |
| P1 — microssegundos sem transporte/canonicalização | Definidos timestamp UTC de seis casas fracionárias em string RFC 3339, captura/formatação no mesmo SELECT, bind/readback sem `Date`/float, cálculos inteiros `BigInt` e igualdade PostgreSQL exata. | SPEC § Precisão 1; verificação 11 round-trips `.000001`, `.123456`, `.999999`, digests e rejeição de truncamento/arredondamento. |
| P1 — semântica da assinatura de entrada incompleta | Referência normativa direta a 0160 §A.1–A.3/§B.2; contrato fixa timestamp em segundos inteiros, header `sha256=`, HMAC-SHA-256, signing input UTF-8, segredo do canal, raw body obrigatório no serving, validação de assinatura antes da janela e limites temporais inclusivos. Headers repetidos/JSON ambíguo são rejeitados. | SPEC § Precisão 2–3; verificação 11 inclui vetores positivos, raw body alterado, duplicatas, unidade incorreta e quatro limites de janela. |
| P1 — reconciliação pós-rollback não executável | Definidos gate close/drain/expiração de leases, target witnessado, `reconcile_id` e tentativas imutáveis, receipt/attest próprios, função/role/ACL, update + registro no mesmo COMMIT, receipt pós-COMMIT, readback, estado `RECONCILED_CLOSED`, retry idempotente e resolução `UNKNOWN_COMMIT`. SQL acima do witness, relógio abaixo da máxima ou primary incerto exigem fail-closed/recovery. | SPEC § Reconciliação; verificação 12 injeta crashes antes/depois de append/COMMIT/readback, replay concorrente, target inválido e abre readiness somente após `GATE_OPEN`. |
| P1 — chrony sem limite de associação ao sample PostgreSQL | Definidos midpoint monotônico, janela máxima de 100 ms, limite de RTT, projeção UTC, fórmula inteira conservadora `U_s`, dispersão/idade/drift/offset e orçamento fail-closed de 1 s. Step/reset ou mutação fora do orçamento aborta autorização. | SPEC § Precisão 4; verificação 11 testa steps antes/entre/depois, RTT/intervalo e ultrapassagem de cada orçamento. |
| P2 — ciclo de vida/consumo de chave HMAC indefinido | Definidos emissor HSM, TCB simétrica explicitada, estados de rotação `ACTIVE/PREPARED/REVOKED`, instalação confirmada nos dois lados, overlap de até 30 s, ativação/revogação witnessada, falha parcial, revogação imediata comprometida e consumo atômico por `attest_id`. Rollback nunca reaproveita attest; exige nonce/attest novo e retry idempotente. | SPEC § Emissão, rotação e consumo; verificação 13 testa rotação parcial/concorrente, versão antiga, replay e rollback. |
| P2 — serving sem prova de cada instância/boot | Cada decisão exige lease Ed25519 witnessado, vinculado a instância/boot/epoch/rota, no máximo 5 s, resposta ao desafio em 100 ms e deadline local `CLOCK_BOOTTIME`; todo request, COMMIT e receipt dependem de lease vivo. Nova epoch aguarda 5,1 s após última emissão anterior, drenagem e fence. | SPEC § Admissão por lease e Rollout; verificação 8 e 13 cobrem isolamento, boot não registrado, lease atrasado/repetido/expirado, controller reiniciado e epoch antiga. |

## Verificação documental

- Prettier direcionado aos arquivos desta resposta: PASS. `npm run format:check` do workspace ainda falha somente em `docs/04_audit/0590_deep_system_audit_2026-09-28.md`, documento fora deste claim; não o alterei.
- `npm run docs:check-links`: PASS, zero links quebrados; higiene PASS (231/231 vazios catalogados, 646 JSON lidos).
- `git diff --check` e `python3 -m json.tool proof.json`: PASS. Testes de aplicação, SQL, migration e comportamento não foram executados.

## Estado e riscos residuais

Os sete achados foram respondidos no contrato, ainda sem aceite independente. O próximo passo é crítica fresh-context I11 sobre o SHA-256 `c33410876ef204faa655e41c663630bed127a9d9df274c50fd9427f86a07e53e`; a instrução do usuário exige uma nova crítica antes de qualquer BUILD. A aprovação humana T3 da SPEC 0162 não foi solicitada nem recebida, portanto migration 0028 segue não autorizada.

O driver PostgreSQL e as fronteiras do HSM/controller/witness ainda precisam de testes reais em ambiente descartável após autorização T3. B3, D-06, provider/IdP reais, integração root/PR-L04, CI/atestação, staging e produção continuam fora deste gate; produção `NO_GO`.
