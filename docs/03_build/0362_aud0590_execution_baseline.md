# AUD-0590 — M0: baseline de execução e autoridades

**Captura:** 28/09/2026, 23:01 BRT. **Estado:** `M0_IN_PROGRESS`;
programa `IN_PROGRESS`; produção `NO_GO`.

O pedido de implementação integral tem como contrato o
[roadmap 0360](0360_aud0590_remediation_roadmap.md) e o
[backlog 0361](0361_aud0590_remediation_backlog.md). A
[barra v1](../04_audit/evidence/AUD0590-EXEC-20260928/quality-bar-v1.json)
congela F01–F15, G01–G13 e os invariantes de processo/segurança antes de
novos BUILDs. O [inventário observado](../04_audit/evidence/AUD0590-EXEC-20260928/m0-inventory.json)
é um snapshot, pois outros agentes trabalham no mesmo diretório.

## Identidade do candidato e força da prova

| Papel               | Revisão/estado observado                                                                                                                      | O que a prova cobre                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Root compartilhado  | `3aa5330b7e195524ea51da90f56ffe23bf1004a4`, branch `aud0578-remediation-20260926`; 12 caminhos modificados e 162 não rastreados no inventário | Fonte corrente de integração; **não** é candidato de release limpo ou certificado.          |
| AUD-0590            | `eff8e0d8974f2c3222eb4602e4a37ff73c708245` + alterações locais manifestadas                                                                   | Baseline histórica de auditoria: 68/100 maturidade, 30/100 prontidão, `NO_GO`.              |
| OIDC composto local | `7ef74e7f4fd2b1141e416b85c7337f119e1333ab` em worktree isolado                                                                                | Prova local de identidade/PG/Keycloak; não comprova integração do root nem IAM corporativo. |
| Webhook isolado     | `aad04d9ace6ed5b6d9c9902f4ddcad67b87a4abc` em worktree isolado                                                                                | Prova de fatia sintética; P1 de high-water/reconciliador e integração continuam.            |

Há 16 worktrees no inventário, com provas de candidatos distintos. O SHA do
root é a **base de trabalho**, não o SHA final a promover. O primeiro
candidato de integração deve ser materializado após a PR-L04 e as fatias
autorizadas, com fontes/artefatos congelados num manifesto único; até lá,
qualquer certificado ou teste de outro SHA permanece evidência isolada.

## Claims, gates e próximo trabalho por fronteira

| Fronteira                                                             | Dono/estado observado                                              | Gate para o próximo BUILD                                                                 | Próxima prova com valor                                                         |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `apps/api/src/server.ts`, web/legado, skip catalog e lockfile parcial | PR-L04 de Claude Code `ATIVO` no quadro de coordenação             | SPEC 0142 T3 aprovada para a fatia do dono; nenhum outro agente edita paths reivindicados | concluir PR-L04, liberar os caminhos e testar o fluxo neutro no root            |
| Replay temporal F01                                                   | fronteira temporal/SQL em BUILD local; worktree de inbox `aad04d9` | SPEC 0160/0161 e 0162 aprovadas para BUILD sintético; migration 0028 ainda não executada  | high-water/reconciliação e prova integrada; crítica local permanece condicional |
| Preflight F02                                                         | task `PR-301-FENCING-CONSTRAINT-PREFLIGHT` registrada              | SPEC 0158 aprovada para BUILD sintético; worktree F02 reivindicado                        | negativo PostgreSQL de tabela-isca, `CHECK(true)` e constraint inválida         |
| OTel F03                                                              | `PR-403`/`PR-604` no backlog                                       | contrato SPEC T3 e revisão humana antes de alteração da fronteira de dados                | marcador sintético inspecionado na entrada do SDK e em todos os sinks           |
| Sessão F04                                                            | PR-301/302 em provas isoladas; root aguarda PR-L04                 | SPEC 0144 aprovada para BUILD sintético                                                   | entrypoint real com PG, duas instâncias, cookie, revogação e navegador          |
| Dependências F05                                                      | PR-205 no backlog; lockfile não liberado integralmente             | task e SPEC curta T2; claim exclusivo do lockfile após PR-L04 ou fatia disjunta           | `npm audit`, `npm ls` e regressão no lockfile integrado                         |
| Release F06–F09                                                       | PR-003/009/007 e checks remotos abertos                            | claims de E2E/certify e SHA integrado; SPEC 0157/0159 T3 pendentes onde aplicáveis        | uma barra Node 22/PG/browser/CI/atestação no mesmo SHA/digest                   |
| M4/M5                                                                 | decisões e ambiente externo ainda não comprovados                  | T4 hash-bound, DPO/produto/operação e autorização humana específica                       | staging, restore, pentest e piloto com critérios de saída                       |

O quadro de claims e a SPEC 0190 são autoridade dinâmica; esta tabela é um
retrato datado. Antes de tocar código, verificar novamente os caminhos, a
revisão humana da SPEC exata e os testes de fronteira exigidos.

## Ordem segura agora

1. Reproduzir e fechar, em superfícies disjuntas, os negativos de M1 para os
   quais já haja SPEC/gate válido. Onde o gate T3 está pendente, preparar
   evidência e contrato sem iniciar BUILD.
2. Ao PR-L04 liberar a composição, integrar as fatias de sessão/boot/webhook
   numa baseline única e rodar a API publicada com PostgreSQL. Reabrir
   qualquer prova que tenha ficado stale por mudança de bytes.
3. Congelar o SHA/digest e executar M3; manter decisões e preparação de M4
   em paralelo, sem efeito externo real antes de T4.

## Execução local de F01 após o inventário

Sob o claim `PR301-WEBHOOK-WINDOW-BOUNDARY-002`, a fatia local corrigiu o
limite exclusivo `(ts+T+1)*1000`, passou o timestamp assinado à reserva e
revalidou a janela com `clock_timestamp()` no `INSERT`/`UPDATE` condicional.
O store em memória usa o mesmo relógio injetado e fecha ao detectar
regressão. O teste PostgreSQL sintético exercita a decisão SQL no último
milissegundo válido e no primeiro inválido por função de relógio isolada no
schema de teste, além de smoke com relógio real. Isso não implementa o
marcador durável, a saúde chrony/NTP, o fencing de efeitos nem o
reconciliador B3. A crítica independente I1 rejeitou a primeira versão por
falta da checagem na mutação; I2 confirmou a lacuna A2 e a antiga ausência de
prova SQL na borda. A rechecagem I3 e a regressão final são anotadas no
handoff/evidência quando concluídas. F01 permanece aberta.

O [pacote T3](../04_audit/evidence/AUD0590-EXEC-20260928/t3-review-packet.md)
apresentou separadamente as SPECs 0162 (high-water) e 0158 (preflight), com
hashes exatos e limites de BUILD sintético. O usuário aprovou ambas nesta
conversa; F02 começou em worktree próprio e F01 high-water ainda depende de
integração com o protocolo da SPEC 0162.

## Limites desta rodada M0

Este mapa não executou migration, lockfile, E2E, certificação, push,
deploy, dado real ou autorização T4. O inventário
mostra trabalho concorrente em ledgers, 0356 e código; as entradas de
continuidade ficam no handoff próprio até esses caminhos estarem livres.
M0 só pode receber `PASS` quando um candidato de integração identificável e
um dono por fatia estiverem registrados sem conflito, e o mapa for revisado
contra o estado então corrente.
