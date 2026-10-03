# Revisão humana T3 — implementação do plano 0369/0370

Estado: PENDING_USER_REVIEW. Data: 03/10/2026. A execução estrutural T2 segue independente. Esta revisão decide os contratos antes do BUILD sensível, conforme D-12 de `docs/07_agents/AGENTS.md`.

## Documentos concretos

- [SPEC0179 — confiabilidade do consumidor](../../../02_spec/0179_shift_consumer_reliability.md): confirmação explícita, vínculo fonte/paciente, journal V2 com migração conservadora, inbox/outbox duráveis, lembretes concorrentes, pausa independente, limites, backup/restore, alertas, imagem e preparação do piloto.
- [SPEC0180 — transporte, gateway, CI e segurança](../../../02_spec/0180_shared_transport_ci_security.md): consumo governado dos exports públicos, budget diário persistente, cancelamento/deadline, recepção/descompressão limitada, jobs e evidências por artefato, variante sem produto e tratamento de advisories.
- [Manifesto de revisão](spec-human-review-inputs.json) vincula os dois textos ao SHA-256. Alteração material posterior exige revisão da diferença antes do BUILD correspondente.

## Decisão material de segurança

Notas/transcrições/memória de pacientes recebem CLINICAL. A política atual é NO_MODEL para essa classe, incompatível com o uso externo aprovado em D2. SPEC0180 propõe exceção opcional por grant Ed25519 emitido por responsável humano, limitado a tenant, classe, tarefa, prompt/hash, provider/model/host, até oito horas, teto de input/output e referência de approval/DPA. Sem grant válido, a chamada continua negada. Não há permissão para FINANCIAL/CREDENTIAL, ferramentas ou ação clínica; autorização operacional real exige seu próprio gate.

A revisão precisa aprovar expressamente essa proposta de segurança, ou orientar a preservação de NO_MODEL e revisão de D2. Aprovar apenas a extração estrutural não resolve essa decisão.

## O que mudou após a crítica

Foram duas críticas independentes de prontidão, ambas REJECT, preservadas em spec-review-r1/r2. A última apontou três lacunas; o Lead revisou os contratos para exigir entrega comprovada em até um minuto (aceitação HTTP não basta), orçamento persistente com reservas antes do I/O e recuperação/restart, e a classificação/exceção explícitas acima. Não há novo PASS de crítico sobre esses textos revisados. Essa limitação deve acompanhar a decisão; os oracles propostos serão executados no BUILD autorizado e julgados independentemente.

## Alcance da decisão

Aprovação permite implementar e testar localmente as SPECs com dados sintéticos, preservando os 24 cartões/aceites originais e tratando falhas como bloqueios. Valores de preço/orçamento, credenciais/grants reais, contrato com provider, guia lido por humanos, áudio validado e piloto de duas semanas continuam dependentes de seus owners e gates concretos. Aprovação T3 não é certificação T4 nem aprovação do piloto.

## Regra que exige a revisão

`docs/07_agents/AGENTS.md`, D-12, linha103: **“T2 + revisão explícita da SPEC pelo usuário antes do BUILD”** para contrato público, schema/migration, segurança, identidade, policy ou approval. Por isso, o código dessas mudanças aguarda a revisão dos textos concretos acima. Silêncio não é aprovação.
