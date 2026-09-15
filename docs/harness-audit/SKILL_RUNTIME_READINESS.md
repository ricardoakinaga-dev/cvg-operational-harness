# Skill Runtime readiness

## Veredito

**ABSENT como conceito de runtime; score 1/10.** Prompts, workflows, tools, plugins e policies existem, mas nenhum satisfaz isoladamente “conhecimento reutilizável sobre como cumprir uma classe de tarefa”.

Embriões: workflows de scheduling/handoff/institutional/journeys; prompt blocks versionados; agent-eval scenarios; plugin capability requirements implícitos. Eles devem permanecer product-owned até existir contrato validado por dois produtos.

Faltam `SkillManifest`, registry, loader, version, capability requirements, compatible profiles, policy constraints, inputs/outputs, checkpoints, stop rules e eval suite. Uma Skill não deve executar effect diretamente nem embutir credentials/provider.

Proposta mínima futura:

```text
SkillManifest { id, version, goal, inputs, outputs,
  requiredCapabilities, policyRefs, promptRefs, evalRefs }
SkillRuntime.load(snapshot) -> verified immutable skill
```

Primeiras Skills candidatas ficam no Secretary: `scheduling-draft`, `handoff-management`, `institutional-answer`. Só mover abstração após o exemplo Corp provar generalidade.
