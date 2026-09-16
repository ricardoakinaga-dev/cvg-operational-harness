# Revisão independente AAA-06 — contrato de composição

- Artefato: `docs/02_spec/aaa_composition_contract.md` (v1 revisada; v2 publicada com as condições C1–C4 fechadas).
- Revisor: crítico fresco independente, sem contato com o autor; leitura direta do contrato, do pacote de decisões, do backlog canônico e do código (`agent-runtime`, `approval-engine`, `policy-engine`, `persistence`, `server.ts`, `worker`).
- Veredito v1: **APPROVE_WITH_CONDITIONS**. C1 e C2 bloqueavam o congelamento; C3/C4 recomendadas.
- Condições e fechamento (detalhe no §10 da v2):
  - C1 (F1/F2): `KernelCommand` indefinido e mapeamento opaco → substituído pelo mapeamento normativo `toGovernedTurnInput`; `operationKey`/`proposalInput` removidos dos tipos da fronteira.
  - C2 (F3/F4/F6): claims em tempo presente e N4/N8 além do código → recastados como alvo de `AAA-21`; N4 restrito a efeito real/high-risk; N8 como minimização por construção.
  - C3 (F5/F7): colisão de nome e autoridades SQL → `DurableApprovalStorePort` (persistência apenas, engine mantém transições); `platform_capability_approvals` (0002) e `approval_requests` (0000) nomeadas e distintas.
  - C4 (F8–F11): `frontier_not_configured` separado por caso; artefato de evidência/neutralização/equivalência fixados; identidade atribuída a `AAA-20`; bloco de revisão/status adicionado.
- Achados P3 remanescentes aceitos com registro: limite do cache de replay (precedente da wave de identidade), exposição de `proposeInput` documental, e o fato de que a prova de equivalência só existe quando `AAA-21` for construída.
- Limites: sem shell/execução nesta revisão (documento); nenhuma evidência executável de fronteira existe ainda; a v2 fecha as condições documentalmente e deve ser revalidada no BUILD de `AAA-21`.

Transcrição fiel do parecer do revisor (fonte primária; o agente não tinha ferramenta de escrita):

> Verdict APPROVE_WITH_CONDITIONS. F1 (P1) KernelCommand undefined → C1. F2 (P2) operation identity/proposalInput sem destino em GovernedTurnInput → C1. F3 (P2) claims em presente sobre estado inexistente → C2. F4 (P2) mecanismo de redaction não corresponde ao kernel → C2. F5 (P2) ApprovalStorePort re-especifica verbos do engine → C3. F6 (P3) N4 mais amplo que o código → C2. F7 (P3) autoridades SQL imprecisas → C3. F8 (P3) frontier_not_configured ambíguo → C4. F9 (P3) plano de verificação sem artefato/falsificabilidade/cenários → C4. F10 (P3) "kernel autoridade de identidade" ambíguo → C4. F11 (P3) cabeçalho sem revisão/status/caveat D01 → C4.
