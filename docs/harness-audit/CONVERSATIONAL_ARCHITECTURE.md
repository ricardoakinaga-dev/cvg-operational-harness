# Arquitetura conversacional atual

## Estado observado

A conversa é controlada por classificação lexical, policy e templates. Intent usa palavras-chave (`packages/platform/src/test-lab.ts:584-605`); respostas vêm de templates (`:653-711`); output policy procura padrões proibidos e pode reescrever toda a fala (`packages/platform/src/output-policy.ts:47-73`, `:147-199`). O modelo default é fake/determinístico.

Há controles operacionais reais: takeover é máquina de estado (`packages/platform/src/handoff.ts:3-48`), worker suprime automação fora de `BOT_ACTIVE`, actions sensíveis pedem handoff/approval e o gateway valida tools. Porém segurança e linguagem ainda estão acopladas: a mesma regex que evita claim perigosa determina a frase final.

## Liberdade versus autoridade

| Dimensão          | Estado atual                                                           |
| ----------------- | ---------------------------------------------------------------------- |
| linguagem livre   | baixa; templates e rewrite lexical                                     |
| factual grounding | apenas pergunta institucional reconhecida                              |
| action authority  | mais madura; policy, approvals, scopes, journal                        |
| dialogue state    | takeover/session persistidos; sem slots, tópico, ambiguidade ou reparo |
| “should respond?” | takeover/handoff determinístico; sem decisão conversacional própria    |
| interrupções      | takeover/cancelamento; sem interrupção semântica                       |

`clarificationCount` recebe `history.length`, não número real de clarificações (`test-lab.ts:254-263`). Isso exemplifica controle aproximado que pode endurecer a conversa sem representar o estado real.

## Separação recomendada

`FREE LANGUAGE GENERATION + GROUNDED FACTUAL CLAIMS + GOVERNED ACTIONS`: o composer pode variar linguagem; cada claim verificável carrega evidence/provenance; toda capability passa pelo kernel determinístico e por approval quando aplicável. A proposta detalhada está em `NATURAL_CONVERSATION_TARGET.md`.

Score sugerido de conversa natural: **2/10**; estado conversacional: **4/10**.
