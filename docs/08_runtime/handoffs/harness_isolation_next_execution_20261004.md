# NEXT-D1/NEXT-D2 — execução local — 04/10/2026

Estado da rodada: ENCERRADA / GLOBAL FAIL / SEM PROMOÇÃO. Um ciclo de implementação e uma revisão nova foram executados por frente. C1 recebeu REJECT técnico com parecer INVALID por desvios de execução; PV10 recebeu INVALID sem certificado de aceite. As fontes permanecem congeladas nas cópias isoladas. Não há novo BUILD ou review concedido neste ciclo.

## Autorização e limites

Resposta literal do usuário: “Autorizo NEXT-D1 e NEXT-D2 conforme o pacote: um ciclo em cópia isolada e uma revisão nova por frente. Mantenho NO_MODEL e as condições anteriores de promoção, sem push, provider real, dados reais, piloto ou produção.”

Packet aprovado: [sessão de decisão](harness_isolation_weekly_decision_20261004.md), SHA-256 `602d8f6957804a4361206bd68a3ac64cd834d5a2b8b30f6e86e3d15f4fa7934e`. Claim HARNESS_ISO_NEXT_EXEC_20261004 precedeu as escritas. SPECs 0179/0180 aprovadas foram preservadas. NO_MODEL clínico inclui dados sintéticos; D2 continua aberta. Os 24 critérios originais permanecem exigidos e só HISO-001 está DONE.

## C1 — fronteira do Operational Harness

O candidato preservou os 136 testes originais e adicionou 15, passando 151/151. Passaram 116/116 controles conhecidos, incluindo 14 históricos, 11 negativos R2 e 38 positivos. O scan instalado ficou INCOMPLETE com 496 diagnósticos, sem aceite global de HISO-005.

Nash realizou a revisão nova sem contexto herdado. Declarou INVALID por uma execução inicial com fixtures em /tmp e exposição incidental de argumentos de processos, ambos registrados. A avaliação técnica foi REJECT: dez contraexemplos executam o marcador sintético do produto e dois usam resolução neutra desconhecida, recebendo falso PASS. O Lead reproduziu os 12/12 casos com o mesmo checker congelado; esta medição não é uma nova crítica nem um novo ciclo de código. Hashes e os 2.364 itens do manifesto do crítico foram conferidos. A falha concentra-se em aquisição de node:process por default nomeado, namespace/default e import dinâmico, inclusive através de dependências npm físicas.

Evidência persistida: [relatório do crítico](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/next-exec-20261004/boundary-critic-report.md), [contraexemplos completos](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/next-exec-20261004/boundary-rejection-fixtures.json) e [reprodução do Lead](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/next-exec-20261004/boundary-lead-replay-results.json). Nenhum arquivo fonte C1 foi editado após o início da crítica.

## PV10 — consumidor separado

O Builder corrigiu somente assistant.ts, first-vertical.test.ts e um novo arquivo de testes PV10 na cópia própria. Organizador, schema, journal, contratos e core foram preservados. Passaram 290 testes em nove arquivos, com controles de falha permanente, exaustão de cinco tentativas, replay, reinício e SIGKILL. Os resultados do Builder são implementação privada, sem aceite independente.

A preparação da revisão inicialmente olhou um bundle antigo em dist da cópia canônica. O crítico foi pausado antes de julgar; o pacote recebeu o bundle realmente executado pelo Builder, com SHA-256 `41350c4d6eec73b33195bb419536cbbebf603056bf29a79ed577b9b43f21f9da`. O mesmo crítico Aristotle retomou a única revisão autorizada, sem mudança da fonte. Não houve segunda revisão.

Parecer final: **INVALID / FAIL_TO_CERTIFY**. Os 14 alvos PV01–PV14 foram observados passando, porém nenhum foi aceito formalmente. A regressão independente passou 290/290 em nove arquivos, sem skips, com os 37 cenários originais e 40 controles de fundação preservados. Foram executados 11 cenários próprios de API pública, oito combinações do bundle exato WAHA/Evolution com endpoints sintéticos e quatro SIGKILL adicionais nas tentativas 2/5. O contador calibrado de chamadas de modelo ficou em zero.

A invalidação decorre da symlink .vite do clone: Vitest alterou um arquivo de cache nas dependências emprestadas da cópia canônica, fora da área autorizada de escrita. Fontes, 145 inputs selados e bundle permaneceram MATCH; não foi observado defeito comportamental do candidato. A violação foi preservada, sem restauração do cache para ocultá-la. Os 2.396 itens do manifesto dos outputs foram conferidos pelo Lead. [Parecer integral preservado](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/next-exec-20261004/product-critic-report.txt), [matriz formal](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/next-exec-20261004/product-critic-decisions.json) e [drift de cache](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/next-exec-20261004/product-critic-cache-drift.json). PISO-003 permanece IN_PROGRESS, sem aceite integral.

## Gates e baseline

Typecheck, lint, build público do produto/API e smoke PASS, com fontes/configurações/documentos MATCH. A primeira suíte ampla com PostgreSQL resultou em 2.978 PASS, quatro FAIL e um skip, em 338 arquivos físicos. Os quatro FAIL pertencem ao finalizador E2E de CI, que exige Git local na cópia; o skip ocorreu porque duas flags foram configuradas como true em vez de 1. A preparação foi corrigida apenas em metadados privados e ambiente. A recuperação focada passou cinco testes em dois arquivos, sem skips; não transforma a primeira suíte em PASS. E2E: 11 PASS, um FAIL visual, zero retries, sem skips. O PostgreSQL dedicado passou 288 testes em 35 arquivos, como subconjunto da suíte ampla.

A variante sem products/ teve 2.684 PASS e três FAIL em 329 arquivos físicos, sem skips; seis casos não foram coletados porque faltava o frozen-anchor histórico na preparação. As três falhas coletadas vieram da política documental exigindo 20 destinos do consumidor removido. A recuperação de preparação preservou a política original e suas asserções, restaurou somente o anchor histórico da cópia própria e usou DOC_LINK_POLICY externo para excluir os 20 destinos da variante neutra. Passaram 71/71 testes focados em três arquivos, sem skips. Typecheck e build público da API neutra passaram. A primeira suíte neutra permanece FAIL; não foi inventada uma execução ampla final verde.

O checker de links dos documentos próprios passou. A higiene global encontrou 73 pendências históricas de artefatos vazios, sem erros nas evidências novas. O catálogo compartilhado está dirty e foi preservado; a higiene global não foi declarada PASS. [Resumo de gates e primeiros failures](../../04_audit/evidence/HARNESS-ISO-EXEC-20261003/next-exec-20261004/integration-gates-summary.json). Suites do produto, PostgreSQL, recoveries e neutra se sobrepõem; seus totais não devem ser somados.

A baseline histórica tem 340 arquivos e 2.837 testes. Quatro arquivos alheios com 23 testes continuam ausentes da cópia; dois novos arquivos não substituem essas identidades. A condição noLostTests é FAIL, além dos outros gates reprovados. R2-D3 não permite promoção neste estado.

## Continuidade dos ledgers — entradas propostas

Os ledgers 99, 20 e 30 continuam mistos e modificados sob autoria registrada AP-LOCAL-20261001/Codex, sem liberação comprovada. A regra 5 de coordenação exige preservar esses arquivos; este handoff contém as entradas próprias para integração pelo owner, sem alegar que já foram escritas.

- Runtime 99: registrar execução autorizada NEXT-D1/D2 em cópias isoladas, fonte congelada, C1 INVALID/REJECT com 12 falsos PASS reproduzidos, promoção não autorizada pelos gates e NO_MODEL mantido.
- Execution log 20: registrar comandos/hash manifests, uma revisão por frente, os primeiros failures e as correções de preparação, sem somar suites sobrepostas ou omitir skips.
- Backlog 30: HISO-005 permanece aberto; PISO-003 continua IN_PROGRESS: comportamentos PV01–PV14 observados PASS, mas parecer formal INVALID e aceites completos pendentes. Coordenar os quatro arquivos/23 testes e ledgers antes de qualquer integração. Não marcar critérios DONE por contagem de testes.

## Roadmap de retomada

1. Coordenar autoria e entrega dos quatro arquivos de baseline e dos ledgers, mantendo seus hashes e asserções.
2. Levar os contraexemplos concretos C1 à sessão de decisão; um novo ciclo/review depende de nova concessão explícita. O ciclo atual encerra sem correção adicional.
3. Apresentar PV01–PV14 com comportamento observado PASS e parecer INVALID. Uma nova revisão exige concessão explícita; preparar runner que recuse escrita de cache fora da allowlist. Investigar o failure visual E2E e obter gates completos do candidato final sem apagar os primeiros failures.
4. Após os aceites aplicáveis, montar candidato final com baseline completa e repetir seus gates como um conjunto. A promoção permanece commit local por caminho, sem push, e exige todas as condições anteriores.

Os patches da implementação privada foram persistidos, com hashes e verificação contra preimages. Scratch durável próprio: /home/ricardo/.cache/cvg-harness-next-exec-20261004. Logs brutos permanecem privados, sem dependência de /tmp para retomada. Não utilizar git clean, restore ou reset em artefatos alheios.

## Encerramento e recuperação

Os agentes foram encerrados e somente o container PostgreSQL próprio cvg-hiso-next-pg foi parado após verificação da label do claim. Recursos alheios e sandbox 3400/3401 foram preservados. SPECs aprovadas, packet, 93 fontes do produto e dois arquivos C1 mantiveram os hashes congelados. Os ledgers compartilhados continuam aguardando integração pelo owner.

Commits locais de checkpoint: 8183630 e 0caea00; o commit de encerramento contém somente documentação/evidência própria, incluindo notas de backlog. Não há commit de promoção de código do produto ou de deleções do consumidor antigo, nem push. O objetivo integral permanece não concluído; 23 dos 24 critérios continuam sem aceite integral. O encerramento deste ciclo FAIL não equivale à conclusão do objetivo.
