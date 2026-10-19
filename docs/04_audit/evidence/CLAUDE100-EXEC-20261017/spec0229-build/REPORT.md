# SPEC0229 — mecanismo inicial qualificado localmente

Task `C100-Q01-QUALIFIER-001`: **COMPLETED_LOCAL_SYNTHETIC_UNIT**.
A [aprovação humana](authority.json) foi aplicada ao contrato SHA-256
`bb42eb61cbd30c5720b00ef3145d9fdac4196b942eb3c42bff1d94acf4fe8243`.

O comparador e a CLI validam arquivos, catálogo, regras, captura e autoridade
antes de comparar documentos JSON completos ou bytes. Usam o kit Q03 qualificado,
preservam os insumos e publicam o relatório após finalizar escrita e cleanup.
Nenhum resultado do mecanismo promove automaticamente uma capacidade.

Código congelado no commit `cff0e7c3b1e5b9baa40e0c2c62d398109da0889d`, branch
`codex/claude100-qualifier-20261017`, candidata própria em
`/tmp/cvg-claude100-exec-20261017/q01-candidate`. A integração canônica permanece
pendente; a candidata Q04 já recebeu os mesmos35arquivos por fast-forward.

- [CQ01–CQ08](acceptance-status.json) aceitos no escopo do mecanismo sintético.
- [Revisão independente R3](review-r3/verdict.json): zero achados,399testes,
 39cenários próprios,43pins antes/depois,34relatórios e419cópias físicas auditadas.
- [Certificação atual](cert-r1/manifest.json):16gatesPASS e38hashes confirmados
 pelo verificador oficial. Unit4624PASS/0FAIL/1pending; PostgreSQL302PASS;
 E2E12PASS, sem skips ou flaky. O pendente global é o mesmo da base Q03;
 os399testes do comparador têm zero pendências.

Seis achados das revisões anteriores foram corrigidos em dois retrabalhos,
com falhas e reproduções preservadas. A classificação mecânica é
CONDITIONAL_GO/AAA_CONTROLLED para essa candidata local. Não concede release.

O catálogo permanece com117obrigações funcionais e17controles, todos ainda sem
qualificação funcional. Captura real da referência, regra/adapter específico,
dependências PAR, jornadaM1 e aceites integrais C100-Q01 continuam obrigatórios.
As capturas e decisões fictícias usadas nos testes não integram um inventário
funcional confiável do Lead.

O próximo trabalho ativo é a correção/revisão do servidor sintéticoQ04, seguida
de seus gates na candidata que reúne os três suportes. Ledgers compartilhados
continuam por handoff, sem sobrescrever outras sessões. A higiene do pacote
próprio passou; a checagem global registrou dois logs vazios B6 sem catálogo,
preservados para reconciliação pelo respectivo responsável.
