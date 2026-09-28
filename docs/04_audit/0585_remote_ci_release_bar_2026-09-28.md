# AUD-0585 — CI remoto e barra de release

- Data da consulta: 28/09/2026 UTC; [prova capturada](evidence/AUD0585-REMOTE-CI-20260928/proof.json).
- Escopo: GitHub REST API em leitura, PR #1, `main`, runs/checks, CodeQL e políticas de branch. Nenhum push, deploy, teste de produto ou dado real.
- Veredito: `REMOTE_CI_NOT_BOUND_TO_CANDIDATE / SECURITY_CHECK_FAILED / NO_GO`.
- [Crítica independente I1](evidence/AUD0585-REMOTE-CI-20260928/I1-review.md): `ACCEPT_SCOPE`, sem P0/P1 na auditoria.

## Identidade do candidato

| Objeto                           | SHA                                        | Estado                                                                                          |
| -------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `main` remoto                    | `02f586b221fc6582f23385c1736cce8e10438ea6` | check `secret-scan` falhou em 26/09                                                             |
| PR #1 remoto, draft              | `8ee6fa272072efe05fd63b7d708ba9b077280149` | último Verify e workflow Security concluídos com sucesso em 27/09; check CodeQL separado falhou |
| Root local no momento da captura | `f53dd1cfe954f311d762d97f84dc174cc183769c` | não publicado, portanto sem check remoto deste SHA                                              |
| Candidato isolado certificado    | `7ef74e7f4fd2b1141e416b85c7337f119e1333ab` | 16 gates locais arquivados, sem check remoto deste SHA                                          |

O último Verify remoto foi o run [36309111340](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/36309111340); Security foi [36309111343](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/36309111343). A API de check runs do PR retornou quatro sucessos e uma falha. Portanto, o sucesso agregado de dois workflows não representa uma barra de checks totalmente verde, nem qualifica o SHA local ou o candidato isolado. O run antecede os jobs locais de proveniência da SPEC 0147; a atestação externa do SHA final permanece pendente.

## Segurança e governança remota

O check [CodeQL reprovado](https://github.com/ricardoakinaga-dev/cvg-operational-harness/runs/108591838851) anotou um alerta **high** `js/incomplete-sanitization` em `scripts/workspace-dependency-audit.mjs:921`: `target.replace('*', captured)` troca só a primeira ocorrência. A fonte local ainda contém essa expressão. Esta evidência prova o alerta aberto e a expressão; não prova exploração. O tratamento exige triagem do fluxo de entrada, teste negativo e correção sob gate T3 antes de promover o candidato. A API de alertas do `main` remoto listou 15 alertas high abertos, vários em cópias históricas de scripts e outros em código de runtime; o número não deve ser interpretado como 15 falhas comprovadas no candidato local. A triagem precisa separar fonte ativa, arquivo histórico e falso positivo, mantendo os achados sem disposição formal como bloqueio de release.

A API retornou `404 Branch not protected` para a proteção de `main` e lista vazia de rulesets. Sem política de checks obrigatórios, o requisito da SPEC 0147 de exigir `Provenance policy` no merge não está demonstrado. O `main` remoto tem `secret-scan` failure no SHA consultado. Nenhum desses estados foi alterado nesta auditoria.

## Critério para reabrir o gate

1. Finalizar a composição do root após PR-L04 e corrigir o vínculo HEAD ↔ certificado da SPEC 0157 após aprovação T3; reemitir certificado no SHA definitivo.
2. Triar e resolver os alertas CodeQL aplicáveis à fonte ativa, com negativos e revisão T3; preservar evidência das disposições dos alertas históricos.
3. Publicar o SHA definitivo somente com autorização do usuário; executar Verify, Security e Provenance no mesmo SHA/digest e guardar check runs, manifesto e atestação verificada fora do job produtor.
4. Configurar proteção de `main`/ruleset para checks obrigatórios e verificar a política pela API. Confrontar todos os 13 critérios do [plano 0354](../03_build/0354_production_executive_plan_2026-09-26.md) no mesmo digest/configuração antes de qualquer decisão humana de GO.

Os testes de rotas e RBAC locais em AUD-0583/0584 não eliminam esta pendência. Produção permanece `NO_GO`.
