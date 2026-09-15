# Factual grounding

## Taxonomia atual versus desejada

O sistema não possui classificador geral A–E. Há proxies dispersos: intent institucional, safety lexical, data classification, capability risk e output policy.

| Classe                       | Tratamento atual                                | Estado                                    |
| ---------------------------- | ----------------------------------------------- | ----------------------------------------- |
| A conversacional/não factual | templates/model fake                            | PARTIAL                                   |
| B factual fundamentada       | fonte institucional aprovada e versionada       | PARTIAL                                   |
| C operacional                | policy + tool/capability                        | IMPLEMENTED/PARTIAL                       |
| D sensível                   | safety/handoff/approval                         | PARTIAL                                   |
| E clínica/high-risk          | lexical block/handoff; nenhuma execução clínica | IMPLEMENTED no recorte lexical, não geral |

## Fluxo de fatos

Para `institutional_question`, o resolver recebe tenant/question; a fonte precisa corresponder ao binding de source/version e a ausência gera `approved_source_missing -> handoff` (`packages/platform/src/test-lab.ts:242-253`, `:625-650`). O catálogo RAG registra source/version e filtra tenant/status (`packages/rag/src/institutional-rag.ts:23-107`).

Gaps confirmados:

- provenance aparece no trace, não como citação verificável na resposta;
- freshness, confidence, source priority e evidence set não existem;
- database/calendar/history/operator input não compartilham contrato de evidência;
- grounding só vale para um intent lexical; uma resposta de outra classe pode conter claim sem validator;
- o kernel governado não possui porta de knowledge/fact validation;
- não há verificação de que cada claim final deriva de evidência.

Conclusão: ausência de fonte falha fechada no narrow path institucional, mas não está provado que toda ausência factual seja impedida de virar afirmação. Score sugerido: **3/10**.
