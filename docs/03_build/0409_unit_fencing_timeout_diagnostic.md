# 0409 — Diagnóstico delimitado do timeout da fixture de fencing

Estado: preparação técnica; execução ainda não autorizada. Task
`GBRAIN-LOOP-U13-FENCING-TIMEOUT-DIAGNOSTIC-R1`. Trilha T1 para preparar e revisar
o método; diagnóstico sintético de código existente, sem alteração de contrato
ou implementação do programa. Lead mantém o gate de execução separado.

## Problema e resultado exigido

A candidata local `7ec67531e9c01caaa0090e8d91112a0b67dd31f3162987ed1316117634c43253`
terminou a barra R2 com 7.436 casos aprovados e um caso que excedeu 15.000 ms.
O limite de 3.600 s da etapa unitária não foi atingido. A causa do atraso
permanece desconhecida; a rodada anterior passou neste caso e falhou depois
em outra etapa, sem conceder transferência de aceite.

Caso original:

```text
SPEC 0158 serving-role webhook replay preflight blocks serving boot after fencing constraint moved to another table
```

Fonte: `apps/api/src/__tests__/postgres-persistence-mode.test.ts`, SHA-256
`4152b272624a2a18d5ef7260d303cf95a570f0451efce60a2afca4f397613c9a`.
`withServingReplaySchema` cria papéis, executa as migrações, concede privilégios,
aplica a mutação, verifica o boot com o papel de serviço e limpa os recursos.
Todas essas operações pertencem ao mesmo caso e ao mesmo prazo original.

Resultado deste diagnóstico: preservar uma única execução do caso original em
fixture nova, junto de durações e identidades de sessões PostgreSQL. A evidência
deve permitir descrever o que foi observado e quais etapas continuam sem
atribuição causal. Um resultado aprovado isolado significa
`NON_REPRODUCED_CAUSE_UNKNOWN`, enquanto não houver prova de correção.

Referências preservadas:

- [Resultado R2](../04_audit/evidence/GBRAIN-LOOP-20261023/u13/fixture-lifecycle/common-local-r2/terminal-r2/SUMMARY.json).
- [Perícia e limpeza R2](../04_audit/evidence/GBRAIN-LOOP-20261023/u13/fixture-lifecycle/common-local-r2/unit-timeout-forensics-r2/result.json).
- [Identidade final da fonte](../04_audit/evidence/GBRAIN-LOOP-20261023/u13/fixture-lifecycle/common-local-r2/terminal-source-identity-r2/result.json).
- [Falha TM08 independente](../04_audit/evidence/GBRAIN-LOOP-20261023/u13/fixture-lifecycle/common-local-r2/tm08-candidate-input-binding-r2/completion.json).

## Escopo e isolamento

O diagnóstico usa os mesmos arquivos da candidata R2: 2.385 registros canônicos,
HEAD local `558b17e9b15761d8e91713d0620a1510b6cdfacc`, árvore
`658f5c1bdeaa7dcfccdcc480eaad215c1969d734`, Node 22.23.2, Vitest 4.1.12 e pg
8.20.0. O lock permanece no SHA-256
`51c5986bb8749312dd180f134bd6300781995436378666e311a37353f9fe24f1`.

Preparar uma worktree detached exclusiva em
`/home/ricardo/cvg-u13-fencing-diagnostic-20261024/candidate`, sem commit novo,
com dependências por cópia física privada e aliases de workspace resolvendo
somente nessa worktree. Copiar e vincular por hash os `dist` de pacotes já
produzidos pelo build R2 para preservar os exports de workspace necessários,
sem reconstrução ou uso de artefatos de outra candidata. Fontes, fixture, configuração Vitest, scripts npm,
assertions, limites e comportamento do programa permanecem byteexatos.

Logs, relatórios, cache e TMP são próprios. O checkout compartilhado e as
candidatas dos outros agentes permanecem somente leitura. O volume retido da
falha R2 não será reutilizado nem removido por esta tarefa.

O achado TM08 exige intake e correção próprios. Este diagnóstico não altera
transporte, DNS, segurança, identidade, policy, approval ou seus testes.

## Perfil PostgreSQL observado

Criar apenas depois do gate técnico de método e implementação:

| Recurso            | Valor                                                                     |
| ------------------ | ------------------------------------------------------------------------- |
| Container          | `cvg-u13-fencing-diagnostic-20261024-pg`                                  |
| Claim              | `GBRAIN-LOOP-U13-FENCING-DIAG-R1`                                         |
| Volume Docker novo | `cvg-u13-fencing-diagnostic-20261024-data`                                |
| Porta publicada    | `127.0.0.1:32804:5432`                                                    |
| Banco sintético    | `cvg_u13_fencing_diag_test`                                               |
| Imagem cacheada    | `sha256:3c5c8892d184f738f4fe282d14ddaa613a38f00f4189d2d94725ebe6f2909ddb` |
| Recursos           | memória 1 GiB; CPU 1; PIDs 128                                            |
| Dados              | volume gerenciado novo, sem bind de host ou tmpfs de PGDATA               |

Antes do servidor, sondar o volume montado somente leitura com a imagem fixada,
rede desabilitada, rootfs somente leitura, capabilities removidas,
`no-new-privileges`, memória 64 MiB, CPU 1 e PIDs 16. Executar somente `df -Pk`.
Exigir ao menos 8 GiB disponíveis, registrando dispositivo e medição; isso não
constitui quota nem reserva. Verificar nomes, labels e porta livres antes da
criação. O helper será removido ao terminar.

Manter os defaults de durabilidade, WAL e checkpoints. A prontidão exige SQL
TCP na instância final com banco e papel esperados, além do TCP publicado.
Configuração adicional do observador, exclusivamente nesta fixture:

```text
log_duration=on
log_connections=on
log_disconnections=on
log_line_prefix=%m|pid=%p|user=%u|db=%d|app=%a|cmd=%i|
log_timezone=UTC
log_statement=none
log_min_duration_statement=-1
log_min_duration_sample=-1
log_min_error_statement=panic
log_parameter_max_length=0
log_parameter_max_length_on_error=0
log_error_verbosity=terse
```

Verificar os valores por SQL antes do caso. Registrar durações, comando, sessão
e papel, sem texto SQL ou parâmetros que possam expor os passwords temporários
criados pela fixture. A [documentação PostgreSQL 16](https://www.postgresql.org/docs/16/runtime-config-logging.html)
distingue duração de texto SQL e documenta `%i` como command tag. Parse, Bind e
Execute podem produzir durações separadas; não somá-las como tempo do caso.

Os logs ficam limitados a 8 MiB. Rotação, truncamento, texto SQL inesperado ou
captura incompleta invalidam conclusões dependentes desses dados. A coleta e
o relatório publicados devem ser sanitizados se ocorrer saída inesperada.
O custo temporal do logging não é zero nem medido por esta proposta.

## Execução única

Usar `npm run test:core`, com o arquivo original como filtro e `-t` com o nome
completo acima, ancorado. Reporters padrão e JSON, com saída no runtime próprio.
`CI=true` e `CVG_TEST_SCOPE=core`. O PostgreSQL aponta somente para a fixture
nova. Não usar `test:postgres`, pois esse script aplica 60 segundos e ocultaria
a condição observada na etapa unitária.

Não passar overrides de `testTimeout`, `hookTimeout`, retry ou assertions.
O caso preserva 15.000 ms. Envelope do processo diagnóstico: 90 s, incluindo
importação e finalização; isso não amplia o prazo do caso. Exigir exatamente
uma assertion selecionada, com o nome completo e status aprovado ou falhado.
Zero selecionadas ou seleção diferente torna o diagnóstico inválido.

Demais casos registrados pelo arquivo são `NOT_SELECTED` deste experimento,
e não uma dispensa de SKIP da barra canônica. O diagnóstico não executa nem
aprova a suíte completa. Máximo de uma execução funcional, sem retry inalterado.
Parar depois da coleta, qualquer que seja o resultado.

A preparação de arquivos tem envelope próprio de 120 s. O controlador de
fixture tem 180 s para prontidão (até 45 s), processo diagnóstico (até 90 s),
coleta e limpeza. Esses envelopes operacionais não alteram o timeout da
assertion e devem ser registrados como limites diferentes.

## Evidência e interpretação

Preservar comandos literais, ambiente allowlisted sem credenciais pessoais,
PID/startticks/PGID, exit real, stdout/stderr, JSON, logs PostgreSQL, inspect,
settings, horários e hashes das entradas e saídas. Revalidar as fontes antes e
depois. Manter o resultado bruto de falha da R2 intacto.

A interpretação separa: seleção válida; resultado real da assertion; limite
atingido; durações por sessão/comando; intervalos sem observação; limpeza; e
limites do observador. Não atribuir tempo de cliente, fila, I/O, checkpoint ou
CPU por soma de métricas cumulativas ou pela identidade do dispositivo.

Se o caso passar, a falha original segue aberta com causa desconhecida. Se
falhar, registrar a falha atual e o que o observador realmente delimita. Uma
falha funcional de boot que aceita catálogo degradado é distinta de timeout
e deve ser encaminhada como tal. Não alterar o programa ou o orçamento durante
a campanha.

## Ciclo de vida e gate

O controlador supervisiona somente os processos que criou, com identidades de
geração e grupo próprios. Se o envelope vencer, encerrar o grupo, aguardar e
registrar o resultado e os descendentes remanescentes; falha de limpeza impede
aceite do diagnóstico. Capturar a evidência antes de aposentar recursos.

Conferir identidade, imagem, label, volume e clientes SQL do PostgreSQL próprio.
Depois de quiescência comprovada, parar/remover somente o container exato;
manter o volume diagnóstico para análise. Verificar ID ausente, label sem
containers, processos originais ausentes e porta livre. Qualquer cliente ou
recurso não atribuído bloqueia a limpeza correspondente, sem encerramento cego.

Preparar código e método completos, congelar entradas e obter revisão técnica
antes da autorização de lançamento. Uma revisão fresca desta unidade tem até
duas rodadas e um retrabalho agrupado, sem reset de outros componentes. Nenhuma
aplicação ou recurso PostgreSQL foi criado por esta SPEC.

Ao terminar: atualizar apenas os controladores, log, handoff e seção de claim
do Lead; ledgers de pares continuam somente leitura pela regra5. Consultar o
GBrain no início e registrar resultado e evidência com readback ao fechar a etapa.

Esta tarefa não concede os 35 gates externos, 16 gates internos, aceite de
U13/K04, os 42 critérios do programa ou produção. Todos continuam sujeitos aos
respectivos dados atuais e autoridades.
