# F05 — pacote de revisão humana T3

**Decisão solicitada:** aprovar ou rejeitar BUILD **sintético** da
[SPEC 0164](../../../../../02_spec/0164_dependency_advisory_remediation.md)
SHA-256 `e485c7d37354ca33a9054ad47d05ec0aa8e601358f0f779cac70ed097705e6bd`.
[I2 independente](I2-review.md): `ACCEPT_SPEC_REVIEW_READY`, sem
P0/P1/P2. Aprovação humana: **PENDING**.

| Item | Escopo submetido |
| --- | --- |
| Problema | Lockfile atual resolve `fast-uri` 3.1.6 produtivo com advisory alto; `undici` 7.29.0 aparece na árvore de desenvolvimento com advisory moderado. [Baseline e fontes](../triage.md). |
| Mudança permitida | Após liberação/claim exclusivo de PR-L04: menor resolução compatível de `fast-uri` 3.x ≥3.1.7, preservar 4.x ≥4.1.4, `undici` 7.x ≥7.29.1; somente lockfile e metadados de resolução estritamente necessários. |
| Ambiente | Worktree e checkout descartáveis, Node 22.23.2/npm 10.9.8, dados e fixtures sintéticos. Instalação inicial sem scripts; `esbuild` reconstruído isoladamente após inventário/integridade. |
| Prova | Enumerar todas as entradas do lockfile e `npm ls`; audit produtivo e completo; fixtures URI de host/porta e controle benigno; typecheck, lint, testes, PostgreSQL, build e E2E com claims próprios; crítica do diff no SHA integrado. |
| Limites | Sem alterar código de produto neste corte; nenhum dado real, canal/provider externo, push, deploy, certificação sem claim, produção ou aprovação T4. A cópia Undici embutida no Node requer inventário separado. |
| Bloqueio atual | `package-lock.json` ainda é compartilhado com PR-L04; mesmo aprovado, BUILD só começa após liberação desse caminho e novo claim. |

Se a SPEC ou o escopo material mudar, o hash e a decisão T3 precisam ser
renovados. A aprovação deste pacote não fecha F05 nem autoriza release.
