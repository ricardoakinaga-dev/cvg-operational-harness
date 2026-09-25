# Decisão humana informada — M07-S1-R1

- Registro feito em `2026-09-24T02:38:07Z` (horário do registro; a mensagem não trouxe horário próprio).
- Mensagem do usuário nesta rodada: “Aprovação reconhecida para o gate R1 revisado, SHA-256 75a9967b…c4b3fc1. A primeira pré-condição falhou: node --version retornou v24.20.0, mas o gate exige v22.23.2. [...] A aprovação continua válida; posso retomar quando o ambiente já estiver usando Node v22.23.2.” O usuário pediu verificar o próximo passo e desbloquear a construção.
- Pedido aprovado identificado por SHA-256 integral `75a9967b1ad7dfc426fccd1a5cabb2a9e29f2a937188e33605e2ddb03c4b3fc1`: [r1-gate-request.md](r1-gate-request.md). O pedido abrange o adendo SPEC-M07-R1-v2 e o BUILD local corretivo delimitado. A decisão anterior do M07-S1 original permanece histórica e separada.
- A tentativa relatada parou na primeira pré-condição com Node `v24.20.0`. Não autoriza prosseguir essa tentativa, alterar os quatro paths ou executar os demais comandos naquele ambiente.
- A aprovação R1 continua vinculada aos bytes do pedido acima. A retomada exige **novo shell já iniciado com Node `v22.23.2`**, primeira linha do gate `node --version` e todos os preflights restantes conforme o pedido, antes de qualquer BUILD. Nenhuma mudança de `.nvmrc`, NVM default, instalação ou troca de runtime dentro do gate é autorizada por este registro.
- G21-5/G21-6 seguem fechados, produção `NO_GO`; sem dados reais, serviço externo ou ação sensível.
