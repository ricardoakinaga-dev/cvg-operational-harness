# SPEC 0162 — crítica independente I7

- Candidato examinado: SHA-256 `ee949d17daa04241131bae402bd49f5c28e61f4dcda38a5e81b772d2d497bc8e`.
- Método: leitura fresh-context somente da SPEC indicada; o hash confere. Nenhum arquivo foi alterado e nenhum BUILD foi iniciado.
- Veredito: `REVISE`; sem achados P0. Há três P1 e quatro P2. Esta revisão impede aceitar o contrato para migration 0028.

## P1

1. **A garantia de durabilidade em rollback contradiz a transação.** A SPEC afirma que a maior amostra sobrevive ao rollback, mas grava marcador e reserva no mesmo COMMIT, e registra no observer somente depois. Se a transação colher 10:05 e sofrer rollback antes do COMMIT, ambas as gravações desaparecem; um restart com relógio em 10:04 não terá evidência de 10:05. Referências: linhas 6, 11, 23 e 38–42 do candidato.
   - **Mudança mínima pedida:** escolher e declarar a garantia. Para preservar toda amostra observada, especificar registro ordenado e durável separado que sobreviva ao rollback, além de teste de crash depois da amostra e antes do COMMIT. Se somente autorizações committed contam, ajustar objetivo e critérios.

2. **A autoridade de quem aprova break-glass não está definida.** Há requisito de duas pessoas distintas e mapeamento de fingerprint para issuer/subject, porém a política/manifesto não vincula esses sujeitos a uma autoridade de recovery. Duas chaves válidas, distintas e não autorizadas poderiam satisfazer as verificações descritas. Referências: linhas 21 e 64.
   - **Mudança mínima pedida:** definir política assinada e corrente que vincule chaves aprovadas a identidades imutáveis e à autoridade de aprovar recovery, incluindo validade e revogação; testar rejeição de assinaturas válidas de identidades não aprovadas.

3. **O fencing de HA não tem prova verificável.** A SPEC exige cercar externamente o primary antigo e permitir no máximo uma promoção por epoch, mas não define evidência que prove que ele não aceita writes nem emite receipts do observer/witness. Uma partição pode deixar o primary antigo gravável durante a promoção. Referências: linhas 52 e 84.
   - **Mudança mínima pedida:** definir a autoridade de fencing, token/prova verificável por epoch e rejeição de epochs antigas no banco e na admissão do witness; testar que o primary antigo não reserva, finaliza ou obtém receipts após promoção.

## P2

1. **Interrupção/restart da migration não está especificado.** Idempotência é requerida sem modelo transacional/serialização ou recuperação para falha entre DDL, grants, trigger e bootstrap respaldado pelos ledgers. Referências: linhas 23 e 79.
   - **Mudança mínima pedida:** definir atomicidade, concorrência, estados parciais permitidos, rerun e recuperação de bootstrap com gate fechado; injetar interrupção em cada fronteira e validar o procedimento.

2. **A borda `EXECUTE` deixa `PUBLIC` implícito.** As funções `SECURITY DEFINER` são executáveis pelo executor, mas não se exige revogar o `EXECUTE` padrão de `PUBLIC` nem verificar privilégios efetivos no preflight. Referência: linha 30.
   - **Mudança mínima pedida:** revogar `EXECUTE` de `PUBLIC` e de roles não autorizadas, conceder somente ao executor e testar grants efetivos.

3. **Bootstrap aceita timestamp infinito.** `timestamptz NOT NULL` aceita `infinity` e `-infinity`, podendo tornar o high-water inutilizável. Referências: linhas 19 e 23.
   - **Mudança mínima pedida:** exigir timestamps finitos na constraint e no preflight; testar rejeição das duas infinitudes em bootstrap e update.

4. **O benchmark p99 não é reproduzível.** O mix e limite de latência não fixam topologia, hardware, standby/witness, warmup nem fronteira de medição. Referência: linha 83.
   - **Mudança mínima pedida:** especificar fixture e método, inclusive se toda a cadeia de receipts está dentro da medição.

## Consequência

A SPEC precisa de revisão documental e de nova crítica independente sobre o novo hash. A decisão humana T3 e o BUILD da migration 0028 continuam pendentes/não autorizados.
