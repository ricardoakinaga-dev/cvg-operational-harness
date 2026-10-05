# OPS_RAW_RECEIPT_R8 — consistência da evidência bruta

Task registrada na coordenação. BUILD local T2 dentro da SPEC0179 aprovada e autorização contínua do usuário.

A crítica independente OPS_R7_F01 reproduziu recibos com raw divergente ou não JSON sendo promovidos a entrega verificada por commit/replay. O checksum do raw sozinho não prova identidade.

Corrigir somente o produto isolado: validar o contrato bruto do simulador e comparar provider, accountRef, providerMessageId, recipient, deliveryStatus e simulation com os campos projetados. Compatibilidade legada deve conservar o documento e negar prova quando não verificável; não fabricar evidência, reescrever journal nem enfraquecer assertivas originais.

Pronto exige reprodução antes/depois, controle positivo, negativos de cada campo e JSON inválido por append/replay, regressões originais, tipos/lint e nova revisão independente. Gates integrados PostgreSQL/E2E permanecem obrigatórios antes promoção. NO_MODEL, dados sintéticos, zero provider real, sem push ou produção.
