# Resposta documental à revisão I1 r1

O REVISE original e a SPEC revisada original foram preservados. Nenhum BUILD.

- P1 descoberta: GET cases para Supervisor/Admin lista também roots sem grants; AUTH03 inclui primeiro grant sem SQL.
- P1 namespace: rotas existentes e submit público fixados core; harness só produtor confiável com par validado; novo audit harness exige conversationId/sessionId. AUTH06/07 incluem colisão e ambiguidade, sem fallback.
- P2 handoff: par persistido human_takeover recebe mensagem estática, mantendo FAILED_TERMINAL; UNKNOWN_EFFECT tem precedência; tabela fechada de mappings públicos e teste específico.
- P2 sessão/principal: snapshot lê case_principals vigente; role divergente/disabled401 para read/manage; cookie/login não restaura registro; provisioning interno CAS/versionado e auditado, sem endpoint público de role. Produtor corporativo real UNKNOWN e qualificação bloqueada, não inferido de0152.

Novo pacote selado r2 é revisto por crítico distinto, sem encaminhar este rationale ou o parecer anterior. Só prontidão técnica/documental, sem gate humano.
