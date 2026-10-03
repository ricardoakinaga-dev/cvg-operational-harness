# Revisão humana T3 — emendas B2/B3, 03/10/2026

Estado: **APPROVED_USER_LOCAL_SYNTHETIC / BUILD_AUTHORIZED_LOCAL_ONLY**. Aprovações separadas recebidas de Ricardo para os dois hashes concretos; [recibo de autoridade](audit-actions/human-t3-approval.json). O usuário autorizou emendar e depois aprovar por partes. Esta revisão apresenta **dois itens separados: SPEC 0179 e SPEC 0180**, pelos hashes novos do manifesto. A correção T2 C1 foi autorizada por B1 e segue independente. A decisão B3 mantém NO_MODEL; D2 continua aberta como decisão separada do produto.

## Documentos concretos

- [SPEC 0179 — confiabilidade do consumidor](../../../02_spec/0179_shift_consumer_reliability.md): confirmação explícita, vínculo fonte/paciente, journal V2 com migração conservadora, inbox/outbox duráveis, lembretes concorrentes, pausa independente, limites, backup/restore, alertas, imagem e preparação do piloto. [Diff das emendas](audit-actions/spec-0179-amendments.diff).
- [SPEC 0180 — transporte, gateway, CI e segurança](../../../02_spec/0180_shared_transport_ci_security.md): consumo governado dos exports públicos, budget diário persistente, cancelamento/deadline, recepção/descompressão limitada, jobs e evidências por artefato, variante sem produto e tratamento de advisories. [Diff das emendas](audit-actions/spec-0180-amendments.diff).
- [Manifesto de revisão](spec-human-review-inputs.json) vincula os dois textos ao SHA-256. Alteração material posterior exige revisão da diferença antes do BUILD correspondente.

## Política vigente e decisão separada D2

Notas, transcrições e memória de pacientes recebem CLINICAL, inclusive dados fictícios. B3 conserva **NO_MODEL**, com resultado esperado `policy_denied` antes de budget/provider e zero chamadas no oracle de classificação. A migração pública é qualificada positivamente com prompt não clínico e provider sintético de fixture. Isso não autoriza organizar conteúdo clínico por modelo nem reclassificá-lo como INTERNAL.

Revisão da D2 está [aberta no backlog próprio do consumidor](../../../../products/shift-assistant/docs/backlog.md#decisão-separada--revisão-da-d2-organização-por-modelo). A pendência limita a organização clínica do D009, preservando fatias independentes. Esta revisão não inclui autorização para exceção CLINICAL. O comportamento proposto exige implementação depois do aceite T3; texto da SPEC não é prova de que o consumidor atual já usa o gateway governado.

## O que mudou após a crítica

As duas críticas históricas de prontidão foram REJECT, preservadas em spec-review-r1/r2. As emendas atuais, autorizadas por B2/B3, acrescentam normalização local determinística pt-BR sem converter unidades, associação por bloco/campo/valor/unidade e evidência por quote com offsets calculados pelo serviço; atualizam a data da movimentação sem inventar aceite T2. A 0180 conserva NO_MODEL, exige R01–R15 em V011, manda re-congelar inputs no início do BUILD e reconcilia baselines históricas; grupos de dependências são vinculados aos consumers observados. Não houve nova aprovação técnica dos contratos nem implementação T3.

## Pontos em aberto da auditoria

- **S1:** equivalência de números por extenso passa a ser contrato local proposto, com [41 casos numéricos de dados](../../../../products/shift-assistant/src/__tests__/fixtures/reliability/numeral-equivalence-cases.json), incluindo os dez textos de áudio e negativos. Parser/serviço ainda NOT_RUN; literal de fonte continua visível e ambiguidade bloqueia.
- **S2:** classificar notas clínicas como CLINICAL e conservá-las negadas; D2 separada pendente. O positivo não clínico da migração não qualifica organização clínica.
- **S3:** modelo fornece quote; serviço atribui bloco e calcula UTF-16. [21 casos propostos](../../../../products/shift-assistant/src/__tests__/fixtures/reliability/quote-evidence-cases.json) cobrem índice antigo errado, trecho ausente, repetição, sobreposição e não-BMP; execução do produto NOT_RUN.
- **S6 / AP-011:** [pesquisa primária dos recibos](audit-actions/ap011-provider-delivery-receipt-r1.md) encontrou suporte documental em WAHA e Evolution/Baileys. Adapter, autenticação, correlação, restart, operação saudável/offline e alvo de entrega ≤60 s continuam sujeitos a qualificação; nenhum requisito foi relaxado.
- **S7/S8:** V011 exige R01–R15. Baselines 2357 PASS/189 SKIP e 2650 PASS/0 SKIP são históricas, de candidatos distintos; os 990 são subconjunto da segunda. Não são denominador do BUILD futuro. Re-congelar candidato/inputs antes da implementação aprovada.

Os hashes atuais e estados separados de revisão constam do [manifesto](spec-human-review-inputs.json). Aprovar somente uma SPEC não aprova a outra; trabalho dependente da segunda aguarda sua decisão. Mudança material posterior exige apresentar o diff afetado e seu novo hash.

## Alcance da decisão

Aprovação separada permite implementar e testar localmente a SPEC correspondente com dados sintéticos, preservando os 24 cartões/aceites originais. Ordem do produto: journal/migração, inbox/outbox, rascunho/associação/confirmação, depois lembretes/controle, imagem/rede e restore/alerta, com dependências aplicáveis. Valores de preço/orçamento, credenciais reais, contratos, guia lido por humanos, áudios qualificados, CI remoto e piloto de duas semanas continuam dependentes de seus owners e gates concretos. Aprovação T3 não é certificação T4 nem aprovação de provider/piloto.

## Regra que exige a revisão

`docs/07_agents/AGENTS.md`, D-12: **“T2 + revisão explícita da SPEC pelo usuário antes do BUILD”** para contrato público, schema/migration, segurança, identidade, policy ou approval. O plano anexado diz que o usuário revisa o diff e aprova 0179/0180 separadamente. A revisão explícita foi recebida pelos hashes concretos acima; o recibo satisfaz este gate para BUILD local sintético. O texto das SPECs permanece byte-exato para preservar a vinculação da aprovação.
