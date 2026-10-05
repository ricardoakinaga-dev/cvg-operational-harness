# GREEN — correções e testes locais em execução

Data: 04/10/2026. Task: `HARNESS_ISO_GREEN_20261004`. Estado: `IN_PROGRESS`. Veredito global **FAIL**; produção **NO_GO**. Nenhum runtime promovido ao checkout compartilhado nesta rodada; zero chamadas OpenAI, sem push, dados reais, piloto ou implantação. Os 24 critérios continuam exigidos, sem novo DONE. Harness e produto conservam artefatos, processos e barras próprios.

## Estado atual

Candidata física final R19: 5.639 testes PASS em 410 arquivos, PostgreSQL16/V8, zero skips/TODO; MATCH7816 e todos 8.476 inputs nativos intactos. Ambas falhas de desempenho anteriores passaram sem relaxar limites: saturação 10.341ms/15.000ms e whole-job 1.033ms/1.300ms. Cobertura global S91,91/L92,92/F94,79/B87,43; seis gates críticos de branches95 PASS. Dez mutantes reais mortos, zero sobreviventes/timeouts/erros; 94 controles PASS. Variante física sem produto: 5.004 testes PASS/382, PG/V8 e MATCH7684, 411 inputs removidos, 8.065 retidos; execuções sobrepostas não somadas. E2E Chromium12 e três browsers15 PASS sem skips/retries; produtor nativo confirmou 15PASS/axe0, candidateId ed3071438170e97cf6d035ee57909589eb433d52d36c5f277f014930de0e429f. Primeiro capture E2E marcou DRIFT somente por JUnit gerado no caminho declarado; recibo original e reconciliação preservados. Tipos/lint/CI436 PASS e metadata I1 ACCEPT20, 371 testes originais intactos, coverage281, 46 novos paths. API compilada R9:22 grupos PASS com PG/restart/sessões/HMAC/tenant/roles/fault/HEALTHCHECK200; crítico103+45 ACCEPT restrito, não repetiu Docker/PG; imagem/capturas preservadas integralmente. C1R18 crítico104 probes ACCEPT restrito à soundness; installed permanece INCOMPLETE2.958, nenhum unknown dispensado. TTL reviews r1/r2/r3 INVALID preservadas (18/14/16 checks semânticos PASS); r4 novo ativo em runtime próprio. Scans atuais: npm audit0 vulnerabilidades, SBOM/licenças380/zero desconhecido ou vedado; Gitleaks6.575 e CodeQL3 permanecem PENDING, revisão individual nova ativa. Certificação nativa atual ativa em cópia própria; sem promoção Root/Main. GlobalFAIL, produçãoNO_GO;24 critérios preservados, nenhum novo DONE; provider0/push0/dadosreais0.

A falha atual e os REJECT/INVALID anteriores estão preservados com relatórios originais byte-exatos nos archives. Aceites de gateway e sessões/ingresso são limitados aos respectivos packets. Imagem neutra e E2E anteriores não certificam uma fonte futura; requalificação final segue obrigatória.

## Autoridade e próximos passos

SPECs 0179/0180 emendadas e builds de segurança, bootstrap, custo/modelo e ingresso foram aprovados individualmente. Aprovações e hashes constam nos recibos do diretório green. NO_MODEL para classes proibidas/entradas desconhecidas, dados exclusivamente sintéticos, promoção condicionada e T4 separado permanecem. `.env` privado ignorado/0600 não foi lido, copiado, logado ou incorporado às imagens.

1. Preservar os aceites limitados de gateway e sessões/ingresso; preservar o aceite OPS R8 e requalificar a composição final.
2. Fechar fronteira instalada, CI, operações e segurança com revisão independente válida; nenhum autoverdict do Builder é aceite independente.
3. Concluir suíte completa/cobertura crítica, variante física sem produto, PostgreSQL dedicado, E2E, tipos/lint/formato/links, builds, mutação, scanners, SBOM/licenças e certificação; requalificar imagens e programa local3500/3501 preservando journal.
4. Promover somente paths próprios após todos os gates e revisões exigidos, commit local sem push. Preparar pacote T4 congelado antes de chamada externa. Produção/piloto/release e decisão clínica D2 continuam separados.

Ledgers99/20/30 recebem apenas blocos próprios, com staging parcial e preservação byte a byte de todo dirty anterior. Evidências físicas persistem em `/home/ricardo/.cache/cvg-harness-green-20261004`, fora de /tmp; checkpoints e artefatos próprios são versionados por caminho. Serviços3400/3401 preservados.

`last_completed_action`: recibos R8 com aceite independente e regressões integradas atuais; falhas completas/neutral preservadas. `next_action`: concluir gates e críticas em andamento e fechar pendências. `status: IN_PROGRESS`.

[Checkpoint41](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-46-final-integrated-gates.json) vincula as evidências atuais. Checkpoints anteriores são históricos, inclusive falhas preservadas, e não certificam a fonte futura.
