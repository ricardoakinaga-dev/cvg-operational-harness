# I11 — revisão independente da SPEC do marcador de relógio

**Veredito: ACCEPT**

**SHA-256 verificado antes da leitura:** `c33410876ef204faa655e41c663630bed127a9d9df274c50fd9427f86a07e53e`

## Resultado

Não encontrei contradição material que impeça implementar o contrato descrito no candidato revisado. A revisão ficou restrita ao arquivo identificado pelo hash acima; nenhum parecer/evidência anterior, outro documento do repositório, código, histórico Git ou referência externa foi consultado.

A sequência temporal é implementável: lock da linha antes da amostra, captura PostgreSQL com precisão de microssegundos, receipt externo antes de escrita SQL, consumo one-use do attest e atualização monotônica no mesmo COMMIT da reserva, seguida por receipt de COMMIT antes de comando ou resposta de sucesso. Uma SAMPLE witnessada que sobreviva a rollback é tratada como máxima externa e exige reconciliação antes de nova decisão. Os caminhos de bootstrap e recovery mantêm ingress fechado até receipt, readback e transição witnessada de abertura.

As regras de assinatura especificam o formato do timestamp, signing input, HMAC, bytes de body, janela inclusiva e rejeições de parsing; a representação canônica em microssegundos evita arredondamento na passagem por SQL, runtime e attests. Os limites de privilégio e as funções `SECURITY DEFINER` fixas definem papéis distintos para runtime, bootstrap, reconciliação, recovery e owners, com checks de ACL efetiva e de claims vinculadas à transação. Retries, rollback, ACK incerto, replay e crash têm estados duráveis e regras de falha fechada definidos.

## Findings

Nenhum finding P0, P1 ou P2.

## Cobertura de aceitação e risco residual

Os testes exigidos cobrem as propriedades que sustentam este aceite: crashes em cada fronteira de receipt/COMMIT, regressão do relógio, retry e `UNKNOWN_COMMIT`, round-trip temporal e assinatura, consumo/replay de attests, ACLs e memberships efetivos, reconciliação, recovery break-glass, leases, failover/restore e rollout. Esses testes continuam necessários para demonstrar que a implementação respeita o contrato, em especial a independência e durabilidade de observer, witness, sink e autoridade de fencing.

Este parecer aceita somente a consistência e implementabilidade da SPEC revisada. A própria SPEC mantém BUILD condicionado à aprovação humana T3 explícita e não autoriza operação em produção.
