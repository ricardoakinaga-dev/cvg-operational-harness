# AUD-0589 I2 — crítica independente fresh-context — 29/09/2026

## Decisão

`REVISE — severidade geral P2`. A evidência sustenta o resultado local condicional para os hashes examinados, mas a revisão do pacote atual encontra um selo principal desatualizado e uma frase sobre R8 mais ampla que a asserção executada. Não encontrei falha demonstrada no patch de sessão para o escopo sintético. `PRODUCTION_NO_GO` permanece correto.

O claim `AUD-0589-I2-CRITIQUE-001` estava `ATIVO` e cobria o relatório, os dois arquivos nos hashes solicitados, as evidências AUD0589, os critérios e as duas saídas I2. A seção administrativa do claim já existia; não a alterei. Não li o conteúdo de reviews I1, antes ou depois da análise inicial.

## R1–R8

| Critério | Parecer | Evidência e limite |
| --- | --- | --- |
| R1 | PASS | `probe-results.json` registra 61 templates, 108 pares e `routeRegistryChecked=true`; `route-tree.txt` é parseado e cada método/caminho é verificado com `app.hasRoute` em `probe.mts`. |
| R2 | PASS | Há 98/98 respostas 401 em cada um dos três cenários negativos. A classificação exclui explicitamente probes públicas, logout idempotente e webhooks cuja fronteira é a assinatura. Isso prova status de autenticação na instância sondada, não sucesso ou autorização de negócio dos handlers. |
| R3 | PASS | Os três controles com cookie vivo retornam 200: `/v1/session`, `/v1/tasks` e `/v1/admin/agents`. |
| R4 | OBSERVADO / contrato aberto | O bootstrap retorna 200, replay 401, e token HMAC válido sem cookie retorna 200 em `/v1/tasks` e `/v1/admin/agents`. O relatório registra essa compatibilidade e a ausência de proibição explícita na SPEC 0144. É uma credencial alternativa que não consulta o store de sessão; a revogação da sessão não revoga, por si só, um token ainda válido. O perfil sondado não demonstra a composição de replay distribuído de produção. TTL de 300 s e proteção por `jti` limitam a janela, mas a política precisa declarar se clientes confiáveis podem usar esse caminho. Sem contrato que o proíba, não classifico o fato como bypass não autorizado. |
| R5 | PASS | Logout sem cookie retorna 200 e a sonda registra zero chamadas a `revoke`. |
| R6 | PASS durante a execução; selo atual REVISE | `probe-results.json` registra HEAD e manifesto estáveis durante a sonda; o SHA de `server.ts` confere. Na revisão, quatro arquivos do manifesto de 181 fontes já diferem do estado medido, embora hook, teste e `server.ts` ainda coincidam. O manifesto raiz também falha em seis entradas atuais; detalhes abaixo. |
| R7 | PASS | A sonda usa identidade sintética, store em memória e `Fastify.inject`; não usa banco ou serviço externo. O suplemento PostgreSQL é uma execução separada e não transforma a sonda de rota em teste de composição de produção. |
| R8 | PASS no critério congelado | O adendo exige igualdade de **status** e zero lookup. O teste cobre os oito GET/HEAD e asserta exatamente esses dois pontos. Não compara corpo ou headers; a frase “mesma resposta pública” na linha 9 do relatório deve ser limitada a “mesmo status”, como já faz a tabela R8. |

## Achados P2

1. **Manifesto principal não confere com o pacote atual.** `proof.json` e `SHA256SUMS.txt` esperam SHA-256 `94afe8d4…` para o relatório; o arquivo revisado tem `a73b5a2a…`. A verificação de `SHA256SUMS.txt`, sem abrir nem hashear os dois caminhos I1, falha em seis entradas: backlog 0356, relatório AUD-0589, coordenação e os três ledgers. As outras entradas verificadas, inclusive probe, hook e teste, conferem. Parte do drift é concorrente e está fora do escopo desta revisão. O suplemento `pg-20260928` mitiga a lacuna: seu manifesto passa integralmente e seu `proof.json` registra o hash atual do relatório e os hashes corretos do hook, teste e `server.ts`. Ainda assim, a prova principal não está sincronizada com a revisão final; marque-a como snapshot histórico ou regenere um selo coeso sob claim próprio.

2. **R8 tem uma sobreafirmação pequena de cobertura.** O teste compara status e contagem de consultas. A barra R8 também pede somente isso, então o PASS do critério é válido; o texto “mesma resposta” pode sugerir igualdade de payload/headers que não foi medida. Corrija a descrição ou amplie a barra e a prova em uma rodada autorizada.

O caminho de token direto em R4 é risco residual de contrato, não finding de falsificação: a assinatura é validada, o token tem expiração e proteção de replay, mas não fica sujeito à revogação do registro de sessão. O relatório já marca a ambiguidade; manter essa observação e exigir decisão explícita antes de afirmar que o cookie é a única autoridade.

## Ambiente, hashes e limites

- A sonda principal foi executada em Node 24.20.0, com Fastify em memória e sem PostgreSQL. O suplemento foi executado em Node 22.23.2 e PostgreSQL 16 descartável: logs hash-bound registram 27/27 focados, 35/258 no gate PostgreSQL, 18/18 no store de sessão e suíte completa 2.401/2.401 sem skips. O manifesto próprio do suplemento passa.
- A execução principal Node 24 tem resumo transcrito sem stdout integral arquivado: 2.241 aprovados + 162 skipped. Esse total não reconcilia aritmeticamente com os 2.401 do suplemento; os perfis e versões Node são diferentes, portanto não inferi contradição de comportamento, mas o resumo principal é menos reproduzível.
- Os SHAs pedidos conferem: hook `6702e8b6…`, teste `a0943654…`; `server.ts` é `76a588fb…`. O relatório atual é `a73b5a2a…`, diferente do hash no selo principal e igual ao hash declarado no suplemento PostgreSQL.
- O manifesto dinâmico produzido na execução (`8172c077…`, 181 fontes) diverge hoje em quatro caminhos: `postgres-persistence-mode.test.ts`, `webhook-security.test.ts`, `tenant-preflight.ts` e `webhook-security.ts`. Os valores medidos e atuais estão em `I2-proof.json`. Não reexecutei a sonda para reconciliar esse drift.
- `server.ts` instala o hook apenas quando recebe `operatorSessionStore`; a composição PostgreSQL final com esse store não foi exercitada neste pacote. O relatório reconhece a dependência da PR-L04 e mantém produção `NO_GO`.

## Pendência que exige execução

Antes de qualquer conclusão sobre integração ou produção, fica pendente testar a composição final `buildServerFromEnv` + store PostgreSQL no candidato liberado pela PR-L04 e repetir a matriz de rotas no mesmo SHA integrado, em Node 22. Também seguem fora desta crítica OIDC/MFA corporativo, staging, CI/atestação e certificação. Não executei esses testes, SQL, migration, BUILD, push ou deploy.

A evidência local sustenta `CONDITIONAL_PASS_LOCAL` no snapshot medido. I2 fica `REVISE` até harmonização/versionamento do selo principal e precisão textual de R8; nenhum aceite de produção decorre desta revisão.
