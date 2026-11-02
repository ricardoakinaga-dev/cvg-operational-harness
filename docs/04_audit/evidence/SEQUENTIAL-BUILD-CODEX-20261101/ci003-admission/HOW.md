# CI003 — parser de admissão de opções de cobertura

Oferta1855799 do Lead0410 e HOWR2 APPROVE1859652; ACK3535a510. T2 interno: nenhuma mudança de contrato público/produto ou grant. BUILD só destes dois arquivos novos em candidata própria derivadafeeda7e8; integração/revisão final/fullgates pertencem ao Lead.

## API e comportamento

`parseScheduledCoverageOptions(argv, env)` recebe vetor de strings e objeto de ambiente e retorna NOVO vetor canônico `--reporter=default`, `--reporter=json` e `--outputFile=<valor>`. Só as duas opções são admitidas, nas formas com igual ou valor separado. Reporter é repetível e exato; ordem/multiplicidade são preservadas. OutputFile ocorre no máximo uma vez e exige ao menos reporter json. Sem argumentos retorna [].

Toda presença de VITEST_MAX_WORKERS recusa, inclusive herdada ou com undefined/empty/2/3. Nenhum outro override, positional, separador -- ou abreviação é aceito. Output deve ter texto não vazio/não whitespace, nenhum controleC0/DEL/C1 e não começar com hífen mesmo após espaços. Preservar o valor sem interpretar caminho/shell: destino de relatório é responsabilidade do runnerLead. Não ecoar valores/ambiente em erros. Não mutar argv/env, NODE_OPTIONS, identidade ou segurança; nenhum spawn ou acesso a arquivo/rede pelo helper.

## Aceites congelados

- A1: controle sem opções e variantes admitidas geram somente argv canônico, ordem/repetição preservadas.
- A2: VITEST_MAX_WORKERS é recusado para qualquer presença, antes da admissão; outros valores de ambiente são preservados.
- A3: toda flag fora da lista, bypass, positional, -- ou valor reporter malicioso é recusado; não há passthrough.
- A4: outputFile seguro único exige json; vazio/whitespace/controles/hífen/duplicata/semjson recusados. Valores com espaços, Unicode e paths ficam literais e canônicos.
- A5: entradas congeladas não são alteradas; retorno é novo; falhas também não mutam, mensagens não refletem segredos sintéticos.
- A6: Node22 executa testes puros focais reais; RED ausência antes da implementação, GREEN depois e controle mutante que permite worker override falha na mesma suíte.
- A7: patch final tem somente2paths, fontebase/digests/brutos/diff/evidências, handoff aoLead; helper isolado não fecha S2/S7/F01 ouCI003.

## Execução

Lead desta folha implementa e valida; sem delegar BUILD. Usa toolchainVitest instalada somenteleitura com config/cache/runtime exclusivos. Sem imports de aplicação, install, PG/Docker/E2E/globalcert ou alterar timeouts/thresholds/denominadores/lock. Regressão limitada à novaAPIpura; Lead0410 verifica o caminho real do runner e gatesintegrados após aplicarpatch. Qualquer divergência de API é resolvida com ele antes de integração.
