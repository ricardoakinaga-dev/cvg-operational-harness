# Proposta de adendo SPEC-M07-R1-v2

Estado: `PROPOSED / PENDING HUMAN APPROVAL`. Este documento acompanha a [adjudicação A24-04](adjudication-ledger.md) e o [pedido de gate R1](r1-gate-request.md). Ele não altera a SPEC 0128 nem a barra congelada M07-S1 v1 antes da decisão humana.

## Escopo do adendo

Aplicar somente ao novo candidato corretivo M07-S1-R1:

1. Corrigir replay do fingerprint para que o digest seja produzido e verificado pela mesma serialização canônica armazenada no manifesto. O verificador deve ler o JSON persistido, recalcular o basis e rejeitar qualquer hash de input stale/alterado.
2. Preservar roles separados. Quando o mesmo owner-target tiver uma aresta de produção type-only `DECLARED_RUNTIME_SAFE` por `dependencies`, a declaração direta de produção também satisfaz a disponibilidade do import de teste. A aresta de teste permanece rotulada `TEST_ONLY`, mas não gera category mismatch nem exige `devDependencies` duplicada. A reconciliação não vale para `UNRESOLVED`, categorias conflitantes ou ausência de dependência.
3. Registrar inventário completo com findings como `PASS_WITH_FINDINGS` de B3 se todos os owners e fontes forem cobertos e nenhum gap/unresolved ficar oculto. `inventory` exit 1 + relatório íntegro `VIOLATION` é resultado de domínio completo, não erro de execução. Exit 2, 64, erro sem relatório, coverage gap ou finding oculto falha B3. Isso não significa conformance limpa.
4. Manter B6 independente: focused tests, suíte, typecheck, lint e coverage devem passar. Thresholds fixos: statements 90%, branches 85%, functions 90%, lines 90%. Não alterar exclusões da coverage nem manifests nesta fatia.
5. A24-03 acrescentará teste unitário sintético do adapter PostgreSQL de conversação usando `ConversationSqlPool`/`ConversationTenantDatabase` doubles. A execução não pode abrir conexão, consultar serviço externo nem depender de variáveis PostgreSQL.
6. Exigir candidato novo, gravado e diretamente reproduzível antes do inventário e demais checks; relatório e todos os registros de comando devem apontar ao mesmo fingerprint. O manifesto registra Node/TypeScript do runtime local e vincula a versão npm a um arquivo de preflight dentro da evidência R1. Qualquer drift de input ou de toolchain invalida o run.
7. No basis canônico R1, persistir separadamente a lista exata dos quatro paths de código/configuração autorizados para o delta. A lista de três paths do baseline/M07-S1 histórico não pode ser tratada como allowlist completa de R1.

## Separação de tarefas e limites

- A24-01: replay de fingerprint e verificador stale-candidate.
- A24-12: reconciliação do par produção type-only/teste descrita no item 2, com regressões positivas e negativas.
- A24-03: testes de comportamento do adapter com doubles sintéticos e coverage sem afrouxar threshold ou excluir arquivo.
- A24-02/A24-05: executar e auditar o candidato em Node `22.23.2`; nenhum S2/S3/S4 nem handoff a M05 é incluído.
- A24-06/A24-07 continuam responsáveis pelos dois vínculos ausentes e nove category mismatchs independentes, em gates/lotes futuros de M07-S4. R1 não altera manifests.
- A revisão I1 é requerida para a interpretação nova. Se o revisor independente não estiver disponível, registrar `UNAVAILABLE`, limitar o parecer a `CONDITIONAL_PASS` no máximo e manter M07 aberto.

## Critérios de aceite propostos

- O digest do novo manifesto é recalculável a partir do próprio `fingerprint_basis` serializado; mutação de um byte ou alteração de input reprova o verificador.
- O `fingerprint_basis` R1 contém os quatro paths autorizados do delta em campo próprio e não herda como lista completa os três paths planejados pelo baseline antigo.
- Test fixtures demonstram o novo compartilhamento de declaração apenas para par de produção type-only seguro mais teste; pares test-only sem produção continuam mismatch; roles ficam separados.
- O inventário cobre 25 owners e todas as fontes do candidato ou bloqueia explicitamente a alegação; findings, unresolved e gaps são visíveis. Espera-se que as 11 relações compartilhadas deixem de ser violações após a nova regra; os nove mismatches independentes e os dois vínculos ausentes permanecem visíveis até S4.
- Testes novos exercitam resultados e falhas do adapter sem PostgreSQL; suite focal, suite total, typecheck e lint passam.
- Coverage fresca do mesmo candidato atinge 90/85/90/90, sem mudanças na configuração de coverage, exclusões ou skips oportunistas.
- B1–B9 do bar anterior são reavaliados no candidato novo; B3/B6/B7 recebem as interpretações prospectivas acima. O resultado `FAIL` e os artefatos do candidato histórico não são editados.
