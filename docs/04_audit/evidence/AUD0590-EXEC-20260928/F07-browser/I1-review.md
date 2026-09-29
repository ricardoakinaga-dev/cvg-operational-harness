# F07 — parecer independente do diagnóstico e runbook

**Data:** 29/09/2026. **Revisor:** Popper,
`01a0ebd4-e628-77c0-a033-102877b6ea0f`, contexto independente
(`fork_context: false`, nível I1), somente leitura. Parecer final recuperado
pelas ferramentas nativas de ciclo de vida; agente encerrado após concluir.
Este arquivo sintetiza o resultado recebido.

**Veredito:** `ACCEPT_LOCAL_DIAGNOSTIC_SCOPE`, incluindo o complemento T1
do runbook. **Não fecha A59-08/F07 nem autoriza release.**

## Resultado conferido diretamente

| Projeto  | Primeiro ensaio | Segundo ensaio | Tentativas por teste |
| -------- | --------------- | -------------- | -------------------- |
| Chromium | 5 falhas        | 5 aprovados    | 1 por ensaio         |
| Firefox  | 5 falhas        | 5 aprovados    | 1 por ensaio         |
| WebKit   | 5 falhas        | 5 aprovados    | 1 por ensaio         |

Os relatórios brutos registram as mesmas cinco specs por projeto, status
esperado `passed`, `repeatEach=1`, `retry=0`, zero skips e zero flaky.
Saídas 1 e 0, respectivamente, sem timeout global. O segundo ensaio contém
**seis anotações axe**, duas por navegador, todas sem violações; não são
quinze análises axe.

## Achados e limites preservados

| Severidade                         | Evidência e conclusão                                                                                                                                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1 — causa histórica aberta        | `historical-trace.zip`, membros `0-trace.trace:15–25` e `0-trace.network:5–7`: três módulos interrompidos por `ERR_NETWORK_CHANGED`, HTML/main HTTP 200 e `#root` vazio. O evento do host/rede não está identificado. Não declarar definitivamente flake de infraestrutura ou causa eliminada.    |
| P2 — registro de compilação        | `run_matrix_recheck.py:57` contém `buildExitCode: 0` literal, não capturado pelo próprio runner. O export do shared, existência do dist, 81 hashes gerados e segundo ensaio sustentam o diagnóstico, mas não equivalem à revisão independente de log do compilador ou build limpo reproduzível.   |
| P1 — qualificação integrada aberta | Apenas uma execução integral aprovada, dependências copiadas e listener de desenvolvimento derivado, sem vínculo formal runId/candidateId. Faltam duas execuções qualificadas e prova do candidato integrado; bootstrap/memória e mocks não comprovam autorização backend, PostgreSQL ou IdP/MFA. |

A falha de import no primeiro ensaio novo é distinta do erro de rede
histórico. O revisor verificou o export `dist/index.js` do shared, o destino
de emissão do tsconfig e a cadeia de montagem/imports. Não atribuiu o erro
histórico à falta de dist.

A fixture de API confere com o `main.ts` do snapshot, com uma única troca
de listener para loopback. O wrapper mantém a matriz-base e apenas troca
o comando da API e restringe o Vite. As cópias dos artefatos e do checkout
coincidem; diferenças entre configurações dos ensaios limitam-se a saídas.
O runbook recebeu duas inserções, sem remover ou alterar as exigências
anteriores de navegadores, retries, timeouts, axe e qualificação.

## Integridade e execução do revisor

O revisor conferiu **20 inputs permitidos** do sentinel de 22 entradas,
iguais antes/depois. `proof.json` e `collect_evidence.py` foram excluídos
de sua leitura para não antecipar a interpretação do executor. O ZIP
passou na conferência de CRC, seu screenshot coincide com a imagem direta
e a spec nele corresponde à do snapshot. Hashes internos dos dois ensaios
conferem. O líder confere separadamente todos os 22 inputs e os três
suplementos no [registro de integridade](review-integrity.json).

SHA-256 dos suplementos, iguais antes/depois segundo o revisor:

- Runbook atualizado: `c0d6b49200a1034598f161006bdd63073ffd0217ed34dadd4ac94b96f5fbba0c`.
- Runbook original no snapshot: `e93e87d3ca0d81a8137e99feb18129014171649b6b299d37681ce56d19d071bf`.
- Script original `rem21-014-browser-proof.mjs`: `2c397f70c85b253832b333577f93f206aaee691d25f1c27c553b469a158162f8`.

O primeiro parecer foi `REVISE — revisão incompleta`, por dificuldade
relatada para descobrir a ferramenta executável. O próprio revisor
corrigiu esse estado no parecer final: as leituras locais terminaram com
código 0 e a limitação foi superada. A causa da não execução inicial não
foi demonstrada; não há fundamento para classificá-la como bloqueio de
segurança ou permissão.

O revisor declarou nenhuma escrita, teste, compilação, npm, navegador,
banco, rede, cache ou descendente. A verificação de integridade cobre
inputs delimitados, não o workspace compartilhado inteiro.

**Produção `NO_GO`.** Os achados de qualificação e de causa histórica
permanecem abertos; a aceitação limita-se ao diagnóstico local e ao texto
do runbook.
