# GREEN — correções e testes locais em execução

Data: 04/10/2026. Task: `HARNESS_ISO_GREEN_20261004`. Estado: `IN_PROGRESS`. Veredito global **FAIL**; produção **NO_GO**. Nenhum runtime promovido ao checkout compartilhado nesta rodada; zero chamadas OpenAI, sem push, dados reais, piloto ou implantação. Os 24 critérios continuam exigidos, sem novo DONE. Harness e produto conservam artefatos, processos e barras próprios.

## Estado atual

CI12 na Main privada mantém 4.678 PASS/407 e variante física neutra 4.050 PASS/380, PostgreSQL/V8; resultados sobrepostos não são somados. Cópia integrada R17 mantém 8.474 inputs nativos, 371 originais e 281 paths de cobertura, tipos/lint PASS/MATCH7814. Correção exata de metadata passou nos 436 testes CI; nova extensão independente ACCEPT com 36 verificações, sem aceite runtime/global. Suíte completa posterior PostgreSQL/V8: 5.469 PASS/2 FAIL de 5.471/408, zero skips/TODO/MATCH7814; agora as falhas são saturação de 1.000 recibos no limite15s e deadline1000ms observado1935ms acima de1300ms. Foco diagnóstico dos mesmos47 testes passou sem cobertura, saturação13540ms e job1031ms, sem reduzir barras; não comprova flake. Perfil CPU/V8 falhou a27s com fsync~12s, igualdade de buffers~6s e TTL~2.2s; não concede dispensa de durabilidade. Builder R18: 1.185 PASS (253 originais +793 prefixo +139 novos), tipos/lint PASS; 109 negativos reproduzidos antes, installed INCOMPLETE2.958, todos2.957 anteriores e1.610 históricos/267 hashes retidos. Código selado; crítico fresco ativo em packet físico próprio, sem aceite ainda. Programa API compilado R8 em configuração production passou21 grupos reais com PG/sessões/tenant/replay/restart/fault/roles; HEALTHCHECK original FAIL426, veredito da imagem FAIL. Imagem/procedimento/source/runtime/HTTP/SQL/cleanup selados e arquivados integralmente em13 partes verificadas; sem worker/SLO/provider/produção qualificados. Correção restrita GET/live de peer socket real loopback na cópiaR9:36 testes PASS, seis falhas reproduzidas com hook original, tipos/lint PASS; nova imagem compilando e revisão independente pendente. Builder de TTL/performance ativo em outra cópia, testes existentes/1000recibos/fsync/limites mantidos. C1 e runtime não promovidos à Main/Root. Fonte final/full/installed/segurança/certificação/promoção condicionada pendentes. Global FAIL, produção NO_GO; 24 critérios mantidos, nenhum novo DONE; zero chamadas OpenAI/push/dados reais.

A falha atual e os REJECT/INVALID anteriores estão preservados com relatórios originais byte-exatos nos archives. Aceites de gateway e sessões/ingresso são limitados aos respectivos packets. Imagem neutra e E2E anteriores não certificam uma fonte futura; requalificação final segue obrigatória.

## Autoridade e próximos passos

SPECs 0179/0180 emendadas e builds de segurança, bootstrap, custo/modelo e ingresso foram aprovados individualmente. Aprovações e hashes constam nos recibos do diretório green. NO_MODEL para classes proibidas/entradas desconhecidas, dados exclusivamente sintéticos, promoção condicionada e T4 separado permanecem. `.env` privado ignorado/0600 não foi lido, copiado, logado ou incorporado às imagens.

1. Preservar os aceites limitados de gateway e sessões/ingresso; preservar o aceite OPS R8 e requalificar a composição final.
2. Fechar fronteira instalada, CI, operações e segurança com revisão independente válida; nenhum autoverdict do Builder é aceite independente.
3. Concluir suíte completa/cobertura crítica, variante física sem produto, PostgreSQL dedicado, E2E, tipos/lint/formato/links, builds, mutação, scanners, SBOM/licenças e certificação; requalificar imagens e programa local3500/3501 preservando journal.
4. Promover somente paths próprios após todos os gates e revisões exigidos, commit local sem push. Preparar pacote T4 congelado antes de chamada externa. Produção/piloto/release e decisão clínica D2 continuam separados.

Ledgers99/20/30 recebem apenas blocos próprios, com staging parcial e preservação byte a byte de todo dirty anterior. Evidências físicas persistem em `/home/ricardo/.cache/cvg-harness-green-20261004`, fora de /tmp; checkpoints e artefatos próprios são versionados por caminho. Serviços3400/3401 preservados.

`last_completed_action`: recibos R8 com aceite independente e regressões integradas atuais; falhas completas/neutral preservadas. `next_action`: concluir gates e críticas em andamento e fechar pendências. `status: IN_PROGRESS`.

[Checkpoint41](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-44-compiled-health-and-timing-frontier.json) vincula as evidências atuais. Checkpoints anteriores são históricos, inclusive falhas preservadas, e não certificam a fonte futura.
