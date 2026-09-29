# F14 / PR-402 — decisões de retenção antes do BUILD

**Estado:** `WAITING_CONTROLLER_DPO_DECISIONS / BUILD_NOT_AUTHORIZED / NO_GO`.
Fonte técnica: [SPEC 0149](../../../../02_spec/0149_operator_auth_purge.md),
SHA-256 `aeb8033b29fd07725023cb7679b92030e4d68af81bfc88b08e1f4610489f5c9f`,
e [inventário DB-09](../../../../platform/09-personal-data-inventory.md).
I24/I25 aceitaram a SPEC para revisão; nenhum prazo, controlador ou DPO foi
presumido aqui. Este pacote recolhe decisões, não as concede.

## Identificação obrigatória da decisão

| Campo                                                           | Valor a registrar pelo responsável             |
| --------------------------------------------------------------- | ---------------------------------------------- |
| Controlador, DPO/encarregado e aprovador com autoridade         | **PENDENTE**                                   |
| Produto/tenant abrangido e ambiente                             | **PENDENTE**                                   |
| Finalidade, versão da política e referência imutável da decisão | **PENDENTE**                                   |
| Data, início de vigência e próxima revisão                      | **PENDENTE**                                   |
| Digest do candidato e configuração a que a política se aplicará | **PENDENTE** — vincular antes de A2/A3 da SPEC |

## DP-01 a DP-06

| ID    | Resposta exigida                                                                                                                                                                  | Impacto se ainda pendente                                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DP-01 | Segundos de guarda após expiração de `oidc_login_states`, inclusive `0`, com finalidade.                                                                                          | Sem cutoff aprovado para state; não semear `0002`.                                                                                                                         |
| DP-02 | Segundos após o **último** vencimento da família de sessões, inclusive `0`, com finalidade.                                                                                       | Purga pode romper revogação por cookie antigo; não executar.                                                                                                               |
| DP-03 | Política única da plataforma **ou** prazos por tenant/produto, com abrangência explícita.                                                                                         | State não contém tenant; opção por tenant exige redesenho e nova SPEC.                                                                                                     |
| DP-04 | Prazo de guarda de backups/PITR, **prazo de reexpurgo após restauração** e tratamento de pedidos de eliminação em cópias.                                                         | DELETE da tabela ativa não demonstra eliminação nos backups. Restore exige bloquear serving ou revogar todas as sessões restauradas até revalidar relógio, policy e purge. |
| DP-05 | **Finalidade e necessidade** de guardar linhas revogadas até o último vencimento da família, responsável pela revisão e cadência.                                                 | RIPD/registro de tratamento e política versionada incompletos.                                                                                                             |
| DP-06 | Idade máxima **finita** da família, ou aceitação expressa de retenção potencialmente sem limite, registrando **finalidade, risco aceito, idade de alerta e cadência de revisão**. | `replace` atual pode prolongar a família; limite finito exige novo contrato atômico de troca de família com MFA e revisão humana T3.                                       |

Os valores DP-01/02 precisam respeitar o domínio técnico `0..31536000`
segundos da SPEC 0149; esse limite **não** é recomendação de prazo.

Em DP-03, política por tenant **exige redesenho e nova revisão da SPEC**,
pois o state atual não contém tenant. Em DP-06, idade máxima finita
**exige novo contrato atômico de troca de família com MFA**, que defina a
criação da nova família, a revogação da anterior e o significado de logout
com cookie antigo após a troca. Ambos os casos exigem crítica independente
e revisão humana T3 do contrato novo antes de BUILD. A opção de idade sem
limite também depende da decisão expressa descrita na tabela e de desenho
de BUILD reconciliado com ela; não está aprovada por este pacote.

O runbook de PITR deve **bloquear serving ou revogar todas as sessões
restauradas até revalidar relógio, policy e purge**: a restauração pode
reativar uma sessão ainda dentro da validade. Registrar e testar o prazo
de reexpurgo decidido em DP-04 no
[runbook de incidentes](../../../../runbooks/staging-incident-response.md).
Uma resposta verbal sem identidade, escopo e referência versionada não é
manifesto de policy.

## Gate após a decisão

1. Controlador/DPO registram DP-01..06, finalidade, autoridade e versão; a
   engenharia reconcilia a decisão com SPEC 0149 e o inventário de dados.
2. Se o contrato técnico mudar, atualizar SPEC, obter crítica independente e
   revisão humana T3 do hash novo **antes** de BUILD. Sem mudança, ainda é
   necessária a revisão humana T3 da SPEC atual.
3. Em BUILD sintético, provar migration/preflight/roles, duas réplicas,
   concorrência, família prolongada e PITR/reexpurgo conforme §Prova da SPEC;
   o job permanece desligado até gates de rollout A0–A4. Nenhuma prova
   isolada fecha F14/G08 nem autoriza dados reais.

Até essas decisões e provas, o armazenamento atual permanece sujeito ao
risco de acúmulo descrito na SPEC; não executar purge manual nem alterar
retenção de backups por inferência.
