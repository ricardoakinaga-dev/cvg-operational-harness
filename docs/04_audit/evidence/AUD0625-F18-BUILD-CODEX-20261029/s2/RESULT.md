# F18 S2 — autoridade privada e fatos monotônicos

Implementação local concluída, pendente de revisão independente D9 e integração pelo Claude DF/Opus. Atribuição GBrain12694, ACK13187, SPEC0280 e recibo11 copiados sem alteração. Base fixa02c1002a3f51d895405a828bbd26fbb15aaacf41; branch codex/aud0625-f18-build-20261029. S1 código66ad2137 e correção documental1d7db932 já entregues em13398. O estado histórico PROPOSED no texto congelado da SPEC é anterior à aprovação hash-bound do recibo11.

Hooks e guardas recebem projeções destacadas e imutáveis; grant, reserva, sandboxHandle, executor, signal e budget reais ficam sob posse do kernel. Apenas adaptadores centrais explicitamente credenciados recebem contexto escritor, inclusive a compactação existente. Nenhum kind control arbitrário ganha autoridade. Valores opacos ou falha de projeção nunca retornam o original. Acesso ao relógio é somente leitura. Não se cria sandbox para JavaScript arbitrário do host.

Gate stop, falha/incerteza de ferramenta e bloqueio final não são relaxáveis por extensões. A resposta pode redigir sucesso legítimo sem forjar contadores ou settlement. O journal conserva o fato físico do corpo; falha de confirmação/auditoria permanece separada e bloqueante. next é único e limitado à vida do hook; ausência, duplicação, chamada tardia e throw após delegação não fabricam sucesso nem iniciam novo efeito. A defesa S1 recusa aprovação exigida sem grant.

| Verificação final | Resultado local |
| --- | --- |
| Harness, conformance e regressões F18/F01/F02 pertinentes | 761 PASS, 47 arquivos, 0 falhas, 0 skip/pendências; 40,617s/120s |
| Typecheck Node22 | exit0, 19,314s/120s |
| ESLint dos 13 caminhos de fonte/teste | exit0, 2,370s/60s |
| Prettier dos mesmos caminhos | exit0, 0,866s/60s |
| Mutação semântica final | 18/18 mortos por assertivas causais; fonte restaurada SHA idêntica |
| Catálogos skip/mutation e lockfile | bytes inalterados, nenhum caminho coberto alterado; sem rebind necessário |

R2 exige TOOL_FAILURE/unknown_effect/complete1. R4 exige POLICY_DENIED/corpo0/reserva0/efeitosvazios. Os 12 RED causais anteriores à correção e controles ordinários ficam em S1; todos os casos F18 finais são ordinários, sem it.fails. Negativos adicionais cobrem grant/needsApproval/policy, controles sem credencial, mutação aninhada, resultado/post/end, proxies/getters, cancelamento, sandbox sintético e continuidade.

Os brutos de todas as tentativas e três campanhas ficam em raw; falhas anteriores e timeout de worker sem testes não contam como sucesso nem morte de mutante. Logs .log.json preservam bytes por transporte UTF-8, SHA e roundtrip. Manifest final e source-post vinculam os arquivos; S1 e autoridade mantidos intactos. Ver [autorrevisão](SELF-REVIEW.md), [fontes](source-post.json), [preservação](source-preservation.json) e [estado](state.json).

Próxima ação: Claude DF recebe SHA imutável e solicita revisão D9 de S1/S2; DF integra e executa a barra aplicável na candidata integrada. Esta entrega é implementação verificada localmente; não é revisão independente nem aceite global. Produção NO_GO; scores da auditoria0625 não foram reescritos.
