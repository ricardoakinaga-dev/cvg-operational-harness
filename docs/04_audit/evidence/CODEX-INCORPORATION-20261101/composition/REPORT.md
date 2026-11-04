# Composição privada: cleanup e entrega de assets

Em 02/11/2026, os dois componentes previamente revisados foram reunidos na candidata `codex/codex-runtime-composition-20261102`, baseada no commit próprio `a186f6e760971b86d8e6f4477cf778a7ca6b082c`. Os cinco arquivos de fonte são idênticos aos julgados nas revisões dos componentes. Esta etapa não implementa o owner gerenciado completo nem adota a proposta `originalReturns`.

## Evidência observável

O teste pelo pacote compilado demonstrou a falha anterior: enquanto o callback D2 aguardava uma barreira, uma segunda chamada pública a `KernelHost.dispose()` executava D1 e terminava antecipadamente. O mesmo verificador, com SHA `da684836894904992d85973e59a48a444d701815f79e9a2011203c9e666cda6d`, passou no pacote da composição: ambas as chamadas aguardam a limpeza, a sequência final é D2:start → D2:end → D1 e uma chamada posterior não repete os callbacks.

Os consumidores são cópias físicas com `@cvg/harness` extraído dos tarballs produzidos por `npm pack --offline --ignore-scripts`. Os bytes dos 169 arquivos de cada pacote coincidem com seu contexto de build e seu consumidor. Os modos do consumidor coincidem com o tarball; o npm normaliza os arquivos de 0664 no contexto para 0644 no pacote. Os 210 nomes exportados pela raiz coincidem. O JavaScript compilado do host mudou; o verificador e os dois assets sintéticos permaneceram iguais. O controle de `process.dlopen` foi acionado uma vez pela tentativa deliberada sobre o canário; os imports públicos registraram zero tentativas. Nenhum backend nativo foi carregado ou qualificado.

| Verificação                                  | Resultado atual                               |
| -------------------------------------------- | --------------------------------------------- |
| Regressão combinada                          | 138 testes em 11 arquivos, PASS               |
| Typecheck completo                           | PASS                                          |
| Lint e formato dos cinco fontes              | PASS                                          |
| Builder público                              | 20 workspaces, PASS                           |
| Consumidor público anterior                  | RED causal, exit 1                            |
| Consumidor público composto                  | GREEN, exit 0                                 |
| Exports, transporte e identidade dos pacotes | PASS dentro do escopo acima                   |
| Revisão independente da integração           | APPROVE_SCOPED_INTEGRATION, zero obrigatórios |
| T2 global, PostgreSQL e E2E                  | Não executados nesta etapa                    |

A primeira chamada do builder recebeu `/tmp/dummy` por erro de invocação. A guarda de destino recusou essa chamada; seu resultado foi preservado em [invalid-invocation.json](invalid-invocation.json) e nos brutos, sem crédito como RED funcional. A execução corrigida tem registro próprio. Nenhuma assertion, fonte dos componentes ou limite de tempo foi alterado para obter o resultado positivo.

## Entrega e limites

O [freeze](code-freeze-r1/manifest.json) fixa cinco fontes e 46 entradas. O [patch](code-freeze-r1/implementation.patch) contém somente os dois arquivos de cleanup adicionados à base que já entrega os assets. [Comparação dos artefatos](artifact-comparison.json), [intake do patch](patch-intake.json) e os registros em `checks/` conservam argumentos, limites, duração, exit e hashes PRE/POST. As fixtures temporárias foram removidas da árvore de fontes antes do freeze.

A [revisão independente](integration-review-r1/review.json) aprovou a composição sem achados obrigatórios. Huygens conferiu os 46 inputs, cinco snapshots, 35 pins herdados e 1.053 arquivos compilados, sem executar aplicação. O parecer foi emitido em 341,6 segundos e a reconferência terminou em 349,6 segundos, dentro do limite de 360. O ator foi encerrado; os pareceres anteriores dos componentes permanecem históricos. O commit seletivo local e sua identidade ficam em `completion.json`. Não há promoção para `main`, push, aceite de ABI, encerramento de W8, paridade funcional ou liberação de produção.

O escopo integral continua sendo 18 recortes, 12 comandos de CLI e a jornada CQ01–14. Permanecem pendentes a qualificação composta completa, a integração canônica com os responsáveis, K03b, o bootstrap e o wire K06 da CLI e a decisão humana sobre o contrato público `originalReturns`. A solicitação dessa decisão já foi apresentada e não foi repetida.
