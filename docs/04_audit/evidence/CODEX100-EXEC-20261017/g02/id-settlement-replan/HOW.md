# Respostas de IDs declarados antes do EOF

Task `DX100-G02:SETTLE-SOURCE-ID-ROUNDTRIPS`, referência somente, sem BUILD
nativo CVG. [Replan](replan.json), [contrato](contract.json), [casos](cases.json),
[driver](driver.py), [runner](run.py), [diff](runner-parent.diff) e
[controles do observador](observer-data-controls.json). Execução permanece
bloqueada por `review-status.json` até aceitar os hashes desta unidade.

## Causa e mudança material

A [unidade anterior](../lossless-wire-probe/REPORT.md) encerrou sua única
tentativa com quatro echoes e oito casos de fonte sem resposta até o EOF.
Barreira e target eram enviados em paralelo; fechar stdin após a barreira não
comprovava conclusão do target. A fonte permite dispatch assíncrono e remoção
da conexão antes de todas as escritas pendentes. Isso é fator de confusão,
sem provar a causa individual de cada ausência. Os budgets, raws e conclusões
anteriores permanecem congelados, sem segunda tentativa naquela unidade.

O novo contrato exige resposta correta antes da próxima escrita. Os 12 IDs
declarados como string/i64 passam pela mesma conexão, em ordem, incluindo os
extremos i64, valores adjacentes a 2^53, número versus string e string vazia.
Não se estendem deadlines ou quotas para obter o resultado. Todos os 23 casos
históricos estão retidos byte a byte no plano; os 11 tokens de borda continuam
OPEN para um contrato de gramática separado, sem execução ou crédito aqui.

## Ordem comprovável

Uma conexão nova, um processo stdio: initialize → resposta initialize →
target1 → resposta target1 → … → target12 → resposta target12 → barreira →
resposta barreira → EOF. Só initialize e `thread/list limit1` são enviados;
`explicitGatewayOauth=true`, home vazio e privado. A barreira final não é
tratada como fence das operações anteriores.

Cada escrita tem bytes exatos em NDJSON, intervalos, SHA-256, flush e os
contadores de mensagens e respostas já observadas. O ledger de respostas tem
índice do frame, ordinal do pedido, bytes já recebidos e tipo do ID. O ledger
de EOF exige os 14 pedidos resolvidos antes de fechar stdin. A verificação
depois do runtime deve reconstruir a ordem dos frames e conferir esses
contadores; não basta confiar no texto de sucesso do driver.

O limite inferior também é obrigatório: nenhuma resposta já recebida pode
resolver um pedido ainda não escrito. Antes e depois de cada drain, o prefixo
de mensagens recusa IDs futuros/não escritos e duplicatas. O índice do frame
precisa ser maior ou igual ao número de mensagens recebidas antes da própria
escrita; o início do frame em bytes precisa estar depois do prefixo stdout
já recebido naquele instante. Isso recusa tanto resposta completa em cache
quanto frame parcial anterior à escrita. O leitor independente verifica esses
limites inferiores e o limite superior da próxima escrita/EOF.

Cada resposta precisa ter ID com tipo e valor exatos e resultado de histórico
vazio da fixture. A validação final do Capture exige uma e somente uma resposta
por cada um dos 14 IDs; duplicata tardia, ID desconhecido, envelope ambíguo ou
pedido servidor→cliente inesperado reprovam. Não existe resposta automática a
pedidos de servidor. Notificações ficam separadas das respostas.

Falta de echo, erro ou ID errado encerra a tentativa como FAILED, com causa e
raws preservados. A observação anterior não é editada para apagar as lacunas.
O sucesso desta unidade comprovaria somente esses 12 positivos na fixture e
nessa conexão; não os 11 edges, outros campos numéricos, plataformas, SDK ou
o motor CVG. Bytes de entrada/saída são a autoridade; nenhum ID é convertido
para Number de JavaScript ou normalizado para string.

## Reuso, proveniência e contenção

O Capture, guard externo e guard interno aceitos são reusados sem alteração.
O runner deriva do anterior mudando somente o prefixo da tentativa; copia o
novo plano e o módulo base pinado para `/control` readonly. O módulo base é
importado sem executar seu `main`. A lógica nova é o lifecycle de espera,
as validações dos 12 positivos e o ledger de precedência.

Mesmo ELF5cce7264, sourcepin8d9, build387a terminal0 e cadeias de verificação
de compilação/source/native/vendor/Rust conferidas antes do exec. Sem patch de
versão, novo build, CLI instalada substituta ou import do código de aplicação
CVG. A SPEC0231 segue congelada/human-pending, com a pergunta existente.

Mesmas guardas: dupla namespace offline com clearenv, sem home, credenciais ou
sockets reais; ELF/native/control/usr readonly e apenas home/tmp sintéticos
graváveis. Coletor e arquivos de evidência ficam fora dos mounts graváveis do
alvo. Prefixos confiáveis comprovam kernel/ambiente/mounts/namespaces antes de
executar o ELF.

Scope próprio4GiB, CPU2,256tasks,zero swap,180s; supervisor185s, capture75s e
resposta20s. MemAvailable mínimo16GiB, disco mínimo8GB no início e reserva6GB
durante execução;8MiB de captura e512MiB de monitor/preservação. O limite de
disco é monitor periódico, não quota de kernel. A cópia das evidências exige
scope inativo/cgroup vazio e reserva final adicional. Só processos próprios
podem ser encerrados. Primeira causa, secundárias, journal e SHA final ficam
preservados. Esses controles não são relaxados nesta unidade.

## Barra e orçamento

Dezoito controles de dados iniciais passaram com Popen bloqueado, zero chamadas e sem
carregar o módulo base ou o ELF. Rejeitam perda de casos/edges, alias, ID com
tipo errado, boolean/float/overflow como i64, colisão com controle e resultado
incorreto. Eles não comprovam a ordem real de IO; a crítica e a reconstrução
dos raws continuam necessárias.

O reparo agrupado R1-01 acrescenta controles de prefixo/ordem: resposta fonte
futura, barreira antecipada, o trace inteiro de 14 respostas recebidas após
apenas initialize, cache anterior à própria escrita, frame parcial anterior,
duplicata e casos válidos com notificação intercalada. Os originais R1 ficam
arquivados; os 26 controles de dados (18 iniciais e oito de ordem) passaram com
zero Popen, incluindo a rejeição do contraexemplo R1 completo. A execução
continua bloqueada até a última revisão HOW R2.

Um crítico novo, no máximo duas revisões totais e um retrabalho HOW agrupado.
Se R1 aprovar, R2 pode avaliar o runtime; se pedir reparo, R2 é a última HOW e
o Lead reconfere o runtime. Uma execução, zero retries automáticos. Esse budget
pertence à nova hipótese de espera e não reabre o budget anterior. Nenhuma
tentativa viva pode ser reiniciada por timeout de observação.

Antes do alvo: HOW aceito por hashes e preflight atual. Depois: 14 escritas e
respostas, 12 IDs positivos, ordem antes do EOF, guardas, cleanup, SHA e revisão
aplicável. Todo mismatch permanece falha, sem fixture/guard enfraquecido ou
repetição automática. Produção, provider, modelo, tool/exec, login, efeito real,
SQL/SDK/CLI CVG, gates de aplicação, commit/push/deploy estão fora deste recorte.
487+22,49cartões,22famílias e jornadaCQ01–14 continuam obrigatórios e sem recibos
funcionais concedidos por medir a referência.
