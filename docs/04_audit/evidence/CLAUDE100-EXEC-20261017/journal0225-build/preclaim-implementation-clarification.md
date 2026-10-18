# J07 — posicionar a recusa antes da admissão

Clarificação de implementação dentro da0225 já aprovada, não novo modo ou
contrato. O recon estático empreclaim-readiness-recon.json mostrou que o
journal sozinho não impede um worker default de assumir trabalho antes da
primeira chamada ao journal. A exigência J07 é anterior aclaim/modelo/corpo.

A condição do HOW de preservar hosts recebe uma exceção conservadora e
explícita: `apps/worker/src/postgres-role-preflight.ts` deve recusar schema
0030 ativado ou guard desconhecido para o worker comum, que continua sem
opt-in. Nenhuma opção pública, credential, autorização de escrita ou caminho
positivo é adicionado ao worker. A composição sintética qualificada executa
readiness do armazenamento explicitamente antes de admissão.

Preservar legado não expandido e default no expandido ainda inativo: detectar
as duas colunas e o trigger canônico por catálogo, verificar a definição exata
do guard inativo contra a migração0030. Guard ativado/diferente, incompleto,
alterado ou ausente após expansão não qualifica o worker default. Não confiar
em marker de ferramenta, GUC ou mero nome do trigger. A checagem acontece no
preflight antes doprimeiroclaim existente; nenhum modelo é chamado para provar
readiness. Credenciais antigas continuam revogadas no alvo próprio.

Adicionar teste próprio depreclaim no worker e manter as regressões existentes.
O conjunto de paths da implementação passa de11para13; as pré-imagens e o
claim adicional precedem qualquer edição nesses dois arquivos. Os contratos,
limites, testesJ01–J13/J16 e o escopo humano permanecem os mesmos. O crítico
independente de código receberá este delta e as provas; o HOW original e suas
revisões ficam preservados, sem reescrever seu aceite anterior.
