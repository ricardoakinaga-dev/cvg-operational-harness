# Crítica I4 — SPEC 0162

- Decisão: `REVISE`.
- Independência: I1, contexto fresh sem herança; somente leitura.
- Artefato revisado: SPEC 0162 SHA-256 `80a6dc53ce2878f0eae636521135e59c08d957efdb0088023d11669ea7636589`; requisitos integrados das SPECs 0160/0161.
- Mutation sentinel: limpo. Hashes antes/depois iguais: 0160 `60068f6a75bf39e43a26b0bce59d71d2652681495a84bba15ea601819cd6bee5`, 0161 `efdb5da702dff515ad6b3450f8a1359608880657cf0b6a18eb9740258cd57111`, 0162 `80a6dc53ce2878f0eae636521135e59c08d957efdb0088023d11669ea7636589`.
- Severidade: 2 P1, 2 P2, nenhum P0.
- Execução: leitura normativa dos três contratos e análise estática; nenhum PostgreSQL/código/migration executado.

## P1 — a amostra posterior não avançava o marcador de forma durável

Na versão revisada, uma transação guard-only avançava o high-water; uma transação seguinte amostrava o relógio e verificava somente que continuava acima do marcador. Se o relógio regredisse para um valor entre o marcador e a amostra mais recente, mas dentro do orçamento A2, a próxima decisão poderia prosseguir. Uma assinatura já expirada na amostra anterior poderia voltar a passar. O risco está em “Avanço e decisão”, itens 1–2, em conflito com A2–A3 de 0160.

## P1 — reserva durável conflita com a transação de efeitos

0160 B1 e 0161 “Commit e transição” exigem reservar binding/intenção de forma durável antes de executar o comando e depois usar outra transação fenced para mensagem/outbox/audit. A decisão de 0162 agrupava reserve/receipt e os writes inbound finais em uma transação, sem determinar como preservar a reserva antes do comando. Assim, implementações poderiam executar o comando antes de a reserva sobreviver a crash/takeover.

## P2 — failover/restore de PostgreSQL não tinha gate de continuidade

A SPEC tratava boot/restart de API, mas não exigia fechamento em promoção de standby atrasado, restore/PITR, mudança de timeline ou perda de commits acknowledged. Uma réplica promovida poderia perder high-water e estado de inbox/outbox sem um evento que obrigasse a revalidar a continuidade antes de abrir serving.

## P2 — identidade das aprovações e confiança do recibo de export estavam incompletas

Dois pares de chaves poderiam pertencer à mesma pessoa, e a SPEC não definia uma trust root verificável para o receipt do sink imutável. Um registro de receipt editável pelo executor não prova export externo nem independência das duas aprovações.

## Estado após I4

O draft candidato responde com avanço high-water atômico junto da reserva/receipt antes do comando, transação separada de finalização, fail-closed para failover/restore sem prova de continuidade, identidade humana única por `issuer/subject`, e assinatura do recibo sob trust root do sink. Esse candidato ainda requer revisão I5 fresh-context e checks documentais. Nenhuma aprovação humana T3 ou autorização de BUILD 0028 foi pedida/recebida.
