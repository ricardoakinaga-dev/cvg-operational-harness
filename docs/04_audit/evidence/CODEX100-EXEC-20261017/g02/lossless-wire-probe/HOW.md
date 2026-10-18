# Referência contida — domínio dos IDs no wire

Task `DX100-G02:OBSERVE-LOSSLESS-WIRE-ID-DOMAIN`, análise do artefato de
referência; nenhum BUILD funcional CVG. [Contrato](contract.json),
[23 casos](cases.json), [driver](driver.py), [runner](run.py),
[diff do runner aceito](runner-parent.diff) e [controles puros](observer-data-controls.json).
Estado inicial: HOW pendente, execução bloqueada por `review-status.json`.

## Experimento e fronteira da inferência

O ID7 anterior não comprova o domínio i64. Este experimento retém os bytes de
12 IDs declarados como string/i64 e 11 tokens de borda: limites i64 e overflow,
valores adjacentes a 2^53, string equivalente, string vazia, decimal, expoente,
zeros negativos, null, boolean, objeto e array. Os casos não são equivalência
aprovada nem implementação do parser CVG.

Cada caso cria um processo stdio novo do mesmo ELF pinado, inicializa com
`explicitGatewayOauth=true`, envia `thread/list` com o token bruto como ID e
uma segunda leitura vazia com ID `barrier`. O driver espera a resposta da
barreira e fecha stdin, coletando até EOF. As duas leituras podem responder em
ordens diferentes; uma resposta do target após a barreira continua registrada.
O home privado é compartilhado somente entre os processos desta tentativa;
nenhum caso cria thread ou consulta modelo. Cada conexão começa sem initialize.

Ausência de resposta significa apenas que ela não foi observada até o EOF
dessa fixture. Não é prova de timeout universal, de rejeição ou de ausência de
qualquer efeito interno. O alvo pode tratar uma borda como request, ignorá-la,
produzir erro ou outra representação; nenhum desses resultados é forçado como
condição de sucesso. Os controles initialize/barrier precisam funcionar e
encerrar corretamente para vincular a observação ao experimento.

`requests.ndjson` e stdout/stderr brutos são a autoridade lexical e numérica.
Cada escrita tem intervalo, digest e registro de flush; os frames de saída
têm intervalos e digests. Diagnósticos parseados em Python preservam inteiros,
mas não substituem os bytes para decimais, expoentes ou zeros negativos. IDs
de controle são strings distintas dos tokens do target. Fonte declarada com
echo diferente recebe indicador de mismatch, nunca MATCH funcional. A saída
global registra observação completa dos 23 casos, não paridade aprovada.

## Reuso e controles do observador

O driver importa somente o módulo pinado do coletor já aceito, sem chamar seu
`main`. `Capture`, isolamento interno, pipe draining, limite de 8MiB, timeout,
guard prefix e preservação da primeira falha permanecem os mesmos. O controle
original fica readonly e é copiado para `/control/base-driver.py`, com digest
prescrito no contrato. A nova lógica escreve apenas as três mensagens por
caso, conserva o wire e classifica diagnósticos.

O runner deriva do anterior com três deltas explícitos: valida também o plano
de casos no gate de revisão, copia o módulo base/plano para o controle readonly
e usa prefixo de tentativa distinto. O guard interno mantém sua whitelist
anterior de quatro argv seguros; este driver invoca somente stdio. Nenhuma
mudança é feita nos pacotes aceitos, no ELF, no upstream ou no runtime CVG.

Dezesseis controles de dados do observador passaram, com Popen bloqueado e
zero chamadas: dois positivos, 12 adulterações rejeitadas e duas diferenças
numéricas/de tipo registradas como mismatch. O módulo base e o ELF não foram
carregados nesses controles. Não são testes funcionais de Codex ou CVG.

## Contenção, recursos e proveniência

Antes do ELF: mesmo build387a terminal0, verificador aceito em modo check,
SHA/tamanho/perfil/pin e oito controles de compilação conferidos, além dos
inputs executáveis base desta unidade. MemAvailable mínimo16GiB e disco livre
mínimo8GB. Scope próprio:4GiB, CPU2,256tasks,zero swap,180s; supervisor tem
timeout185s. Cada captura tem limite8MiB e deadline75s herdado; o limite global
encerra a tentativa se o conjunto não terminar no orçamento.

O coletor fica fora do namespace gravável do alvo. Duplo bubblewrap com rede,
PID e mounts isolados, clearenv, sem home/config/credenciais/sockets reais;
ELF/native/control/usr readonly, somente home e tmp sintéticos graváveis.
Os guards comprovam ambiente/mounts/namespaces antes do exec; o guard externo
confere os limites no cgroup real antes de iniciar o namespace/coletor.

Monitor de armazenamento512MiB e reserva6GB durante a execução; não é quota de
kernel. Preservação limitada512MiB e reserva final adicional; cgroup vazio
precisa estar comprovado antes de copiar dados. Cleanup só alcança o scope e
grupo de processo próprios. Causa primária, causas secundárias, logs, journal,
ELF final e saída/estado do cgroup são guardados. Logs de qualquer falha ficam
preservados, sem enfraquecer asserções para um resultado verde.

## Orçamento e aceitação

Um crítico independente, no máximo duas revisões totais, um retrabalho HOW
agrupado. Se R1 aprovar, R2 pode revisar os artefatos runtime; se R1 pedir
reparo, R2 é a última revisão HOW e o Lead reconfere o runtime. Até uma execução
de experimento e zero retries automáticos. Preflight sem alvo não é observação
executada; nenhuma tentativa viva pode ser reiniciada por timeout de polling.

Antes de rodar: aceitar HOW por hashes dos cinco inputs, fontes e cadeia
executável; só então abrir `review-status.json`. Depois: conferir todos23casos,
69writes, controles/frames/bytes/guardas/exit/cleanup e recomputar o diagnóstico
diretamente dos raws. Um mismatch de fonte fica explícito; parcial/falha não
recebe aceite de observação completa.

Não há modelo, tool/exec, login, serviço remoto, provider, dado institucional,
SDK, código de aplicação CVG, schema SQL, grant ou release. SPEC0231 continua
congelada e aguardando a pergunta humana existente. O programa22famílias,
49cartões,487obrigações funcionais+22controles e jornadaCQ01–14 permanecem
inteiros e sem recibos de paridade por esta análise de referência.
