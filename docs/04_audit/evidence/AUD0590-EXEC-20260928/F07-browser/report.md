# F07 / A59-08 — diagnóstico de carregamento e matriz sintética

**Data:** 29/09/2026. **Claim:** `AUD0590-F07-BROWSER-001`.
**Estado:** `ACCEPT_LOCAL_DIAGNOSTIC_SCOPE` após revisão independente;
F07 integrado e produção `NO_GO`.

## O que foi observado

A [captura histórica](historical-blank.png) mostra uma tela branca. No
[trace preservado](historical-trace.zip), as linhas 15–17 do membro
`0-trace.trace` registram `net::ERR_NETWORK_CHANGED` ao carregar os módulos
`react_jsx-dev-runtime.js`, `vite/dist/client/env.mjs` e
`rolldown-runtime-DC62tzP2.js`. As linhas 5–7 de `0-trace.network` registram
as três requisições com status `-1`, antes do timeout do heading.

Isso sustenta uma falha de carregamento de módulos naquele ensaio. A
mudança de rede/processo do host que a provocou **não foi identificada**.
Não foi alterada a rede da máquina. Não há request `/v1/` registrado no
intervalo capturado; isso não prova ausência fora dele nem demonstra falha
de autorização. Um timeout anterior à montagem também não avalia contraste
ou acessibilidade de uma tela que não chegou a aparecer.

## Ensaios executados

O [snapshot](setup.json) foi criado do commit
`4ae40d69b77c5b422a6302efac5cfcee005d6f1b` na branch
`aud0578-remediation-20260926`, com cópia independente de dependências já
instaladas. Os arquivos alterados ou não versionados no root compartilhado
ficaram fora do snapshot. Não houve instalação nem alteração de lockfile.

| Execução                             | Chromium | Firefox | WebKit | Resultado e causa observada                                                                                                           |
| ------------------------------------ | -------- | ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| [Primeiro ensaio](matrix-run.json)   | 0/5      | 0/5     | 0/5    | Saída 1; o snapshot não tinha `packages/shared/dist/index.js`, exigido pelo export de `@cvg/shared`. O Vite não resolveu esse import. |
| [Segundo ensaio](matrix-r2-run.json) | 5/5      | 5/5     | 5/5    | Saída 0 após compilar o pré-requisito; 15/15 testes, sem skips, flaky ou retries.                                                     |

A preparação foi corrigida somente no snapshot, em Node `22.23.2`:

```bash
node_modules/.bin/tsc -b packages/shared/tsconfig.json --pretty false
node --input-type=module -e "import { redactSensitiveText } from '@cvg/shared'; console.log('shared_export', typeof redactSensitiveText)"
```

A compilação saiu 0; o import imprimiu `shared_export function`. Nenhuma
asserção, timeout ou política de retry foi alterada. A primeira falha foi
preservada em [log](matrix.log) e [relatório bruto](matrix-raw.json).
O [segundo log](matrix-r2.log) e seu [relatório bruto](matrix-r2-raw.json)
registram uma única tentativa por teste, em todos os três projetos.

Esses dois resultados de preparação foram observados pelo líder em
chamadas nativas separadas do runner. O campo `buildExitCode: 0` no runner
é um registro literal desse resultado; não captura a execução do compilador.
O [revisor](I1-review.md) apontou esse limite P2: o pacote não oferece log
independente do compilador nem prova de build limpo reproduzível. O dado não
deve ser usado como gate automatizado de compilação.

O comando de matriz está no runner e nos metadados:

```bash
node node_modules/.bin/playwright test --config=playwright.f07.config.ts --output=/tmp/cvg-aud0590-f07-20260929/test-results-r2 --retries=0
```

O segundo comando durou 79,678 segundos, incluindo inicialização/encerramento
do runner. As 4.874 fontes rastreadas do snapshot mantiveram seus hashes nas
duas execuções. As portas exclusivas `3267/4267` estavam livres após cada
ensaio. A [prova](proof.json) vincula os resultados a 15 artefatos com hashes,
conferidos pelo líder diretamente contra os arquivos e as linhas dos
relatórios brutos. Essa conferência do executor não é revisão independente.

## Escopo e limites

A API usou uma [fixture adicional](loopback-main.ts) com a mesma composição
do `main.ts` do snapshot e bind alterado apenas para `127.0.0.1`. A
[configuração adicional](loopback-playwright.config.ts) mantém a matriz
original e restringe os dois listeners a loopback. Os arquivos originais
ficaram intactos. Essa derivação é explícita: **não prova o entrypoint
publicado sem adaptações**.

O cenário usa bootstrap sintético, sessão em memória e respostas simuladas
em parte das rotas. Não exercita OIDC corporativo, MFA, sessão PostgreSQL,
duas instâncias produtivas, provider/canal real ou dados reais. O ambiente
herdou somente HOME/LANG/LC_ALL/PATH; não recebeu as credenciais de banco ou
provider nem o `.env` do root. Nenhum processo produtivo foi modificado.

Houve **uma matriz válida com resultado verde** após corrigir a preparação.
A matriz inválida de preparação não é uma segunda execução aprovada. As
duas execuções vinculadas ao candidato exigidas pelo
[runbook](../../../../runbooks/homolog-browser-accessibility.md) continuam
pendentes, assim como a matriz no candidato integrado, o report formal
`browser-proof`, CI e certificação. O ensaio não demonstra que a falha
histórica de rede foi eliminada nem mede sua frequência.

## Entrega documental

O runbook recebeu o pré-requisito de compilação e a triagem de tela branca,
preservando seus gates e a falha inicial. Links e higiene de evidências
passaram em Node 22.23.2, com 681 JSON parseados e zero erros na checagem
após essa edição. Os scripts de preparo e execução ficam neste pacote para
rastreabilidade; seus caminhos absolutos descrevem o ambiente deste ensaio.

As [verificações finais](verification.md) registram os checks documentais
e a ressalva de whitespace no log bruto preservado, sem apresentar o check
integral de diff como aprovado.

O [parecer I1](I1-review.md) aceitou o diagnóstico e o complemento T1,
confirmou os resultados brutos e preservou os P1 de causa histórica e
qualificação integrada, além do limite P2 do registro de build. Foram seis
anotações axe sem violações no segundo ensaio, duas por navegador. F07/A59-08
permanece aberto para qualificação integrada. Nenhuma produção, atualização
de dependência ou mudança de segurança do produto foi autorizada por este
relatório.
