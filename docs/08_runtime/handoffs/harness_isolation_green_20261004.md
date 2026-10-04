# GREEN — isolamento e correções locais em execução

Data: 04/10/2026. Task: `HARNESS_ISO_GREEN_20261004`. Estado: `IN_PROGRESS`. Veredito global **FAIL**; produção **NO_GO**. Nenhum runtime foi promovido ao checkout compartilhado nesta rodada. Zero chamadas OpenAI, sem push, dados reais, piloto ou implantação. Harness e Assistente de Plantão mantêm artefatos, processos e barras próprios; os 24 critérios continuam exigidos, sem novo DONE.

## Estado verificado

A última suíte completa com PostgreSQL e cobertura executou **3.944 testes: 3.937 PASS, sete FAIL, zero skips**, em 387 arquivos. Duas falhas de configuração próprias foram corrigidas sem editar os testes originais. Cinco controles de CI excederam 15 segundos; a correção mantém o prazo e todos os denominadores. Seus 234 controles instrumentados passaram em scratch, mas esse recorte não cumpre os thresholds globais de cobertura e não é certificação completa. O primeiro reteste integrado encontrou seis literais de contagem desatualizados: a fonte nova do motor aumentou o denominador de 279 para 280. Esses controles próprios foram corrigidos e o segundo reteste está em curso. As falhas brutas permanecem preservadas.

Gateway R9: política e perfis imutáveis, chave de prompt sem colisão e relógio finito. **1.207 testes focados PASS**, zero skips, source MATCH. A emenda de limites de custo e identidade do modelo está aprovada para BUILD local. O Builder registra controles próprios e processos/HTTP reais, além de incompatibilidades em fixtures de gateway e uma falha de prazo no produto; adjudicação, reteste integrado e crítica nova pendentes. Não há declaração de suíte verde dessa frente.

O commit do motor `73669b8`, publicado pelo outro agente, foi reconciliado somente na cópia privada: 35 paths, oito testes novos e cinco deltas originais do dono, inventariados explicitamente. **1.406 testes focados com PostgreSQL PASS**, zero skips; tipos/lint PASS. A recuperação extraída do runtime foi preservada ao mover o replay para depois das verificações de vínculo. Esses recortes se sobrepõem; não somar 1.207 e 1.406 à suíte completa. O inventário conserva 371 paths originais e 34 adicionados; coverage conserva 275 originais e cinco adicionados, total 280.

Bootstrap R3 recebeu revisão independente nova com dois P2: cookie de operador bloqueia ingresso HMAC válido durante falha exclusiva de auth; claims explícitos de tenant divergentes são aceitos na fila do tenant canônico configurado. Não houve escrita em outro tenant. A nova emenda de sessões/ingresso foi aprovada; BUILD isolado ativo, PostgreSQL e main compilado obrigatórios. A revisão anterior executou 168 testes com PASS e 56 controles compilados, dos quais seis falharam como repetições dos dois defeitos, não seis defeitos distintos.

Segurança: scanner real repetido sobre a fonte atual registra **6.574 achados brutos**, todos com disposições individuais por posição e hash, zero desconhecidos/ausentes. O exit 1 do scanner bruto é preservado; o guard não declara zero alerts nem dispensa revisão independente. O último CodeQL ativo conserva dois avisos de API, com prova real de orçamento PostgreSQL entre dois processos e sessão durável. As disposições continuam I0. A compilação real conferiu 18 projetos, 765 inputs, 209 source maps e 703 arquivos do contexto executável, excluindo as 446 fontes históricas de auditoria. Essa prova não qualifica dependências da imagem nem substitui a crítica independente.

HISO-005 instalado permanece **INCOMPLETE com 306 diagnósticos**. Os 221 controles positivos/negativos e zero violações encontradas no grafo não aceitam automaticamente a fronteira desconhecida. Fechamento de CI remoto, imagem, neutralidade, segurança, gateway e produto permanece pendente.

## Autoridade e limites

SPECs 0179/0180 emendadas e BUILD sintético OpenAI foram aprovados pelos recibos históricos. Aprovações adicionais registradas: [segurança](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/security-amendment-user-approval.json), [bootstrap](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/production-bootstrap-user-approval.json), [custo/modelo](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/gateway-cost-model-user-approval.json) e [sessões/ingresso](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/inbound-session-tenant-user-approval.json). Nenhuma delas autoriza provider real ou produção. NO_MODEL para classes proibidas e entradas desconhecidas permanece; inferência exclusivamente sintética exige o pacote T4 final congelado e sua decisão separada.

`.env` privado permanece ignorado, modo 0600, sem chave em imagem, console ou Git. O sandbox local em 3500/3501 respondeu 200 em sua qualificação anterior; precisa reiniciar com a fonte final e repetir browser/journal. Os serviços antigos em 3400/3401 foram preservados.

## Continuidade concreta

1. Concluir custo/modelo e sessões/ingresso; adjudicar as fixtures incompatíveis sem apagar casos ou reduzir assertivas. Integrar por hash apenas os paths próprios em cópia privada.
2. Congelar o candidato combinado e realizar revisões independentes novas por frente. C1/CI/OPS/segurança têm pendências explícitas; autocrítica do Builder não é aceite independente.
3. Executar suíte completa com PostgreSQL/cobertura, gate crítico, variante física sem produto, PG dedicado, E2E nas três engines, tipos/lint/formato/links, builds, mutação, scanners, SBOM/licenças e certificação final. Requalificar imagens e processos compilados com papéis de dados/auth separados, falha/recuperação e restart.
4. Promover somente paths próprios após todas as condições anteriores; commit local, sem push. Preparar pacote T4 final hash-bound antes de chamada externa. Remote CI, piloto/release/produção e decisão clínica D2 continuam separados.

## Ledgers e evidência

Estado/log/backlog receberam blocos próprios no commit `c0de4c1`, com FAIL/NO_GO explícitos. O staging parcial incluiu somente esses blocos; todo conteúdo dirty anterior foi preservado byte a byte e ficou fora do commit. [Prova de preservação](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/ledger-integration-preservation.json). Entradas antigas não foram apropriadas como autoria própria.

`last_completed_action`: integração privada do motor, regressões focadas, compilação real e atualização parcial dos ledgers. `next_action`: concluir builds ativos e reteste CI, congelar fonte para gates/revisões finais. `status: IN_PROGRESS`.

[Checkpoint 22](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-22-engine-ci-compiled-closure-and-ledgers.json) contém números, limites e bindings. Evidências físicas persistem em `/home/ricardo/.cache/cvg-harness-green-20261004`, fora de /tmp. Os checkpoints anteriores conservam tentativas, falhas e contexto histórico; não substituem gates do candidato final. Versão anterior deste handoff preservada em Git até `c0de4c1`, SHA-256 `868a80e6b1f97066429b3a25dbc8f91c4233dec33e8a804337466e443bb428bc`.
