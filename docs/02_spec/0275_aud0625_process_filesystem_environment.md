# 0275 — F02: filesystem mínimo e ambiente explícito em PROCESS

Estado: **PROPOSED_FOR_HUMAN_T3_REVIEW**. Task `AUD0625-SANDBOX-DISCOVERY-CODEX-20261028`, atribuição9520; baseline `a69030d3fa3cc22eccfd7eb9e1cb2ae2c3df7867`. Nenhuma implementação corretiva nesta fase.

## Problema, fronteira e evidência

O [F02](../04_audit/0625_repository_score_audit_2026-10-28.md#f02--p1-process-permite-ler-fora-do-workspace-e-herda-ambiente) é confirmado por execução do `runContained` real: Node lê um marcador próprio fora do workspace e recebe uma variável sintética não autorizada. O controle lê o marcador interno. Não são dados pessoais ou segredos. Mount readonly de todo `/` impede algumas escritas, mas conserva leitura do host; `spawn` sem env explícito transmite o ambiente do chamador.

A [SPEC0196](0196_pdsh011_sandbox_local.md) exige filesystem restrito no PROCESS. Seu perfil de runtime precisa distinguir recursos confiáveis indispensáveis de dados do host. X01/81C4 possui desenho de isolamento/supervisão, ainda sem prova pública de implementação aceita que feche este achado no baseline. Esta proposta cobre só mounts/env da implementação0196. Não substitui X01, sua qualificação nativa ou seu mecanismo de deadline.

## Perfil proposto — decisão T3 submetida

O host confiável deve capturar um **manifesto imutável de runtime** antes de compor o shell. Ele identifica os executáveis revisados, loader/bibliotecas/arquivos de suporte necessários, caminhos canônicos de origem/destino e digest da versão do perfil. O pedido do modelo continua apenas argv/cwd/stdin/intenção; não pode escolher mounts, env, PATH, binário bwrap ou manifestos de runtime. Alterar o manifesto muda a identidade da composição e exige nova qualificação. O primeiro perfil deve ser Linux/Node22 local, com executável absoluto e dependências enumeradas; não prometer suporte a comandos arbitrários.

Proposta de implementação na fronteira `run.ts`/factory `shell-tool.ts`:

1. Construir raiz vazia do namespace. Montar readonly somente arquivos/raízes de runtime explicitamente revisados e o workspace concedido em rw, além de proc/dev privados e tmpfs temporário. É proibido montar o `/` do host, o home, `/etc` ou `/usr` inteiros como conveniência. Preservar namespace PID/IPC/UTS e isolamento de rede existentes; nenhum hostnetwork.
2. Workspace/cwd vêm do handle nativo validado, com identidade canônica e resolução que não atravesse troca/symlink para fora. Reutilizar a disciplina de identidade0270 e reconciliar o mecanismo com X01; check textual de prefixo não é prova suficiente. Runtime deve vir de material imutável do host, com identidade/digest conferidos; alteração detectada recusa o lançamento. Não descobrir dependências executando `ldd` sobre argv não confiável durante o pedido.
3. Resolver o executável bwrap absoluto a partir do perfil confiável. O processo bwrap recebe env mínimo explícito; não herdar variáveis do processo Node, nem flags de loader, NODE_OPTIONS ou tokens. Dentro do namespace aplicar `--clearenv` e criar somente LANG/LC_ALL `C.UTF-8`, TZ `UTC`, HOME/TMPDIR `/tmp`, PATH vazio e PWD do cwd concedido. Qualquer adição futura precisa entrar no perfil revisado; não copiar process.env. Valores sensíveis nunca entram no log.
4. Criar tmpfs antes do bind do workspace quando este estiver sob `/tmp`, preservando a semântica0196. Validar existência/tipo, manifesto, plataforma, capacidade e mounts antes de executar payload. Recurso faltante, digest divergente, mount/env não suportado ou programa fora do perfil retorna `spawn_failed`/unavailable; nunca voltar à raiz inteira ou a execução sem contenção.
5. `bwrapPath` usado como override de teste permanece exclusivamente na composição confiável; não se torna input de tool. A forma final de passagem do manifesto será aditiva nos tipos do backend e nas opções da factory, readonly/frozen, com default ausente recusando PROCESS quando não houver perfil qualificado. Isso é mudança de segurança/compatibilidade T3, expressamente sujeita à aprovação.

A semântica das flags é documentada pelo [fornecedor bubblewrap](https://github.com/containers/bubblewrap/blob/main/bwrap.xml); a versão local0.9.0 possui clearenv/setenv/binds na ajuda capturada. Isto sustenta o desenho, não prova a implementação futura. O recorte local demonstrado não qualifica imagem distroless, Linux de destino, macOS ou Windows.

## Critérios de aceite

| ID    | Prova obrigatória após implementação                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------------ |
| F02-A | Controle real lê/escreve marcador interno; argv/cwd/stdin e limites continuam válidos                        |
| F02-B | Sentinela própria externa não montada é inacessível; confirmar ENOENT/EACCES/EPERM e zero conteúdo           |
| F02-C | Variável sintética do pai não aprovada ausente; env permitido exato funciona sem dump de ambiente real       |
| F02-D | Sem perfil/binário/lib/capacidade ou com digest/cwd divergente: não executa payload e não degrada            |
| F02-E | Symlink/troca de diretório do workspace e alias de runtime não ampliam leitura/escrita; identidade conferida |
| F02-F | Proc/dev e filhos dentro do namespace, rede negada, caps/limites/output/truncamento/cleanup não regredidos   |

[Teste atual](../../tests/aud0625-process-containment-red.test.ts): admissão nativa, parsing e marcador interno fora de `it.fails`; duas assertivas RED independentes para leitura e env. Timeout/namespace indisponível/JSON inválido falham a suíte em vez de contar como defeito esperado. Fixtures criadas pelo teste em raiz própria fora do `/tmp` sombreado; removidas ao terminar. Esta fase não experimenta ataques em dados do host.

## Sequência, limites e rollout

Antes de código: ACK de X01/81C4 para compor `run.ts`, bytes de base fixos e perfil de runtime capturado/qualificável. Nenhuma implementação privada é adotada por relato ou silêncio. Sequenciar F01/0277, F02/0275 e então os deltas de runner de F05 para evitar writers concorrentes; um integrador conserva a identidade dos artefatos.

Rodar controles e regressões de0196/0198/0270, testes nativos da matriz, tipos/lint e barra T3 atual. Prazo, reserva de cleanup e supervisão de árvore pertencem ao contrato X01; esta SPEC não os reduz nem concede novo budget. Perfil incompleto mantém PROCESS indisponível e NO_GO. Em falha de rollout, recusar PROCESS; **não restaurar mount irrestrito/herança de ambiente como fallback promovível**. Sem mudanças de sysctl/AppArmor/host, dados reais, lockfile, push/deploy ou produção por esta proposta.

Próximo: DF submeter o perfil e a fatiaT3 ao Ricardo, com SHA; depois registrar composição/manifesto e gate de BUILD. Dependências X01 permanecem explícitas e não são declaradas implementadas.
