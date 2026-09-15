# AAA-13 — revisão independente do rework R3

Veredito: **REWORK**. AAA13-C3-F01 fechado no recorte de evidência ausente; dois novos contraexemplos bloqueiam o aceite dos parsers. Nenhum DONE, certificado atual ou gate concedido.

Três hashes do candidato conferidos. Self-test original reexecutado em cópia descartável: **19/19 PASS**, incluindo C0 positivo e C1–C9 negativos com códigos próprios. Histórico: **exit 0, 27 hashes**, sem qualificar o candidato atual.

| Finding           | Evidência observada pelo CLI público                                                                      | Causa e aceite exigido                                                                                                                                                               |
| ----------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AAA13-C5-F01 / P1 | R1: coverage `statements: {}` sem `pct`, métricas declaradas preservadas → exit 0, nenhuma falha          | Subtração de `undefined` produz NaN; comparação de tolerância não detecta ausência. Exigir número finito 0–100 antes da comparação para cada percentual.                             |
| AAA13-C5-F02 / P1 | R2: 14 assertions `skipped`, métricas coerentes `executed=14, passed=0, failed=0` → exit 0, nenhuma falha | `status !== pending` conta skips como execução; ausência de falhas não prova passagem. Validar estados e inventário; skip/estado desconhecido não contam como executado ou aprovado. |

O runner adversarial saiu **1** porque R1/R2 deveriam rejeitar e aceitaram. Não foi erro incidental: ambos os processos do verificador saíram **0** e retornaram zero failures; C0 e todos os testes anteriores continuaram PASS. A instrumentação adiciona casos somente ao harness em cópia isolada; o caminho de verificação padrão e a biblioteca não foram alterados. Resultados/hashes das fixtures foram atualizados juntos para exercitar a semântica dos bytes, dentro do limite de confiança já declarado.

Reprodução: `python3 docs/04_audit/evidence/AAA/AAA-13/review-coordinator-rework-r3/reproduce.py` a partir da raiz. Script cria e remove apenas seu diretório temporário, preservando os certificados do repositório; reexecução atualiza os logs deste parecer. Evidência detalhada em `checks.json`, `adversarial-results.json` e logs adjacentes.

Nenhuma suíte completa, Docker, benchmark ou full certify reexecutado; os números do executor permanecem evidência histórica do candidato entregue. O defeito de ausência de evidência foi corrigido; estas novas hipóteses são sobre validação dos resultados brutos, não uma repetição da hipótese anterior. Limite de tentativas do plano preservado.

Próxima ação única: [Agente 3 — validação de resultados brutos](next-task-agent-3.md). Frentes 1 e 2 preservadas.
