# Intake independente do PR29 — 26/10/2026

Task C26-PR29-INTAKE-33E9, Codex33E9. **PASS para conferência dos artefatos existentes do CI; integração e produção continuam pendentes.**

## Resultado verificável

- PR29 permanece aberto na HEAD `b667ad6fb8bed417d6ed96d91befa44c7fd73c73`, base `61e5cf8f41d15cc41ad524f8a57476d4f6080131`.
- Verify40074454577, attempt1: quatro jobs SUCCESS e cinco checks exigidos App15368 SUCCESS na HEAD correta.
- O GITHUB_SHA efetivamente testado/atestado é o merge sintético `c56e789712f8e10493a200ce41da77937fb1bcb3`. Pais61e+b667; árvores de c56e e b667 idênticas: `49d1f24c41a2a69083cd2121fdfbb514a6cdc950`. Não confundir as duas identidades nem transferir certificado a uma árvore futura.
- ZIP bar12558041268:932413bytes/SHA2568ae90123d7f71c4096a0e98465ce99488c7398081ea6560ff440348ab51d7c34. ZIP attestation12558115346:7223bytes/SHA256b543af210dfe3690d1149b64de8e3320cc08dc32d7b638f07f22cccf3debf027. Ambos correspondem aos digestsAPI.
- ZIP do bar contém59arquivos: manifesto e58 registros de hash. Extração com recusa de duplicata, traversal, symlink e expansão acima64MiB;58hashes/tamanhos conferidos.
- Manifesto SHA256 `3759c5b9f2a4167ec563718da7d1d2c32950c0cbbcd6a0104424d8922feb541c`;36gates PASS,35selos conferidos individualmente e como conjunto,16fases nativas PASS. Catálogo comparado à fonte imutável, ordem dos gates ao workflow e ordem dos selos ao contrato.
- CandidateId `eaa05608432108c62134b39b2d314619885ad8e6f7e360e4f017a56cdf4aa275`: recomputado;2381 arquivos/tamanhos/SHA256 correspondem aos blobs Git de b667, sem ler arquivos mutáveis do checkout.

## Resultados dos brutos do run existente

| Evidência             | Resultado                                                                  |
| --------------------- | -------------------------------------------------------------------------- |
| Unitários             | 7211PASS/510arquivos físicos; zero fail/pending/todo                       |
| PostgreSQL            | 338PASS/42arquivos físicos; zero fail/pending/todo                         |
| E2E padrão            | 12esperados; zero unexpected/flaky/skipped/errors                          |
| OIDC três hosts       | 15/15PASS, sem skip/flaky; axe0bloqueantes; IdP sintético                  |
| Navegadores REM21-014 | 18PASS declarados no relatório empacotado                                  |
| Cobertura externa     | S94,53/B91,24/F96,04/L95,36                                                |
| Certificação          | AAA_CONTROLLED/CONDITIONAL_GO; integrações reais e aceite humano pendentes |

ContagensVitest foram recomputadas dos assertionResults; numTotalTestSuites não foi apresentado como número de arquivos. Nenhuma suíte foi reexecutada nesta task. Aprovação B1 não encerra U08: U04/PB14 e nova API/PostgreSQL/Q9 continuam exigidos.

## Assinatura, origem e limites

O statement do bundle aponta exatamente ao hash do manifesto, workflowVerify/refs/pull/29/merge, commitc56e, repositório, run40074454577/attempt1 e runnergithub-hosted. O job independente120853494300 e seus cinco passos estãoSUCCESS; o workflow imutável exige gh attestation verify com source-digest e deny-self-hosted-runners.

O gh local2.45 não oferece attestation: **não houve nova verificação criptográfica local**. A autoridade criptográfica usada é o job hospedado independente, somada à conferência local do subject/bindings e digestsAPI. Não declarar parsing do bundle como validação da assinatura.

O manifesto nativo lista38artefatos:2disponíveis/hashverificados localmente e36nãoempacotados. Estes últimos são declarações autenticadas verificadas pelo job nativo; não alegamos rehash local.

O verificador desta inspeção teve três erros de método antes da conclusão: pressuposto de35declarações quando o contrato inclui artifacts, duplicação de artifacts na sequência do workflow e pressuposto de mesma ordem para selos e execução. Cópias/erros preservados no packet; corrigidos por inspeção das fontes, sem mudança em produto, testes, contratos, budgets ou dados do CI.

## Entrega ao responsável e continuidade

CONT-D9EF conserva fonte, revisão e integração29. Esta task entrega qualificação independente de metadados para adoção; não executa merge, push, deploy, rerunCI ou modificação de recurso alheio. Antes da integração: reconferir HEAD/base/regras/checks e autorização aplicável. Se a árvore mudar, qualificar a nova fonte; não transportar este PASS.

Evidências: [verificação](../../04_audit/evidence/C26-PR29-INTAKE-33E9/verification.json), [resumo primário](../../04_audit/evidence/C26-PR29-INTAKE-33E9/primary-summary.json), [integridade do download](../../04_audit/evidence/C26-PR29-INTAKE-33E9/download-integrity.json), [pins de fonte](../../04_audit/evidence/C26-PR29-INTAKE-33E9/source-pins.json). Brutos privados preservados em /mnt/dados/cvg-work/c26-pr29-intake-33e9; nenhum segredo incluído no packet.

Estado desta unidade: COMPLETED_INTAKE. next_action: CONT adotar/conferir o packet e integrar29 sob seu claim/autorização; U08 e programa24unidades42critérios seguem incompletos, produçãoNO_GO.

Deltas aos ledgers99/20/30 ocupados: registrar esta conferência e entrega de evidência, sem marcar PR29integrado/U08DONE ou produçãoaprovada. Os três arquivos compartilhados permanecem preservados pela regra5.
