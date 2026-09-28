# SPEC 0160 — críticas independentes

## I1 — 28/09/2026

Dois críticos fizeram revisão somente leitura da SPEC e do candidato isolado
`7ef74e7`; não executaram testes nem alteraram arquivos. Ambos rejeitaram a
primeira versão para revisão humana T3, sem P0.

| Crítico | Achado bloqueante | Resposta na SPEC revisada |
| --- | --- | --- |
| Mendel, backend | Lease não protegia a transação inbound; resultado após commit e retry indefinidos; identidade replay/inbound sem vínculo; promessa indevida de execução externa única. | B1 exige commit atômico com token vigente, mensagem, outbox e auditoria durável; B2 fixa identidade imutável; B3 define recibo, redelivery e reconciliação; B4 limita garantia ao estado local e condiciona efeito externo ao provider. |
| Descartes, segurança | Autoridade temporal e instante decisório indefinidos; identidade/rotação sem vínculo; worker at-least-once incompatível com garantia externa; resolver injetado ausente do negativo. | A2 escolhe PostgreSQL como autoridade, `clock_timestamp()`, saúde e regressão; A3 fixa reserva como decisão final; B2 cobre rotação; B4 cobre at-least-once; C inclui composição produtiva e resolver injetado. |

O I1 também pediu crash antes/depois do commit, falha de resposta, redelivery
após expirar assinatura, caminho não durável sem efeito externo, clock inválido
e prova SQL com migrations reais. Esses casos estão em B3–B5 e nos critérios
de aceite. A sonda AUD-0587 demonstrou sobreposição e respostas 200/500; não
demonstrou duplicação externa.

## I2 — 28/09/2026

Ambos os críticos releram a revisão e mantiveram `REVISE`. O digest do corpo
bruto (sem timestamp/assinatura) resolveu a ambiguidade de redelivery
reassinada, mas restaram três pontos bloqueantes:

1. O vínculo do evento precisava persistir **antes** do commit final para
   rejeitar divergência após `release`. B1 agora fixa o vínculo em ledger na
   reserva; `release` só libera a posse.
2. A garantia de relógio precisava de fonte, erro de medição e condição de
   bloqueio. A2 agora escolhe NTP/chrony com fonte aprovada, amostra por
   reserva, limite conservador de offset/RTT/dispersão/deriva e recusa sem
   saúde temporal.
3. O recibo 200 de redelivery idêntica contradizia teste anterior que espera
   401. B3 e o gate agora exigem alteração explícita dessa asserção e
   preservação dos negativos. O gate também separa relógio injetado para
   fronteiras SQL de smoke real com `clock_timestamp()`.

## I3 — 28/09/2026

Descartes aceitou a SPEC para revisão humana, com P2 sobre referências de
mensagem/outbox e relógio na consulta de recibo. Mendel manteve `REVISE` por
dois P1: o orçamento temporal de 1 s permitia um salto adicional de até 1 s,
e o ledger com somente digest não permitia reconstruir a mensagem após crash
perto do fim da janela da assinatura. Ambos apontaram a definição das
referências como detalhe P2.

A2/B1/B2 da revisão seguinte definem orçamento **total** de erro, medição na
consulta de recibo, intenção recuperável cifrada com corpo verificado na
reserva, posse de processamento independente da janela da assinatura e
referências write-once no commit final. B5 testa crash no último milissegundo
da janela. A chave de replay foi alinhada ao namespace da credencial.

## I4 — 28/09/2026

Os dois críticos concluíram `READY_FOR_HUMAN_T3_REVIEW`, sem P1 impeditivo
restante **no contrato**. A2 agrega o desvio da mutação no orçamento total de
1 s; B1 persiste a intenção cifrada antes do inbound e permite recuperação
interna depois do vencimento da assinatura; B2 distingue vínculo imutável e
referências write-once. O texto final também mantém geração monotônica no
ledger após limpeza da reserva, impedindo ABA.

Os pareceres não atestam implementação: SQL, cifragem, medição NTP, fencing,
recuperação, provider e testes reais continuam pendentes. A SPEC pode ser
submetida à revisão humana T3. BUILD não está autorizado; produção `NO_GO`.
