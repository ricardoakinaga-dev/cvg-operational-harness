# AUD37-DOC-001 — L02 glossário padronizado

- Data: 24/09/2026.
- Resultado: `COMPLETED_DOCUMENTAL`.
- Escopo: vocabulário de approval, handoff, gate, candidate, tenant, release e estados; referências adicionadas ao README operacional e à constituição de agentes.
- Artefatos: [glossário canônico](../../../../architecture/GLOSSARY.md), [README](../../../../README.md) e [constituição](../../../../07_agents/AGENTS.md).

## Decisões documentais

- Os termos em inglês usados em IDs e contratos permanecem inalterados; o glossário define a forma em português e desambigua contextos homônimos.
- Os cinco estados CVG foram registrados conforme `docs/07_agents/AGENTS.md`. Estados de `ApprovalRequest`, `AgentVersion`, resultados de gate e decisão de produção são explicitamente separados.
- Approval de gate, ApprovalRequest, handoff, candidate de entrega, `ReleaseCandidate`, tenant e release têm escopo e fontes de verdade indicados.
- Nenhum contrato, enum, evento, API, regra de negócio ou código foi alterado.

## Verificação estática

- `node scripts/check-doc-links.mjs docs/README.md docs/architecture/GLOSSARY.md docs/07_agents/AGENTS.md` — exit 0; `broken=[]`, `nonPortableAbsolute=[]`, `unallowlistedNonPortableAbsolute=[]`; `DOC_LINKS_OK`.
- `git diff --check -- docs/README.md docs/07_agents/AGENTS.md` — exit 0.
- Inspeção local de whitespace/newline — três documentos, sem trailing whitespace e com newline final.
- Conferência dos cinco estados oficiais — todos presentes no glossário e coincidentes com os identificadores da constituição.
- Nenhuma suíte de produto, typecheck, lint, coverage, serviço, banco ou rede foi executada.

## Limites preservados

Este fechamento documental não altera o estado técnico de M07-S1 (`FAIL / OPEN`), não executa C1H e não libera M07-S2/S3/S4, M05, G21-5/G21-6 ou produção. O pedido C1H segue pendente conforme seu próprio decision-record e SHA-256 `d2e03fb29f0e95efdb418fa47e984ee2bcac4e77fbd244bb9f2b162caead046f`.

