# AUD-0601 — auditoria da entrega publicada e da configuração de produção

- Data: 06/10/2026. Task `AUD0601-PRODUCTION-DELIVERY-20261006`, Codex.
- Código publicado: `dc4a3cbbfddf91646d794e9165e524032df04c9c`. Complemento local: `210d8e1208ab2556eafc17cb64c6c13d05116d03`, somente `.env.example`.
- **Parecer: entrega parcialmente confirmada; núcleo `NO_GO`.** Além da implantação ausente e proteção pendente, há dois P1 comportamentais confirmados — pausa antes do corpo e revogação da família de sessão — e o Verify publicado terminou com falha.
- [Evidências e reprodução](evidence/AUD0601-PRODUCTION-20261006/summary.md). Auditoria somente leitura da implementação, com worktree/dependências/recursos sintéticos próprios. Sem commit, push, alteração de proteção, secrets reais ou deploy.

## O que a declaração acerta e o que mudou

Security passou no mesmo SHA, nos jobs `codeql`, `secret-scan` e `supply-chain`. Nenhum high permanece aberto; #6/#7 foram dispensados como falso positivo e as evidências históricas excluídas do scan por decisão registrada. O medium #19 permanece em `products/shift-assistant`, fora do núcleo. Isso confirma o estado do scan, sem substituir auditoria comportamental.

O [Verify 37524247242](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/37524247242) saiu de execução para **FAIL**, encerrado em 06/10 às 20:28 UTC. Unit e cobertura global passaram; `coverage-critical` falhou em `channel`: funções **94,59%**, branches **94,85%**, mínimo **95%**. Os demais erros de provenance/finalização decorrem dos gates que não rodaram. Mutação, PostgreSQL, provas de backup, E2E e imagem remotos não receberam PASS nesse run. A evidência baixada identifica `critical_coverage_below_threshold:channel`; não é a falha anterior de import de zod.

Na captura final, `main` continua em `dc4a3cb` e sem proteção. Os nomes reais dos quatro checks são **`REM21 CI bar (Node 22)`**, **`codeql`**, **`secret-scan`**, **`supply-chain`**. Usar literalmente `Verify`/`CodeQL` como contextos obrigatórios não corresponde aos checks publicados. A exclusão de administradores é uma proposta declarada; nenhuma regra foi configurada nesta auditoria.

O GitHub retorna zero environments e zero deployments. O usuário declara não existir servidor/orquestrador, banco, segredos, proxy HTTPS e agendamento de backup para o núcleo. Não há evidência de implantação no repositório. A consulta ao GitHub não prova inexistência de infraestrutura externa; confirma a ausência de ambiente/deployment registrado e mantém a implantação como pendência explícita.

## Verificação independente

| Prova                                                                    | Resultado observado                                                                                                                                                                                  |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suíte canônica no SHA publicado, Node 22.23.2, PostgreSQL 16 obrigatório | 358 arquivos, **2.925 PASS**, zero falhas/skips; sem as duas antigas falhas esperadas.                                                                                                               |
| PostgreSQL exclusivo                                                     | 37 arquivos, **296 PASS**, zero skips.                                                                                                                                                               |
| Typecheck, lint e formatação                                             | PASS no candidato isolado.                                                                                                                                                                           |
| Build da imagem a partir do SHA                                          | PASS; runtime distroless, uid/gid 10001, sem shell/npm/apt nos caminhos inspecionados, API e worker presentes, escrita em `/app` recusada.                                                           |
| Smoke canônico na imagem recebida `sha256:416d227e…`                     | **16/16 PASS**: login, papéis separados, webhook, aprovação/efeito único, replay, pausa/retomada e receptor de alerta sintético.                                                                     |
| Imagem reconstruída e instrumentação externa                             | Smoke PASS; alerta sem URL: `/live=200`, `/ready=200`, `stop_alert.disabled` presente. Worker vivo/heartbeat recente, mas healthcheck `unhealthy`: AUD0601-F04.                                      |
| Scan do filesystem da imagem reconstruída                                | Gitleaks 8.28.0, exit 0, zero achados; regras padrão excluem `node_modules`. Não é varredura dos segredos de uma implantação inexistente.                                                            |
| Dump/restore da cadeia                                                   | Com `NODE_ENV=test`, PASS: 16 eventos, mesmas cabeças/contagens, adulteração de metadado detectada. Sem essa variável, a receita falha com webhook401: AUD0601-F07.                                  |
| Remediação AUD0600                                                       | Dupla falha de log conserva a negação; fechamento/certeza de etapa e pausa estacionada passam nos cenários aceitos do iterativo. Não se transforma isso em aceite integral do worker.                |
| Revisão independente de sessão                                           | 47 PASS/1 FAIL em sondas próprias; PostgreSQL real: um teste FAIL por duas asserções contratuais. Teardown registra zero conexões.                                                                   |
| Revisão independente de worker/kernel                                    | 33 sondas, 24 PASS/9 FAIL brutos; quatro falhas sustentam dois achados, cinco são inconclusivas/suplementares. Lead reproduziu pausa e heartbeat, e confirmou a janela da pausa com PostgreSQL real. |

A imagem reconstruída tem outro digest (`sha256:769a816c…`). Comparação de 12.079 entradas em `/app` e do binário Node encontrou igualdade nos arquivos executáveis, dependências, owners/modes e links. Diferem três arquivos incrementais `.tsbuildinfo` e `generatedAt` de `runtime-context.json`. Não se alega reprodução bit-exata da imagem inteira; os smokes identificam separadamente os dois digests.

## Achados e remediações

### AUD0601-F01 — P1 — pausa durável ativada após reserva não impede o efeito

Em `packages/agent-runtime/src/runtime.ts:1143`, a última leitura de pausa precede `approvals.reserve`. Depois dela o runtime aguarda reserva da aprovação, reserva do journal, `markExecuting` e `markEffectStarted`. O controle posterior usa `stopDenial`, que não lê o interruptor. O corpo em `:1313` pode começar depois do commit da pausa.

Revisor e lead reproduziram três janelas em memória: depois de reservar aprovação, depois de reservar journal e depois de registrar início no journal. Nos três casos o corpo foi chamado com pausa ligada, resultado `executed`, aprovação `EXECUTED`. O controle de pausa anterior à reserva passa.

**Confirmação PostgreSQL do lead:** no caminho concreto `createPostgresKernelRuntime`, o interceptor aguardou a reserva real e gravou `PostgresWorkerOperations.setPaused` antes de devolver o controle. A execução terminou com `paused=true`, **um corpo invocado** e aprovação `EXECUTED`. Não houve dado real ou concorrência não controlada; a ordem foi fixada deterministicamente. A mesma implementação compõe o worker de produção.

Contraria SPEC0181 I12/§13.3 e condição 10 da barra. Revalidar o interruptor na fronteira anterior ao corpo e definir a liquidação das reservas sem efeito; depois de início incerto, exigir reconciliação. Não basta interromper novas claims da fila, nem transformar genericamente `RUNNING` em ausência de efeito. Regressões devem alcançar as três janelas, com aprovação e journal reais, pausa ilegível e retomada sem duplicação.

### AUD0601-F02 — P1 — logout bem-sucedido não revoga a sessão sucessora

A rota em `apps/api/src/server.ts:807` cria nova sessão e depois revoga a antiga, embora o adapter PostgreSQL exponha substituição atômica. Isso cria famílias distintas. SPEC0144 exige que logout de qualquer digest da linhagem revogue todas as sucessoras, inclusive diante de respostas de troca atrasadas.

**PostgreSQL real:** login gera cookie A; novo login com A gera B; logout com A retorna **200 / `loggedOut:true`**; B continua acessando `/v1/tasks` com **200**, quando deveria receber 401. Papéis/schema/store usados são os do bootstrap de produção, sem fallback em memória.

Integrar `replace` e o contrato de revogação por família na rota, preservando atomicidade e limpeza do cookie após commit. Cobrir rotação/logout em ambas as ordens, duas réplicas e resposta atrasada. Defeito herdado da rota, agora composto em produção; não se atribui sua criação ao novo bootstrap.

### AUD0601-F03 — P2 — logout503 apaga um cookie ainda utilizável

Em `apps/api/src/server.ts:867`, a rota limpa o cookie quando `revoke` rejeita e devolve 503. SPEC0144 prevê preservá-lo para recuperação/retry.

**PostgreSQL real:** revogar seletivamente EXECUTE de `operator_session_revoke`, mantendo get/preflight funcionais; logout503 emite limpeza de cookie, enquanto a sessão continua ativa e sua cópia ainda obtém 200. Restaurar o grant e limpar recursos faz parte da sonda. A reprodução em memória independente também falha.

Emitir a limpeza somente depois de revogação confirmada; falha deve preservar o cookie e mostrar indisponibilidade. Também é herdado, sem nova elevação de privilégio demonstrada.

### AUD0601-F04 — P2 — worker herda healthcheck exclusivo da API

`Dockerfile:43` define fetch para `127.0.0.1:${PORT}/live`. O comando do worker não sobe esse servidor. A receita de `0802` troca o comando, mas não a sonda.

**Contêiner real:** worker em produção, processo vivo, heartbeat recente e smoke funcional passando; healthcheck herdado retorna exit 1 e estado **`unhealthy`**. A instrumentação acelera apenas interval/start-period/retries para medir a mesma sonda, sem alterar sua expressão. O primeiro snapshot estava ainda `starting`; a confirmação final observa `unhealthy`.

Definir sonda própria para worker ou override explícito no manifesto de operação, além de teste que mantenha worker vivo até avaliar health. Um orquestrador que use essa sonda pode recusar/substituir um worker funcional; não se afirma que Docker sozinho reinicia automaticamente por healthcheck.

### AUD0601-F05 — P2 — heartbeats sobrepostos duplicam o progresso

`apps/worker/src/continuous-worker.ts:477–486` calcula delta antes de aguardar `operations.beat`; o cursor é atualizado depois do await. O intervalo inicia novas chamadas sem exclusão mútua. Com persistência lenta, mais de uma chamada usa o mesmo cursor.

Revisor e lead: **um evento processado**, deltas `[0,1,1,1]`, total reportado **3**, quatro callbacks sobrepostos. A persistência soma esses deltas. Não se demonstrou execução duplicada do efeito; o erro está no progresso/telemetria.

Serializar a emissão ou reservar o delta antes do await, com regra de retry que não perca nem conte duas vezes o progresso. Verificar também shutdown e erro do callback. O alerta estar desligado não corrige o contador nem é classificado como erro de decisão.

### AUD0601-F06 — P2 — `valid=true` não comprova integridade do payload persistido

`apps/worker/src/kernel-audit-chain.ts` chama `verifyAuditChainRecords` com `payloads:'report'`. O hash dos metadados e seu vínculo com `payloadHash` são conferidos, mas divergência entre payload armazenado e seu hash apenas incrementa um contador. Não se distingue redaction legítima de adulteração arbitrária.

Sonda do lead: trocar payload `{outcome:'denied',…}` por `{outcome:'executed',…}` conserva **`valid=true`**, mesma cabeça e `payloadMismatches=1`. Trocar `eventType` é corretamente detectado. O teste existente confirma intencionalmente esse modo permissivo; a ressalva é sua insuficiência para afirmar integridade do conteúdo por `valid` apenas.

Definir prova sobre o payload efetivamente persistido/sanitizado ou sinal distinto de integridade parcial, e fazer o consumidor rejeitar divergências inesperadas. A contagem precisa de uma política verificável de redaction. Truncamento da cauda também precisa de cabeça/contagem externa: o standalone aceita um prefixo válido; o comparador do restore possui âncoras relativas entre origem e cópia e não é acusado de ignorar essa diferença. Sonda pura sobre rows, não adulteração de um banco de produção.

### AUD0601-F07 — P3 — receita do restore omite perfil obrigatório

O comando documentado em `0802`, executado com `NODE_ENV` ausente, termina `inbound restore-msg-1:401`. O workload cria `buildServer` sem verificador de webhook e envia requests sem assinatura; somente o perfil test permite isso. Com **`NODE_ENV=test`**, o mesmo script passou dump/restore e tamper control.

Explicitar o perfil sintético na receita/contrato do runner ou compor a prova com webhook assinado. Não enfraquecer a API de produção para fazer a sonda passar. O ensaio preservado comprova restore controlado, não backup agendado nem atendimento real.

## Disposição da barra 0373 e implantação

| Condição                  | Disposição nesta auditoria                                                                                                                                                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — kernel governado      | Casos antigos I6/I7 passam; pausa pós-reserva falha no caminho do worker (F01). Aceite integral aberto.                                                                                            |
| 2 — testes                | Suítes locais canônicas passam; sondas adversariais falham. Não há greenwashing por contagem geral.                                                                                                |
| 3 — smoke                 | 16/16 reproduzido na imagem recebida, com papéis e dados sintéticos; não é implantação.                                                                                                            |
| 4 — login                 | Login/401/403/restart/readiness comprovados; contratos de logout/rotação falham (F02/F03).                                                                                                         |
| 5 — CI e proteção         | Security PASS, high aberto zero; Verify FAIL em cobertura crítica; main sem proteção.                                                                                                              |
| 6 — segredos/dependências | Security PASS; scan local da imagem zero no escopo padrão; segredos de produção ainda não provisionados.                                                                                           |
| 7 — imagem                | Endurecimento confirmado; operação do worker necessita correção/override de healthcheck (F04).                                                                                                     |
| 8 — backup                | Dump/restore controlado passa; integridade de payload parcial (F06), receita incompleta (F07), agendamento ausente.                                                                                |
| 9 — alerta                | Implementação/receptor de teste comprovados. Desabilitado conforme declaração de decisão do usuário; não se pede ativação nesta auditoria. Exceção precisa permanecer registrada para eventual GO. |
| 10 — pausa                | Fila e pausa antecipada passam; janela pós-reserva falha com banco real (F01).                                                                                                                     |

Configuração pendente: destino de implantação e manifesto com API/worker do mesmo digest; quatro roles/credenciais e migrations em job separado; chaveiros e segredo de webhook; TLS/proxy confiável; volumes/política de restart/sondas; agendamento e retenção de backup. `.env.example` é documentação com placeholders e defaults de desenvolvimento, não configuração pronta de produção. `CVG_WORKER_PRODUCTION_ENABLED=true` é necessário, mas também se exigem runtime `kernel`, modo `continuous`, adapter PostgreSQL, perfil controlado e credenciais/permissões corretas — a receita sintética fornece esses detalhes.

Próxima ação: owner PROD-0373/KERNEL-PLUGINS remediar os P1 de pausa e sessão, corrigir a cobertura crítica sem rebaixar a barra e tratar os P2/P3; depois reauditar o novo SHA/imagem. Proteção e implantação continuam pendentes separadamente. Nenhum produto, provider, canal ou dado real foi liberado.

## Limites e preservação

Revisões auxiliares foram de autoria distinta e somente leitura. Leitura obrigatória dos ledgers pode revelar declarações do builder; não se alega cegamento perfeito. Matriz de worker tem cinco FAIL brutos não promovidos a achados (entradas com orçamento zero/composição de journal/replay suplementar); a comparação parcial com cópia da base não certifica identidade ou regressão integral. O lead conferiu os bytes das fontes publicadas separadamente.

Uma primeira instrumentação PostgreSQL do lead chamou `setPaused` com assinatura incorreta; falhou por erro do runner, foi preservada e corrigida antes da medição válida. A primeira receita de restore401 foi mantida como finding operacional, sem atribuí-la a corrupção de backup. Não foram rodados certify/E2E/SBOM/licenças locais nem feitas mudanças remotas. Recursos próprios de banco/smokes foram removidos e revisores encerrados; fonte, lockfile, histórico e registros anteriores permanecem preservados.

Durante o fechamento, outra sessão criou `ab1bf47` (testes de cobertura channel) e `d3ca659` (catálogo de skips), além de alterações locais em SPEC0181 e na prova PostgreSQL do CI. A auditoria e seus gates permaneceram no worktree congelado `dc4a3cb`; não se estende o parecer aos commits novos. Na última consulta, main remoto ainda era `dc4a3cb`, sem proteção. [Preservação e concorrência](evidence/AUD0601-PRODUCTION-20261006/preservation.json) identifica os caminhos e confirma os registros anteriores byte-exatos.
