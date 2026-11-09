# 0403 — Preparação compartilhada da fixture do validador de captura

Task `GBRAIN-LOOP-U13-RC08-FIXTURE-0403`. Trilha **T2**, somente helper privado de
teste; sem alteração de contrato público, segurança, identidade, schema ou efeito
externo. Corrige preparação de corpus usado por testes, não o controller0238.
Autoridade: objetivo do usuário de concluir pendências, D-12 da
[constituição](../07_agents/AGENTS.md) e qualificação local de
[U13](0399_backlog_producao_aud0624.md#u13). Nenhuma autorização T4 ou produção.

## Recon e WHAT

A [certificação compostaR1](../04_audit/evidence/GBRAIN-LOOP-20261023/u13/certification-composed-r1/REPORT.md)
terminouNO_GO:15gatesPASS,unit com cinco timeouts RC08. Coveragecanônica passou
os7222casos; observação isolada dos66originais passou. A causa da primeira demora
continua desconhecida e nenhum desses positivos apaga o FAIL da barra ampla.

A [prova anterior ao patch](../04_audit/evidence/GBRAIN-LOOP-20261023/u13/fixture-lifecycle/recon/REPORT.md)
mostrou uma falha específica do helper: com duas chamadas pendentes, ele admite
dois produtores, pois guarda somente o valor após await. Produtor com barreira
injetada, corpus físicoD1 e validador real; controles de cache concluído/clones
passaram e a guarda de construção única falhou2≠1/exit1 esperado. Isso prova
duplicação pendente, não a causa da primeira demora global.

O arquivo também já executa, em sua tabela de precedência, exatamente o cenário
`query:'/v1/messages?beta=false'`, publica seus bytes reais e valida o relatório.
RC08 refaz essa mesma preparação apenas para obter o corpus dos mutantes.
Reaproveitar esse corpus evita publicação duplicada, mantendo a coleta física
no cenário existente e um caminho frio independente quando só RC08 é selecionado.

## Escopo e invariantes

Único path de código: `tests/claude100/reference-capture/controller.test.js`, em
nova candidata própria baseada9a56 mais os17arquivos já congelados de U13.
R1/candidata antiga/evidências permanecem intactas. Não alterar runtime de captura,
SPEC0238, pins, bootstrap, validador, módulos de produção, produto, lock ou CI.
O teste não integra os22paths de CAPTURE_SOURCE_PATHS; seus hashes ficam iguais.

Preservar literalmente títulos/tabelas/callbacks/assertions dos66casos originais
por comparação AST/texto e por execução. Default15s e exceção original60s para
filho travado permanecem. Nenhum skip/retry/filtro no arquivo completo, alteração
de limite, fake clock, retirada de fsync, publicação em RAM ou relatório fabricado.
O método run continua executando o controller para cada chamada explícita dos
testes de integração; não passa a responder com cache para esses testes.

## HOW

1. Registrar apenas o caminho de saída de uma captura que use o perfil exato:
   knobs com somente a propriedade query de dado, igual à string acima;
   options ordinário vazio, sem perfil customizado/base/out/manifest/during/
   createEvidence; resultadoINCOMPATIBLE_TRANSCRIPT/exit1. Rejeitar para reuso
   qualquer outro perfil, inclusive knobs adicionais ou options herdados.
2. O loader RC08 usa esse caminho já publicado, se disponível. Caso contrário,
   executa run com os mesmos knobs/defaults originais e lê seus arquivos reais.
   A ausência do cenário anterior não impede execução isolada dos mutantes.
3. Guardar a promessa da inicialização antes de qualquer await. Chamadas
   sobrepostas aguardam a mesma preparação. Falha permanece rejeitada para todos
   os consumidores, sem reset/retry automático neste arquivo de teste.
4. Validar o corpus original com assertEvidence real antes de oferecê-lo aos
   mutantes. Corpus inválido falha a preparação fora da assertion que espera
   rejeitar um mutante; não pode tornar os testes negativos vacuamente verdes.
5. Cada consumidor recebe structuredClone do report e Map com Buffer.from de
   cada artefato. Nenhuma mutação de um caso altera o corpus ou os próximos.
   Cache permanece local ao módulo/arquivo de teste; nenhum singleton externo,
   export novo, arquivo de corpus pronto ou alteração de ciclo do runtime.

## Oráculos e aceites congelados

| ID  | Prova exigida                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 | Controle anterior com helper original registra2admissões para2waiters; RED esperado preservado e distinto de erro de setup                                    |
| F02 | Inicialização fria concorrente admite1loader, gera clones independentes; depois de resolvida continua1                                                        |
| F03 | Erro de loader é compartilhado e persiste sem retry; corpus inválido é recusado antes de qualquer mutação                                                     |
| F04 | Reuso só do perfil exato; variantes/querycustom/optionscustom/resultadoincompatível não fornecem corpus ao cache                                              |
| F05 | Todos66títulos/tabelas/callbacks/assertions antigos preservados; quatro novos casos exercitam concorrência/clones, errosticky, corpusinválido e elegibilidade |
| F06 | Arquivo completo70casos e RC08 frio original11casos executam; nenhum resultado filtrado é qualificação global                                                 |
| F07 | Controles ruins em cópias próprias: remover singleflight, validação, clonagem ou guarda de perfil é detectado; fonte correta fica igual                       |
| F08 | Runtime22pins e17fonte U13 byteiguais; somente o arquivo permitido muda; arquivoBase972bbd08 e lockfile preservados em evidência                              |
| F09 | Revisão independente da fixture/oráculos; Node22 typecheck/lint/npmtest/PG/E2E e nova certificação completa da fonte resultante, sem importar PASS de R1      |

Os quatro controles novos podem injetar loaders/barreiras somente para testar o
helper. Os66casos antigos mantêm seus módulos, transporte simulado e FS reais
originais, sem novos mocks. Asserções de concorrência, falha e isolamento usam
corpus realmente publicado e validado pelo caminho existente como seed.

## Gate, revisão e encerramento

Gate local de BUILD: task/claim registrados, reconRED verificado, SPEC com
escopo/barra/oráculos definidos, pré-imagens e22pins preservados. Lead confirma
IMPLEMENTATION_READY_T2 antes de alterar a nova candidata. Se o desenho exigir
mudança em API/política/segurança/contrato0238, parar e classificar pela trilha real.

Uma implementação e revisão da fixture, até2pareceres e1retrabalho agrupado;
sem reset. ReceiverCodeR2 continua com seus2pareceres/1grupo encerrados, sem nova
review do runtime ou reabertura pelo nome desta task. O novo crítico inspeciona
somente o delta de fixture e seus controles, com dependências congeladas.

Concluir só após F01–F09 verificados no escopo apropriado. Enquanto faltar gate
global, registrar IMPLEMENTED/REVIEWED_LOCAL e pendência explícita. Se a barra
falhar, preservar e investigar; não repetir até passar. Qualificação nova não
reclassifica R1. U13/SRV01/U16/segunda máquina/canal real/T4/produção continuam
abertos; integração e push dependem dos gates e autorizações vigentes.

## Resultado de AUDIT — 23/10/2026

Gate aprovado/freeze original desta SPEC: SHA256
fdd0643a3ec48ab183bf83d66796224f5ca566f7accc7afc109e12acbb7acf71,
preservado no [pacote terminal](../04_audit/evidence/GBRAIN-LOOP-20261023/u13/fixture-lifecycle/certification-r1/approved-spec0403-before-audit-append.md).
Este acréscimo registra resultados, sem alterar contrato ou aprovar novo BUILD.

F01–F08 têm provas locais e revisão independente Singer APPROVE_SCOPED, sem
obrigatórios, uma rodada/zero retrabalho. F09 continua NÃO SATISFEITO: a
certificação nova5424/fd311435 terminou exit1/NO_GO,14gatesPASS e2FAIL.
Unit7226PASS/0skip/507files,70fixturePASS/66nomes e ordem preservados;typecheck,
lint,PG338 eE2E12 atuaisPASS. Coverage7221PASS/5timeouts originais15s,causa
não estabelecida;securityexit1/Zod4.3.6HIGH. Crítico/mutação NOT_RUN após a
falha do comando à esquerda da cadeia &&; não usar JSONs herdados como provas.

[Inventário e atribuição de metadados](../04_audit/evidence/GBRAIN-LOOP-20261023/u13/fixture-lifecycle/certification-r1/lead-verification.json):
66snapshots/SHA/2365inputs/18fontes/22pins íntegros;vínculo E2E atual verificado.
Banco descartável próprio removido após0clientes/PIDs ausentes/portas livres;
nenhum recurso de par alterado. Estado IMPLEMENTED/REVIEWED_LOCAL,
GLOBAL_QUALIFICATION_NOT_ACCEPTED. Investigar antes de repetir; não aumentar
limites, retirarfsync, publicar emRAM ou resetar revisão por novo nome.
Correção da dependência0405 pertence ao CLOSE e requer fonte nova/gates atuais.
U13 operacional/T4 e produção permanecem abertos.
