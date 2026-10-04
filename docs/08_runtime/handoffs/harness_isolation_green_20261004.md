# GREEN — continuidade do isolamento e correções locais

Data: 04/10/2026. Task: `HARNESS_ISO_GREEN_20261004`. Estado: `IN_PROGRESS`; produção `NO_GO` enquanto os gates finais e os controles aplicáveis não forem comprovados. Harness e Assistente de Plantão têm artefatos, processos e barras próprios.

O usuário pediu correção contínua e testes em condições de produção. Essa autorização mantém as correções e novas revisões locais em andamento. As SPECs 0179/0180 e a emenda OpenAI exclusivamente sintética foram aprovadas para BUILD local. Provider real depende do pacote T4 final congelado. Dados reais, push, piloto, implantação e produção não foram concedidos nesta execução.

## Evidência atual

- [Checkpoint 09](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-09-complete-suite-mutation-and-r4.json): suíte completa com PostgreSQL, 3.248 testes em 363 arquivos, 3.247 PASS, um FAIL, zero skips e fonte MATCH. A falha era o hash antigo do manifesto de mutação; foi corrigido somente o hash. Os dez mutantes reais foram mortos. O conjunto completo anterior continua registrado com sua falha.
- [Checkpoint 10](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-10-d009-composed-coverage.json): suíte completa com PostgreSQL e cobertura passou em 3.332 testes, 367 arquivos, zero falhas e zero skips. Cobertura global e crítica passaram, sem reduzir limites. Inventário conserva todas as 3.248 asserções anteriores e adiciona 84. Essa execução precede a correção posterior R6 e não substitui a certificação final.
- D009 integrado na cópia própria: 14 arquivos conferidos por hash, normalizador público e orçamento durável com writer exclusivo, fsync, recuperação conservadora e diagnóstico antes de sucesso. Default clínico permanece NO_MODEL. Teste do conjunto após correção R6: 497 PASS em 45 arquivos, zero skips, fonte MATCH; não somar esse subconjunto aos testes completos. Tipos e lint globais PASS. Crítica independente nova em andamento.
- Operações: 422 testes em 19 arquivos na rodada anterior, com pausa/retomada, journal, restore, alerta sintético recebido e supervisor. Esses resultados não certificam o código final nem o ambiente remoto.
- [Scanners reais](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/security-source-scan-r1.json): 21 alertas CodeQL, dos quais dez em fontes ativas; 100 achados Gitleaks. Resultados brutos preservados e correção/triagem pendentes. Audit npm zero não substitui esses scanners.
- C1: 191 testes e revisão restrita aprovados; scan instalado permanece INCOMPLETE com 441 diagnósticos. Não há aceite global de independência por esse scan.
- Programa local: API em `http://127.0.0.1:3500/health`, console em `http://127.0.0.1:3501/`, ambos responderam 200. É o sandbox sintético; a chave privada não aparece no console, na imagem, nos logs ou no Git. O arquivo .env está em modo 0600. Zero chamadas OpenAI realizadas.

[Checkpoint 11](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-11-observer-options-and-review-copy.json) preserva o defeito de callback assíncrono das opções do circuito, reproduzido e corrigido com os mesmos quatro controles de subprocesso Node. A primeira cópia do crítico omitiu dist de dependências por erro de preparação; não vale como revisão completa. A nova cópia confere todos os 17.345 arquivos de dependências e 48 links internos contra o candidato antes/depois da cópia, com dist presente. A revisão nova permanece pendente.

As evidências físicas estão em `/home/ricardo/.cache/cvg-harness-green-20261004`, fora de /tmp. Os checkpoints compactos registram caminhos e SHA-256. Certificação e promoção de fontes dependem dos gates do candidato final, não dos checks acima.

## Próximas ações e decisões

1. Terminar CI por escopo e variante física neutra; preservar todos os testes e o contrato anterior. Integrar somente paths próprios conferidos por hash.
2. Concluir cobertura com PostgreSQL e crítica independente de D009/D011; corrigir qualquer falha sem reduzir asserções ou limites.
3. [Emenda concreta de segurança](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/security-remediation-amendment.md), SHA-256 `9cc15c17d4c86dd165f4a2ba876046343f16146a557192f07558edead9470477`: revisão humana T3 solicitada, resposta pendente. Nenhum BUILD dependente dessa emenda iniciado. Os demais trabalhos autorizados continuam.
4. Congelar o candidato, executar os gates completos e as novas críticas, construir a imagem final e registrar os resultados. Preparar depois os pacotes T4 de OpenAI sintético e qualificação de rede, com hashes do artefato final.
5. Promoção e commits de fontes somente sob as condições anteriores: suites completas, PostgreSQL, E2E, regressão neutra e revisões válidas. Apenas commits locais por paths próprios; sem push.

[Roadmap 0369](../../03_build/0369_harness_product_isolation_roadmap.md) e [backlog 0370](../../03_build/0370_harness_product_isolation_backlog.md) preservam os 24 cartões originais. O estado histórico das rodadas anteriores não elimina os aceites atuais; nenhum novo DONE foi declarado nesta continuidade.

## Coordenação e ledgers

Os ledgers compartilhados 99, 20 e 30 continuam modificados por outros trabalhos. A regra 5 de [coordenação](../agent_coordination.md) exige preservar esses bytes e aguardar o owner. As entradas abaixo estão **propostas para integração**, não escritas nos ledgers:

| Destino            | Entrada proposta                                                                                                                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 99 — runtime       | GREEN IN_PROGRESS, candidato isolado, API3500/console3501 sintéticos; D009 integrado localmente e crítica pendente, D010 ativo, segurança T3 pendente, certificação final não emitida, produção NO_GO.                                        |
| 20 — execution log | Correção do hash de mutação com seletores preservados; dez mutantes mortos; integração D009 por hash e 493 testes PASS sem skips; scanners reais registrados com falhas preservadas; roadmap/backlog e evidências próprios em commits locais. |
| 30 — backlog       | Manter 24 cartões e aceites; executar CI/neutro, crítico D009/D011, correções de segurança após revisão T3, gates finais e packets T4. Sem inferir conclusão clínica, piloto ou produção.                                                     |

Commits próprios até este checkpoint: `ac9996e`, `237a237`, `31382af` e `3a4800f`. Arquivos alheios, ledgers e fontes PR-L04 preservados. O claim GREEN permanece ativo durante o trabalho.

## Atualização atual — gates compostos e contraexemplos novos

[Checkpoint 12](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-12-fresh-review-ci-console-image.json) registra APPROVE local válido de D009/D011: 497 testes e 33 probes independentes, pacote sem histórico, inputs completos MATCH. A revisão R2 anterior foi invalidada por acesso a história; seus probes não foram usados como aceite I1. O console real passou nove controles de revisão/confirmar/gestor/persistência, com zero chamadas de modelo.

[Checkpoint 13](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-13-full-suite-and-new-critic-findings.json) registra 3.470 testes/371 arquivos PASS com PostgreSQL e cobertura, zero skips e MATCH. Cobertura global, crítica, tipos e lint passaram. PostgreSQL dedicado288/35 passou e é subconjunto. A imagem atual passou hardening e fluxo ajuda/nota bruta/confirmação explícita com NODE_ENV production, dados sintéticos e zero modelo. A configuração inicial do smoke omitia o gestor obrigatório; corrigido o setup, sem alterar o programa. A captura contou o output declarado como novo input: processo0, três fontes MATCH, recibo exit3 preservado com disposição explícita.

Veredito global continua **FAIL**, produção **NO_GO**. CI recebeu REJECT por cinco falhas concretas: D009 não executável, agregado que aceita autoafirmação local, snapshots contraditórios/cobertura vazia aceitos, schema desconhecido e falta de prova física do consumidor público sem fontes. Operações recebeu REJECT por hold de orçamento apenas na readiness, documentos existentes0664 aceitos e receipt já associado recusado quando há 1.000 unmatched. Builders CI-R2 e OPS-R3 estão ativos em cópias disjuntas, com contraexemplos intactos e novas revisões posteriores. E2E foi interrompido para preparar dist público ausente na cópia nova; variante neutra com PostgreSQL/cobertura está em execução. Formatação pendente nos dois JSONs próprios de CI.

Nenhum desses resultados encerra os 24 cartões, aprova inferência externa ou autoriza promoção. Segurança T3 permanece aguardando a resposta já solicitada; não houve BUILD dessa emenda. Ledgers compartilhados seguem preservados, com entradas propostas para integração pelo owner. Commits documentais locais adicionais: `7e3dd31` e `cdb759c`.

## Continuidade — produção sintética e candidato CI-R2/OPS-R3

[Checkpoint 14](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-14-production-images-ci-ops-and-bootstrap.json) registra E2E anterior12 Chromium e15 em Chromium/Firefox/WebKit PASS, zero retries/skips. Neutro anterior2970PASS/3FAIL em349files:20 destinos do produto retirado eram exigidos pela política global. CI-R2 projetou somente essas entradas na variante, conservando checker/policy de origem e todos os testes;244 contratos e164 neutros focais PASS.28paths próprios verificados/24 copiados; inventário371originais+8arquivos novos,276fontes de coverage e34seals antigos intactos.

OPS-R3 integrou seis paths por hashes, com257 testes distintos PASS e os mesmos18probes antes15PASS/3FAIL, depois18PASS. O Builder alterou um cache descartável do Vitest e declarou a exceção; cache/dist/dependências não foram promovidos. Duas revisões novas com pacotes completos sem história estão em andamento. FullPG/coverage sobre CI-R2+OPS-R3 já executando; variante neutra nova em preparação com banco exclusivo55599.

Imagem limpa do harness7624sources sem produto/node_modules/dist foi construída e passou exports públicos compilados/live/ready em desenvolvimento. Produto reconstruído após OPS-R3 passou NODE_ENVproduction, ajuda/nota bruta/confirmação explícita, readonly/networknone/UID10001, zero modelo. Probe do entrypoint oficial do harness em produção, PG27migrations/roles separadas/RLS/inbounddurável/identidadeHMAC, revelou readiness200 e rotas503 por operatorSessionStore não composto. Falha bruta MATCH permanece; emenda de bootstrap SHA2559fec7558358dc03d28fd8eabf8d5c3416f31c217088641988375a5cee6b45 enviada para revisão T3 antes de qualquer BUILD. Segurança0159 continua pendente separadamente.

Gauntlet registra round1 FIX_RETEST; evidências limitadas não foram confundidas com aceite do fingerprint integral. Global FAIL/produção NO_GO, nenhum novo cartãoDONE, nenhuma promoção runtimeRoot/chamadaOpenAI/push/piloto/firewall. Ledgers99/20/30 continuam dirty de terceiros, com entradas propostas somente. Próximas ações: completar gates/revisões, aplicar apenas emendas explicitamente revistas, refazer imagens e freeze final antes de packetsT4.
