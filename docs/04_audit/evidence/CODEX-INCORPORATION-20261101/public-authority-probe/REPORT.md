# Observação de autoridade por pacotes instalados

O consumidor compilado executou nove casos em Node22 e encontrou uma divergência real em KR03: oito PASS e um FAIL, com exit1. As duas tentativas recebidas pelo provider preservaram o pedido congelado com modelo `synthetic-v1`. Uma mudança concorrente no perfil fez o segundo evento e o resultado anunciarem `caller-mutated-model`. Os bytes, tamanho e digest do pedido continuaram corretos. Portanto, o defeito observado era a perda de vínculo da configuração usada nos metadados e no resultado.

Os outros casos verificaram gravação de bytes desligada por padrão e ligada explicitamente, bloqueio de mutações do adapter em retry/fallback, recusa de prompt alterado e chamada já cancelada antes do provider, nonce produzido pelo corpo READ no kernel público, recusa de ferramenta fora do grant ou versão e rejeição de getter de descriptor sem invocá-lo. O corpo e o provider são sintéticos; gateway, kernel, registry e rotas internas de execução vêm dos exports reais dos pacotes instalados.

Foram conferidos 228 arquivos extraídos dos dois tarballs, 50 links internos de dependências, nenhum link externo, os 13 pins de fonte e os cinco inputs antes/depois. O processo terminou em0,215s, sem recursos Node ativos antes/depois ou grupo residual. [Observações](observations.json), [execução nativa](execution.json) e [integridade](verification.json) preservam o resultado original. O [oráculo](probe.mjs.txt) permanece congelado.

A correção e sua prova causal estão no [pacote sucessor](../request-snapshot-fix/REPORT.md). Estes nove casos são observações de componentes; não fecham KR03 inteiro, a jornada nativa, os doze comandos ou o catálogo de paridade.
