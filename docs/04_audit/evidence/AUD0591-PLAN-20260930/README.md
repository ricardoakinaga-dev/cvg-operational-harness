# Evidências de planejamento AUD0591-PLAN-001 — 30/09/2026

[Roadmap](../../../03_build/0363_program_roadmap_2026-09-30.md) · [backlog](../../../03_build/0364_program_backlog_2026-09-30.md) · [handoff](../../../08_runtime/handoffs/aud0591_plan_20260930.md).

- `baseline.json`: HEAD/branch/dirty status e hashes das fontes consultadas antes da autoria; não é novo release candidate.
- `execution-map.json`: fotografia derivada dos 52 cartões e encaminhamento das 83 tasks de origem. 0364 é canônico para UP91; 0356 continua canônico para PR. Não editar o JSON como um backlog paralelo.
- `validate_plan.py`, `traceability-validation.json`: validação estrutural das entregas contra a fotografia de origem; cobertura 23 achados/42 critérios/13 gates/83 tasks, IDs/dependências e grafo acíclico. A ordem topológica considera relações entre cartões, sem conceder BUILD.
- `independent-review.json`: revisão somente leitura do plano e resposta do líder; parecer de planejamento, não certificação do sistema.
- `document-checks.json` e logs: links/higiene, formatação apenas das entregas próprias, diff do claim e JSON. Não executar prettier global para corrigir arquivos de outros agentes.
- `source-preservation.json`: fontes preexistentes/ledgers preservados; somente seção própria do claim alterada.
- `artifact-manifest.json`: hashes das entregas e provas; exclui o próprio manifesto.

Esta rodada produziu documentação T1. Não executou testes/builds de produto, PostgreSQL, E2E, certify, SBOM/licenses, push, deploy ou integrações externas. Resultados de runtime citados nos documentos pertencem à auditoria anterior e têm suas limitações explícitas. Estimativas são propostas de esforço, não prazos prometidos nem decisões de fornecedor/produto.

Para reproduzir a validação: `python3 docs/04_audit/evidence/AUD0591-PLAN-20260930/validate_plan.py` a partir da raiz. Se editar o backlog no futuro, atualizar sua fotografia derivada e os hashes/provas de planejamento; não manter status em duas fontes independentes.
