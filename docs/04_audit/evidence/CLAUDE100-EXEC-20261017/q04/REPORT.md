# PAR-Q04 — servidor de falhas concluído e integrado

O suporte privado executa HTTP real em loopback com o provider e o gateway existentes. Cobre sucesso, erro 429, timeout, desconexão, JSON inválido e chunks/SSE sintéticos. Gravação, replay e refresh têm receitas fechadas, limites, guarda de credenciais e persistência exclusiva. As causas nativas dos erros e do cleanup são preservadas.

A candidata congelada no commit `26d866c39060669680aca01b34a916d45e1ba362` passou nos **16 gates**. O verificador oficial confirmou os **38 hashes** e a identidade `a1144d31b23362b3c93bc6f510f849adae4017d7dab1ffab104e49f6ec639212`, run `run-a1144d31b233-mvd2pnh9`. O [manifesto](cert-r1/manifest.json) vincula os 161 arquivos brutos arquivados.

| Verificação | Resultado |
| --- | --- |
| Suíte geral | 4.665 aprovados, zero falhas, um pendente igual à baseline |
| PostgreSQL | 302 aprovados, zero falhas ou skips |
| E2E | 12 aprovados, zero skips ou flaky |
| Revisão independente | 614 testes aprovados, zero achados pendentes |
| Verificação após integração no checkout principal | 702 testes aprovados em 12 arquivos, zero falhas ou pendentes |

A [revisão independente R2](review-r2/report.md), por Fermat, confirmou a correção de dois defeitos de causalidade encontrados em R1. Foi usado um dos dois retrabalhos permitidos. Os 23 pins continuavam iguais ao aceitar o certificado. MF01–MF07 passaram no escopo privado.

A [integração](../integration-result.json) promoveu os **55 arquivos** de Q03, SPEC0229 e Q04 com bytes idênticos à fonte certificada. Todas as preimagens foram conferidas; os 20 demais arquivos sujos foram preservados. O checkout principal passou nos 702 testes focados em Node 22.23.2. Seu certificado global não foi reemitido, pois ele também contém documentação concorrente. Não houve commit no root, push ou deploy.

O [cleanup](resource-cleanup.json) confirmou a ausência do PostgreSQL exclusivo depois de uma única parada. Duas asserções do wrapper falharam ao comparar maiúsculas no diagnóstico do Docker; o diagnóstico e a correção foram registrados, sem repetir a parada.

Os chunks descrevem escritas locais, sem atestar fronteiras TCP ou streaming de modelo em produção. O teste de falha em `Server.close` injeta o callback somente após o fechamento real; o negativo com outro UID não foi executado. Esses limites constam do parecer. Não houve captura funcional do Claude, prova de M1 ou crédito nas 117 capacidades e 17 controles.

PAR-Q03 e PAR-Q04 estão concluídos pelos seus aceites. C100-Q01, M1 e o programa integral permanecem abertos. O resultado mecânico `CONDITIONAL_GO / AAA_CONTROLLED` pertence exclusivamente à candidata local e não autoriza produção.
