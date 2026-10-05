> Cópia de leitura: links internos apontam para o archive versionado. O relatório original byte-exato e os hashes estão no archive e manifesto. Veredito e texto técnico preservados.

# GATEWAY_FRESH_REVIEW_R10 — ACCEPT

Aceite **somente do gate funcional sintético local do gateway congelado**. Nenhum finding técnico reproduzível encontrado. Isto não concede produção, piloto, release nem encerramento integral da SPEC0180.

## Autoridade e independência

Primeira ferramenta leu exclusivamente `authority.json` e `freeze.json` absolutos; em seguida foi lida a constituição `source/docs/07_agents/AGENTS.md` do próprio packet. Claim: `output/claim.json`. Root, coordenação, ledgers, skills e pareceres anteriores não foram lidos. Nenhum resultado/auto-verdict do Builder foi usado como evidência. Inspeção, dependências e testes ficaram neste packet; todas as escritas próprias ficaram em `output`.

SPEC0180: SHA-256 `7971771ca8e4a12be90e58536ea105c8399d844e28c47093b2a50575afff6dc2`, coincidente com o estado adjacente aprovado. Emenda custo/modelo: SHA-256 `da6038d6b05556b5f7a48a08c3db2234d50064e1520ac6e5ff2beb5a051f9c46`, coincidente com o recibo `BUILD_LOCAL_AUTHORIZED`. ShortSPEC `gateway-circuit-tuple-t2.md` lida e identificada por hash no JSON. O recibo humano histórico referenciado pela SPEC0180 não está no packet; sua proveniência histórica não foi verificável. A autoridade vigente do usuário cobre esta auditoria local.

## Evidência pública executada

Dois consumidores próprios, físicos, com `package.json`, `dist` e zod; sem `src`, links, aliases ou deep imports. Imports por `@cvg/model-gateway` e `@cvg/shared`. O primeiro executou o **actual frozen dist**. O segundo executou a recompilação independente da fonte copiada em árvore separada. Todos os **99 arquivos JS/d.ts/map recompilados são byte-idênticos** ao congelado; somente os dois arquivos congelados de metadata `tsconfig.runtime.tsbuildinfo` não foram gerados nessa compilação.

Em **cada** consumidor: **116 sondas funcionais + 12 controles adicionais + 18 testes duráveis = 146 PASS / 0 FAIL**. Total próprio: 292 execuções sintéticas. Dois checks TypeScript verdes verificaram 16 tentativas proibidas de mutação das autoridades públicas em cada consumidor.

| Critério | Resultado observado |
| --- | --- |
| Preços externos obrigatórios | Ausência, null, NaN, infinito, negativo e tipo inválido recusados antes de budget/provider. Composição HTTP real demonstrou zero DNS/requests; também verificado sem BudgetGuard. |
| Caps e estimativas | Mínimo request/perfil/guard, máximo das estimativas, limites zero/menor/igual/maior/ausência, e fallback com suas próprias admissões. |
| Identidade/uso/custo HTTP | Fake servidores loopback próprios receberam o modelo exato no body. OpenAI/Ollama contraditórios ou com uso inválido recusados antes de normalizer/completed. Identidade ausente compatível; custos conferidos. Sem Authorization/chave. |
| Imutabilidade | Aliases registrados/resolvidos/listados de prompt, perfis/preços e policy congelados; mutação da configuração original não altera o gateway. Tipos públicos readonly confirmados por compilação. |
| Tupla de circuito | Dois-pontos, percent literal, Unicode, NUL/newline e surrogate isolados; OPEN, reopen, HALF_OPEN, probe exclusivo, cancel, conclusão atrasada e observer assíncrono falho. Chaves comuns do snapshot preservadas. |
| Durabilidade | Cinco processos nativos simultâneos por variante: um writer admitido, quatro recusados sem provider. Restart/reopen conserva gasto diário 0,6 e nega nova reserva 0,6 sob limite 1. Crash preserva lock identificado e gasto; falhas de write/fsync/settlement impedem publicação. |
| Transporte compilado | OpenAI/Ollama com oversize, deadline sem EOF e caller cancel: erros tipados, socket fechado, nenhum normalizer/completed, nenhum listener residual do caller. |

Regressão existente, sem edição de assertivas/fixtures: **1.335 PASS / 0 FAIL / 0 SKIP**, **68 arquivos**. Gateway: 582 testes/27 arquivos; shared: 250/17; produto: 503/24. Inclui os controles existentes de classificação clínica e composição do produto.

## Integridade e inventários

Inventário oficial: SHA-256 `21c68850bc61fb18fbe26c38a3489d63728b6f32193ca7041ad8276dc3445f8d`. Verificados **19.332 arquivos + 48 links = 19.380 entradas**, antes e depois: **zero alterações** de conteúdo/tamanho/mode/inode/nlink/target. Zero links externos ao packet. Todos os **117 arquivos** focais de testes/fixtures permaneceram byte-idênticos. Os 2.516 inputs próprios de consumidores/recompilação também permaneceram iguais após a verificação adicional.

Inventário de testes congelados: **404 unit + 7 E2E = 411 caminhos**, consistente com o denominador informado 371+40. Não foi reconstruída a atribuição histórica desses dois grupos. Manifests completos estão em `before-manifest.json`, `after-manifest.json`, `consumer-*-manifest.json`, `protected-regression-manifest.json`, `physical-sdk-proof.json`, `test-path-inventory.json` e `output-manifest.json`; digests, leituras e comandos/ambientes/exits estão em `report.json`, `read-manifest.json` e `commands.jsonl`.

## Falhas de preparação preservadas

A primeira sonda própria de prompt enviou indevidamente `sha256` ao schema estrito de entrada: 115 PASS/1 FAIL em cada variante. Corrigida somente essa sonda própria; versões/results/logs iniciais foram preservados. Não é finding do candidato.

A primeira regressão teve 1.319 PASS/16 FAIL no mesmo arquivo `synthetic-openai.test.ts`: 11 por lockfile faltante na cópia e cinco por permissões 444 que propagaram às cópias temporárias destinadas a tamper. O lock congelado foi copiado byte-exato, e somente os modes originais das fixtures copiadas foram restabelecidos; nenhum conteúdo/assert foi alterado. Reexecução apenas do arquivo afetado: **53/53 PASS**. `regression-consolidated.json` substitui essa suíte pela reexecução por identidade exata; resultados anteriores permanecem disponíveis. O packet original ficou intacto.

## Limites

Node22 explícito `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node`, versão observada `v22.23.2`; filhos com ambiente mínimo sem credenciais herdadas. Somente fixtures fixas de SDK/budget/build/test e servidores sintéticos loopback. Não houve payload próprio de evaluator/vm para acesso arbitrário, provider/rede externa, dados/chaves reais, PG, Docker, subagentes, certify, push ou deploy.

**Coverage global não executado**: `coverage281` é contexto fornecido, não resultado independente desta revisão. A suíte global de 411 caminhos e os sete E2E não foram executados; somente o escopo focal acima. CI remoto, supply-chain, integração PG, imagens e release ficam fora deste aceite. As amostragens de hash/lstat não substituem syscall tracing ou um sandbox imposto pelo SO. Recuperação de lock e falhas de filesystem foram exercitadas exclusivamente em ledgers sintéticos próprios; não há alegação de segurança distribuída/NFS.

Próxima ação: o Lead pode integrar este resultado independente aos demais gates autorizados. A ausência de finding não concede produção.
