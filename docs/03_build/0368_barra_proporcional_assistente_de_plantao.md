# 0368 — Barra proporcional de produção do Assistente de Plantão

- Data: 30/09/2026. Decisão: [ADR-009](../architecture/adrs/ADR-009-assistente-de-plantao.md).
- Status: `PROPOSED / WAITING_RICARDO_APPROVAL` (AP-004).
- Substitui, para o uso interno pela equipe da CVG, as 13 condições de GO do
  [0354](0354_production_executive_plan_2026-09-26.md), que permanece como
  histórico.

O assistente entra em uso com a equipe quando as 8 condições abaixo forem
verificadas no mesmo deploy. Cada item é verificado antes do piloto e revisto
quando algo relevante muda.

| #   | Condição                                                                                                                                              | Como se verifica                                                                                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | **Só a equipe fala com o assistente.** Lista de números permitidos; o resto é ignorado e registrado.                                                  | Teste com número não cadastrado.                                                                        |
| 2   | **Poder zero por construção.** Sem ferramenta de escrita no HIS, shell, arquivo ou rede livre.                                                        | Revisão da lista de ferramentas; container sem shell e sem root; disco somente leitura; rede por lista. |
| 3   | **HIS somente leitura.** Credencial com escopo mínimo.                                                                                                | Tentativa de escrita recusada pelo HIS.                                                                 |
| 4   | **Segredos fora do código e da imagem.**                                                                                                              | Varredura de segredos no CI; segredos só por variável ou cofre do servidor.                             |
| 5   | **LGPD básica.** Contrato de tratamento com o provedor de IA (ou transcrição local); notas e áudios apagados após N dias; registro do que é guardado. | Documento de uma página e teste de expurgo.                                                             |
| 6   | **Backup testado** das pendências e da auditoria.                                                                                                     | Um restore feito e registrado.                                                                          |
| 7   | **Alguém sabe quando quebra.** Alerta se o assistente parar de responder ou de disparar lembretes.                                                    | Teste de parada com alerta recebido.                                                                    |
| 8   | **Botão de desligar.** O gestor desliga o assistente em um passo, sem perder pendências.                                                              | Teste do desligamento e da retomada.                                                                    |

## O que deixa de ser exigido para começar

Pentest externo, PITR com RPO/RTO formal, on-call escalonado, certificação com
16 gates, IdP corporativo com MFA para o console e zero itens P1 no backlog.

Esses itens voltam a ser avaliados se o assistente passar a escrever no HIS, se
for usado por outra organização ou se o painel web abrir para a internet.
