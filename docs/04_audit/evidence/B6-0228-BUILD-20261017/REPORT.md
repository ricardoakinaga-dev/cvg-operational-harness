# SPEC0228 — implementação e verificação concluídas

Task `B6-REMEDIATION-BUILD-0228`: **COMPLETED — 14/14 critérios PASS**, com fechamento documental e integridade verificados. [Autoridade T3](authority.json), [SPEC aprovada](../../../02_spec/0228_b6_boundary_fail_closed_remediation.md), [matriz detalhada](acceptance-status.json). Aprovação vinculada ao SHA `05fa3140bff99be3b4b91c2a0f0212bd01f6dd10509785867e84d3fcd64bddfe`, preservado.

Candidata local `/home/ricardo/cvg-candidates/b6-0228-20261017`, branch `candidate/b6-0228-20261017`, commit **`f11f762f6a176417a40d2d53bdb67c633d7e1cef`**, base `5a199668`. Somente dois scripts de fronteira, testes correspondentes e bloco 4 do runbook0803 mudaram. [Patch](implementation.patch.source.txt), [identidade](implementation.json), [fontes congeladas](source-freeze.json). Checkout compartilhado não recebeu integração do código; sem push/deploy.

## Resultado implementado

Conteúdo instalado sem prova permanece `verified:false`: versão igual recebe `UNVERIFIED_INSTALLED_CONTENT`; versão divergente recebe `INSTALLED_VERSION_MISMATCH`, preservando o drift. Expansão de dependências, links e referências reais a produto continua ativa. Nenhuma exceção histórica remove diagnóstico. Solicitação programática de exceções acrescenta `UNAPPROVED_EXCEPTION_REQUEST`; normal e strict aplicam a mesma recusa. FAIL conhecido mantém precedência.

A fronteira final é **INCOMPLETE/exit1** conforme a SPEC. A unidade retira falsos PASS conhecidos; não fornece prova positiva de isolamento nem aceita B6/HISO-005 geral ou produção. Runtime/API/worker/kernel/schema/produto/lock/workflow não mudaram.

## Verificação executada

- First red: 11 casos, 1 PASS/10 FAIL contra a versão anterior. Após correção:156 PASS/zero skips, 145 originais preservados e 11 novos; sete expectativas migradas explicitamente. [Inventário](test-inventory-migration.json), [resultado focal](focused-green.json).
- Certificação atual **16/16 gates PASS**: 3.479 unitários, 302 PostgreSQL e 12 E2E; zero falhas/skips/todo, zero flaky no E2E. Cobertura: 94,34% linhas, 93,44% statements, 95,63% funções, 90,09% ramos. [Resumo](full-certification-summary.json), [bundle raw](attempt-2/manifest.json).
- Run `run-b0d40eb53354-mvcz342x`, candidateId `b0d40eb5335484575013a2ffa38d06a26dace757320f67d3eb24b3182c67d563`. Resultado mecânico local **CONDITIONAL_GO/AAA_CONTROLLED**, com provider/canal/IdP `NOT_VALIDATED` e humanSignoff `PENDING`. [Verificador oficial](certification-verify.log): 38 hashes, decisão e candidata qualificados; [recibo](certification-verify-receipt.json). Isso não concede produção nem aceite de isolamento.
- Fronteira após todos os emits: 728 arquivos, 1.041 nós/5.066 arestas no grafo de fechamento, 303 instalados idênticos, 471 diagnósticos, zero exceções; normal/strict idênticos em 12,04 s/10,79 s. Os 165 diagnósticos estritos históricos e os 468 anteriores desta rodada permanecem. Os 3 adicionais são espelhos gerados de `contracts/dist/canonical-json.js`; nenhum input de fonte mudou. [Delta](emission-delta.json), [integridade](post-emission-verification.json), [recibos](boundary-final-receipts.json).
- Consumidor fresco por exports públicos sem produto/aliases: 198 imports/oito pacotes/72 exports, jornada e controles de recusa/auditoria PASS; zero rede e zero efeito de agendamento. Revalidado após preparação. [Resultado](compiled-consumer-final.json), [recibo](consumer-final-receipt.json).
- Revisão independente **APPROVE_SCOPED_DIFF**, sem findings, 29 probes próprios PASS. [Parecer](review-r1/REPORT.md), [vínculo](review-r1/review.json). Fontes finais byteidênticas às revisadas; a revisão não antecipou aprovação dos gates globais.

## Matriz de aceite

| Critério | Demonstração                                    | Estado | Evidência principal                                                |
| -------- | ----------------------------------------------- | ------ | ------------------------------------------------------------------ |
| B6R-01   | Controle positivo neutro e negativo de produto  | PASS   | [focused-green.json](focused-green.json)                           |
| B6R-02   | Conteúdo instalado não recebe confiança nominal | PASS   | [focused-green.json](focused-green.json)                           |
| B6R-03   | Mismatch e drift preservados                    | PASS   | [focused-green.json](focused-green.json)                           |
| B6R-04   | Caminho concatenado não recebe PASS             | PASS   | [focused-green.json](focused-green.json)                           |
| B6R-05   | FAIL conhecido mantém precedência               | PASS   | [focused-green.json](focused-green.json)                           |
| B6R-06   | Recusas e expansão de fronteiras mantidas       | PASS   | [focused-green.json](focused-green.json)                           |
| B6R-07   | Troca de receptor recusada normal/strict/CLI    | PASS   | [focused-green.json](focused-green.json)                           |
| B6R-08   | Nenhuma exceção suprime diagnóstico             | PASS   | [diagnostic-preservation.json](diagnostic-preservation.json)       |
| B6R-09   | Pedido explícito de exceção recusado            | PASS   | [focused-green.json](focused-green.json)                           |
| B6R-10   | Inventário físico completo dos 303 instalados   | PASS   | [boundary-receipts.json](boundary-receipts.json)                   |
| B6R-11   | 145 originais e 11 novos sem omissão            | PASS   | [test-inventory-migration.json](test-inventory-migration.json)     |
| B6R-12   | Gates T2/T3 e certificado completo              | PASS   | [full-certification-summary.json](full-certification-summary.json) |
| B6R-13   | Consumidor público fresco sem produto/aliases   | PASS   | [consumer-receipts.json](consumer-receipts.json)                   |
| B6R-14   | Grafo completo e execução abaixo de 60 s        | PASS   | [boundary-receipts.json](boundary-receipts.json)                   |

## Falhas preservadas e recuperação

Tentativa 1 terminou **NO_GO**, 15 gates PASS e E2E 2 PASS/10 FAIL, zero skips. Vite iniciou antes do `dist` de `@cvg/shared`; resolução negativa ficou em cache. Os 43 artefatos, relatórios, log e contextos originais foram preservados em [attempt-1](attempt-1/manifest.json). Preparação oficial e preflight E2E 12 PASS/zero skips/flaky ocorreram antes da segunda certificação completa. [Preparação](e2e-prepare-final-receipt.json), [preflight](e2e-preflight-receipt.json). Nenhuma fonte, teste, threshold ou configuração de gate foi alterada para a recuperação. O `dirty=true` da segunda tentativa contém somente saídas geradas; seu candidateId é idêntico ao da primeira.

A chamada adicional inicial do observer omitiu o argumento obrigatório de saída e falhou ao gravar o relatório. [Erro preservado](consumer-observer-invocation-error.json), seguido da chamada corrigida exit0; não foi usado como prova de sucesso.

## Encerramento e limite

Somente o PostgreSQL sintético próprio foi removido pelo ID exato; portas 3378/4378/56228 livres, processo de certificação encerrado. Candidata, variante e artefatos foram preservados para reprodução. [Cleanup](cleanup.json).

O próximo trabalho de isolamento positivo pertence a HISO-005/B6 e exige contrato/prova próprios. CI remoto, C1–C10, integração e release permanecem nas trilhas existentes. Esta unidade não concede equivalência global, produção ou paridade dos programas concorrentes.
