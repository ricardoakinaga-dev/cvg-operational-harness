# CODEX100-PLAN-20261017 — evidências do planejamento

[Plano0384](../../../03_build/0384_plano_executivo_paridade_codex.md), [roadmap0385](../../../03_build/0385_roadmap_paridade_codex.md), [backlog0386](../../../03_build/0386_backlog_paridade_codex.md) e [catálogo](../../../03_build/tracking/codex100_catalog_v1.json).

- [surface-inventory.json](surface-inventory.json): 657 entradas estruturais de schemas e fontes. CLI/TUI usam extração lexical; cfg, aliases e alcance precisam da revisãoG01. Não prova dispatch ou completude funcional.
- [upstream-tree.json](upstream-tree.json): 9.288 caminhos Git do snapshot pinado. Indexar não significa inspecionar/testar cada arquivo.
- [source-index.json](source-index.json): fontes com SHA-256 e permalinks. Os quatro [schemas de referência](reference) estão preservados byte-exatos. Nomes protocolares foram comparados com o artefato da0620, sem declarar equivalência fonte/binário.
- [plan-index.json](plan-index.json): 49 cartõesDX100, dependências, fatias técnicas C100 propostas, ROM e cenários derivados. É snapshot de planejamento, não outro ledger de execução.
- [verification.json](verification.json): documentação, estrutura, DAG, cobertura, cálculos, identidade e limites. [manifest.json](manifest.json): hashes finais dos artefatos.

O catálogo permanece aberto atéG01/G02:22famílias,379obrigações funcionais e22controles, zero qualificados. Nenhuma exclusão silenciosa; medidas literal e governada separadas. ControlesCVG usam SPEC/prova institucional, sem exigir internoCodex inobservável.

Nenhum teste funcional de runtime/Rust, modelo, provider ou serviço foi executado nesta rodada. Não houve revisão independente nova nem autorização de BUILD. PAR/C100/produção e evidênciasREA anteriores foram preservados. Os deltas dos ledgers estão no [handoff](../../../08_runtime/handoffs/codex100_plan_20261017.md).

[Drift concorrente](concurrent-drift.json): ledgers e documentos de outras tasks avançaram durante a autoria. A [primeira verificação](verification-r1.json) falhou na suposição de hashes estáveis; foi preservada. A verificação final registra a limitação e reconfirma os insumos/IDs do planejamento, sem restaurar ou sobrescrever fontes alheias. [LICENSE](UPSTREAM-LICENSE.txt) e [NOTICE](UPSTREAM-NOTICE.txt) acompanham os schemas copiados.
