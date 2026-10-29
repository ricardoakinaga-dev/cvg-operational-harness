# AUD0625-F03C-SPEC-D9 — fase 1 da SPEC 0281 (sem correção)

Base `879b4e0346e6b4602e022c3b956c7cf996b8683f` (já contém a 0278). Nenhum arquivo de produção foi alterado. Sem push; produção `NO_GO`.

- SPEC: `docs/02_spec/0281_exam_egress_upload_hardlink_refusal.md`, estado `PROPOSED_FOR_HUMAN_T3_REVIEW`.
- Teste: `packages/channel-gateway/src/__tests__/aud0625-f03c-exam-hardlink.test.ts`, 3 `it.fails` e 4 controles; passa hoje (4 passam e 3 falham como esperado).
- Falha pela razão do defeito ([red-on-base.txt](red-on-base.txt)): com os `it.fails` trocados por `it`, `expected 'SUCCEEDED' not to be 'SUCCEEDED'` (envio para fora e dois nomes dentro) e `expected false to be true` (o journal foi reservado). Prova original da revisão: [review-probe-out.txt](review-probe-out.txt).
