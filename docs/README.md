# CVG Operational Harness — documentação operacional

Este diretório contém a documentação operacional do `cvg-operational-harness`.
O repositório é uma refoundation controlada originada em
`cvg-agent-secretary-v2`; referências históricas preservam a proveniência e o
produto legado, conforme `docs/refoundation/BROWNFIELD_ORIGIN.md`.

A fonte de verdade inicial e `BRIEFING/Blueprint — cvg-agent-secretary-v2`. Os demais arquivos de `BRIEFING/00...08` definem o processo CVG usado para transformar o blueprint em Discovery, PRD, SPEC, Build, Audit, loop operacional, skills, regras de agente e runtime.

## Ordem oficial

1. `blueprint`: consolidacao da visao base.
2. `00_discovery`: problema, dor, contexto, fluxo atual, valor e riscos.
3. `01_prd`: produto, casos de uso, escopo, regras, requisitos e metricas.
4. `02_spec`: arquitetura, dominio, contratos, dados, permissoes, integracoes e plano de build.
5. `03_build`: planejamento de execucao faseada.
6. `04_audit`: plano de auditoria e criterios de validacao em runtime.
7. `05_agent_loop_session_persistence`: continuidade operacional do agente executor.
8. `06_skill`: especificacao das skills CVG para Codex.
9. `07_agents`: constituicao operacional do repositorio.
10. `08_runtime`: arquivos de controle operacional.

## Decisao central

A Esmeralda V2 deve nascer como `Agent Platform Hospitalar`, nao como bot de WhatsApp. WhatsApp e apenas um canal conectado por adapter.

## Gates

Os gates criados nesta documentacao autorizam somente a evolucao documental e o planejamento de build. Eles nao autorizam build irrestrito, rollout, uso com dados reais ou automacao sensivel.

Estado atual apos auditoria critica:

- Discovery, PRD e SPEC estao utilizaveis como base documental.
- Build Phase 0 pode ser planejada, mas execucao de codigo deve respeitar os bloqueios formais.
- Workflows de agenda, RAG institucional, retencao de dados e qualquer acao sensivel exigem decisao humana registrada antes de implementacao funcional.
- Auditoria runtime real so existe depois de sistema executavel, observavel e com evidencias.

Para validar o briefing documental, executar:

```bash
npm test
```

Esse teste nao substitui testes do produto. Ele apenas garante que o pacote documental nao volte a sinalizar falso "ready" enquanto houver decisoes enterprise abertas.

## Agent Platform — estado da entrega controlada

O Control Center da Agent Platform está documentado em `docs/platform/` e preserva o data plane da Secretary. A implementação controlada inclui tenants, Agent/AgentVersion imutáveis, prompts, policies fail-closed, providers dry-run com `secretRef`, plugin gateway, Test Lab com trace/eval, handoff, publish/rollback, PostgreSQL, API/UI, rate limiting, auditoria e E2E de navegador.

Os limites de produção continuam explícitos: identidade confiável e tenant precisam ser fornecidos pelo ambiente hospedeiro; canais, RAG, pagamentos, ações clínicas, prontuários e dados reais permanecem desligados. O estado reproduzível e as limitações abertas ficam em `docs/99_runtime_state.md`, `docs/20_master_execution_log.md` e `docs/platform/08-security-release-boundary.md`.
