# PR-009-PROV — captura remota do CI e proteção

Captura read-only realizada em 29/09/2026, às 05:54:16 UTC. Claim: `PR-009-PROV-REMOTE-AUDIT-002`.

## Resultado observado

- A branch `main` aponta para `02f586b221fc6582f23385c1736cce8e10438ea6`.
- O endpoint de proteção clássica da branch respondeu HTTP 404 (`Branch not protected`); a API de rulesets retornou lista vazia.
- O último workflow `verify.yml` por push em `main` é a run 36240221655, no SHA atual, e concluiu `failure`. A API de jobs retornou lista vazia para esta run; não atribuí causa.
- O último `verify.yml` listado é uma run de pull request bem-sucedida no SHA `8ee6fa272072efe05fd63b7d708ba9b077280149`, diferente do `main` atual.
- A run Security agendada 36406943814, no SHA atual, falhou no job `secret-scan`, passo `Gitleaks`; `codeql` e `supply-chain` passaram.
- Foram registradas somente path/linha/nível das três anotações do check: `.github` linha 1 (notice), linha 2 (warning) e linha 3436 (warning). Mensagens, detalhes e logs brutos não foram consultados nem armazenados.
- A API de secret-scanning retornou zero alertas. Isso não explica nem invalida a falha do Gitleaks.

## Veredito e limites

Release `NO_GO`: proteção de branch ausente, verificação mais recente em `main` falhou e o scanner de segredos falhou sem diagnóstico. A captura não prova a existência de um segredo real nem de falso positivo. Nenhuma configuração remota, segredo, workflow, branch ou regra foi alterada. Não houve push ou deploy.

Os dados estruturados da captura estão em `remote-status.json`; `SHA256SUMS.txt` liga os arquivos desta evidência.
