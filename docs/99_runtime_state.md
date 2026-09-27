# Estado operacional — CVG Operational Harness — 27/09/2026

- status: `IN_PROGRESS`.
- human_decision_required: `yes` para o primeiro consumidor, o piloto e qualquer uso real; os defaults conservadores do ciclo antigo estão no arquivo histórico abaixo.
- **Programa:** `PROD-20260926 / AUD-0578`, em execução. Produção `NO_GO`; apenas dados sintéticos e efeitos controlados.
- **Último candidato certificado:** commit `5ee02e8`, digest `b1189914d12910b3012a2d1ac000ac138437ba046ef195b93fd9d17f12b37582`, run `run-aud0578-rebound-20260927`. `certify` 16/16 PASS, `certification:verify` exit 0, 37 hashes conferidos; decisão mecânica `CONDITIONAL_GO / AAA_CONTROLLED`. Evidência em [certification](../certification/phase10-result.json). A branch R2 corrente já altera documentação e requer nova certificação antes de qualquer alegação de candidato atual.
- **CI:** Security verde para `5ee02e8`; Verify [36298961234](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/36298961234) falhou apenas no gate de certificação após os 16 comandos internos passarem: `metrics.unit=null` ao ler o resumo textual. [SPEC 0147](02_spec/0147_certification_vitest_json_metrics.md) corrige a extração pelo JSON bruto no candidato R2. PR de rascunho [#1](https://github.com/ricardoakinaga-dev/cvg-operational-harness/pull/1).
- **Produto:** D-03 = A, núcleo governado completo como intenção de piloto. D-04 = definir em discovery; o usuário informou que ainda não há candidatos. [PR-101](00_discovery/0019_platform_first_consumer_pilot.md) segue `NOT_VALIDATED`.
- **Frentes:** Codex conduz R0–R2 da [AUD-0578](04_audit/0578_program_comprehensive_audit_2026-09-26.md); Claude Code conduz FL do legado, conforme [coordenação](08_runtime/agent_coordination.md). PR-005 está em andamento na branch isolada R2.
- **Bloqueios:** F1 depende de primeiro consumidor, responsável, fluxo, tenant, volume e SLA; fases seguintes dependem de decisões, PRD/SPEC e gates próprios. A [SPEC 0146](02_spec/0146_pinned_ssrf_lookup_node22.md) aguarda revisão humana T3 para corrigir o lookup SSRF reproduzido em Node 22. Nenhum provider, canal, dado real ou produção irrestrita foi autorizado.
- **Próxima ação:** fechar os gates T2 da PR-007/PR-010, congelar e certificar o candidato R2; depois repetir Verify e Security no SHA final.

O estado anterior foi preservado em [arquivo navegável](08_runtime/archive/2026-09-27-pr005-runtime-state.md) e [cópia exata](08_runtime/archive/2026-09-27-pr005-runtime-state-source.txt), SHA-256 `d8bf98f38e556642d014a8af405c8674ffe9d084c68404298f3c231612a963c9`.
