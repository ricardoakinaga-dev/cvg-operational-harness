# Resposta I2 — versão do selo e escopo de R8

- Data: 29/09/2026.
- Revisão independente: I2 retornou REVISE, P2, no relatório AUD-0589 e nos hashes de hook/teste vinculados no claim.
- Relatório revisado após correção: SHA-256 1a31a2b25ce3788059537dee79188ad76c01a3a230edffd819f8a0d6b02ff8ae.
- Selo desta resposta: I2-response-proof.json vincula o relatório final, hook, teste, server.ts, I2-review/I2-proof e os dois pacotes de execução histórica.

## I2-F01 — divergência do manifesto principal

O proof.json e SHA256SUMS.txt originais são preservados como snapshot da execução inicial, não como selo da revisão atual. A revisão I2 encontrou seis hashes divergentes no manifesto principal e quatro fontes divergentes no inventário de 181 arquivos, por atualizações posteriores em caminhos compartilhados. Esses arquivos não foram reescritos nem apresentados como se fossem a mesma execução.

O manifesto do suplemento PostgreSQL verifica todos os itens que lista e liga o relatório anterior ao hook, teste e server.ts atuais. Ele continua sendo prova da execução de 28/09; não é tratado como selo do texto depois desta correção. O novo I2-response-proof.json vincula a versão final do relatório aos hashes atuais dos três arquivos de produto/teste, à crítica I2 e aos dois pacotes históricos, deixando explícito que não houve nova execução.

## I2-F02 — afirmação de R8

O relatório agora diz que os oito GET/HEAD preservaram os mesmos status HTTP (200/404) e fizeram zero consultas ao store. Declara também que corpo e headers não foram comparados. Isso corresponde exatamente às asserções da barra R8 e do teste.

## Resultado e limites

Não alterei código, teste, server.ts, evidências I1 ou suplemento PostgreSQL. Não reexecutei testes, SQL, migrations ou BUILD. O resultado é uma correção documental e de proveniência; não requalifica a composição de produção.

R4 permanece uma questão de contrato: tokens HMAC válidos ainda são aceitos por dois GETs protegidos sem lookup do store, e sua revogação não é a mesma da sessão. A composição final buildServerFromEnv com store PostgreSQL não foi testada no root porque server.ts segue sob PR-L04. Produção continua NO_GO.
