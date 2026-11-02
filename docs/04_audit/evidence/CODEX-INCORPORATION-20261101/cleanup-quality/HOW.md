# Qualidade do cleanup interno — T2

Task `CODEX-INCORPORATION:CLEANUP-QUALITY`, base privada revisada `bc863ac9147e80b30f38a0614c8a8eb35e9447f4`. Criar candidata própria; a composição e os freezes anteriores ficam intactos. Autoridade do comportamento: SPEC0222 já aprovada, sem adoção do delta `originalReturns` ou implementação do owner completo.

O diagnóstico focal teve127testes PASS, mas deixou o host com77,46%branches. Parte das lacunas é de caminhos antigos fora da seleção; selecionar também os arquivos existentes que referenciam KernelHost/KernelBootError. No código novo há dois `continue` depois de `await new Promise<never>(() => {})`: não podem executar no realm confiável, pois não existe settler. Remover esses statements preserva a suspensão e seu frame/stack. TypeScript não usa await de Promise<never> para encerrar o narrowing: o acesso posterior a failures recebe uma asserção de forma já validada, apagada na emissão JS. A prova do compilador está em typescript-narrowing.json. Não retornar outra promise no lugar do await, pois isso pode alterar retenção de ownership.

C01. Copiar a baseline/deps fisicamente em nova worktree própria, lock igual, Node22; registrar cinco hashes e scope de arquivos antes de escrever. Sem install, lock ou fonte de outro agente.

C02. Acrescentar casos de contrato para causas primitivas e opacas, Error com mensagem ausente/acessora/não string, falha ao apresentar o erro primário e coordinator que omite a rejeição original. Observar ordem real dos disposers, relatório, primeira causa e ausência de leituras/invocações indevidas. Esses casos exercitam limites de erro; não substituir o resultado da implementação por fixture de sucesso.

C03. Rodar os novos casos e o conjunto existente contra host byteigual à base. Preservar o resultado de cobertura e os statements inalcançáveis. Se os testes revelarem falha funcional, dispor a causa antes de editar produção. A cobertura focal só identifica o requisito local; não concede cobertura global.

C04. Remover os dois continue inalcançáveis e acrescentar somente a asserção de tipo apagada para failures já validado. As duas expressões awaitnever permanecem idênticas; a classe continua suspensa e não avança para dependências/pops. Os seis casos existentes de coordinator uncertain/throw/invalid/not_invoked/original_pending/hang precisam continuar pendentes com ownership. Nenhum ignore, threshold, guarda, timeout ou assertion é removido para alcançar100%.

C05. Repetir o mesmo conjunto de cobertura com a mesma regra crítica por arquivo, sem filtros por nome de caso. Conferir100%S/B/F/L no host, todos os casos sem skip, tipos, lint/formato, builder e consumidor público compilado quando a fonte final estiver pronta. Inspecionar qualquer lacuna remanescente pela sua causa, sem resets/repetições cegas.

C06. Congelar os dois fontes, diff, authority pins, scope de testes e brutos; uma revisão independente do patch e das provas. O estado global anterior permanece histórico. Antes de promoção/encerramento da rodada com código, executar os gates e a certificação exigidos para o candidato final sob claims específicos. Não somar essa medição focal a aceites de outros arquivos, W8 ou paridade.

Limites: setup180s, campanha focal180s, typecheck120s, lint/formato120s, builder180s, import/observador30s. Testes conservam os timeouts versionados. Helpers/caches/TMP/outputs são próprios. Sem PG, E2E, serviços ou provider real nesta unidade. Todo erro e timeout é preservado; nenhuma candidata anterior, fonte canônica ou recurso de par é alterado. Escopo integral18KR/12CLI/CQ01–14 e produçãoNO_GO permanecem.
