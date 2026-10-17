# SPEC0220 — qualificação exata da composição durável217

- Trilha: T3; estado `SPEC_FROZEN_FOR_REVIEW`; BUILD do checker exige revisão técnica e aprovação humana vinculadas a esta revisão.
- Autoridade: [constituição](../07_agents/AGENTS.md), [coordenação](../08_runtime/agent_coordination.md) e [SPEC0217](0217_pare100_durable_kernel_composition.md), seção7. A aprovação217 permite propor esta qualificação; não concede a nova tabela.
- Proposta exata: [proposed-exceptions.json](../04_audit/evidence/PARE100-EXEC-20261014/spec0220/revision-r4/proposed-exceptions.json), SHA256 `60980aae4b0774cee7d5b3d38f5d7b6fedb3577d696fbfc3682549e39a036b92`.

A revisão R4 recompõe os hashes após os reparos do plano rejeitado e do encerramento de processos na recuperação R6. Inclui o JSON emitido realmente importado, as quatro localizações AST atuais do refresh, os testes com HOME/TMP/XDG privados e o join com prazo próprio no perfil de recusa. As propostas R1/R2/R3 e suas SPECs permanecem arquivadas, sem alteração. A crítica independente e a decisão humana devem corresponder aos hashes deste pacote; nenhum aceite é inferido dos testes do Lead. Os hashes de metadados operacionais no freeze registram a observação anterior à atualização destes ledgers; os pins de código e emits são revalidados separadamente.

## 1. Resultado e evidência atual

Qualificar somente74 ocorrências novas e atualizar os pins de composição das quatro ocorrências já aprovadas do grupo `pare100-attested-parser-identity`. O detector oficial permanece intocado, `INCOMPLETE`:78 diagnósticos, zero violações. A auditoria strict separada preserva o inventário bruto de308 diagnósticos, zero violações. A simulação de dados em cópia privada do checker é preparação; seu resultado não é PASS do checker oficial, aceite da217 ou autorização de release.

O JSON contém sete grupos novos,465 pins físicos de composição por grupo,497 inputs observacionais e a expansão estática local transitiva com sources/mirrors, incluindo imports dinâmicos literais e o dado `packages/contracts/dist/session-event-schemas.v1.json`. Não há input de composição faltante, site sem mapeamento, counterpart compilado faltante ou bloqueio semântico registrado pelo gerador. Ausência de counterpart esperado bloqueia a geração mesmo que ele não tenha sido encontrado para inclusão nos pins. O campo conservador `status:PENDING_INPUT_FREEZE` do gerador não representa aprovação: o freeze externo foi verificado (`leadFreezeMatched:true`); `activationAllowed:false` e `officialPASS:false` permanecem.

## 2. Mudança de BUILD permitida após aprovação

| Grupo literal                              | Ocorrências novas | Razão única                         |
| ------------------------------------------ | ----------------: | ----------------------------------- |
| `pare217-store-json-reflection`            |                 8 | `UNVERIFIED_DYNAMIC_CODE_EXECUTION` |
| `pare217-continuation-json-runtime-guards` |                 6 | `UNVERIFIED_DYNAMIC_CODE_EXECUTION` |
| `pare217-store-native-process-observers`   |                19 | `UNVERIFIED_DYNAMIC_CODE_EXECUTION` |
| `pare217-worker-native-process-observers`  |                21 | `UNVERIFIED_DYNAMIC_CODE_EXECUTION` |
| `pare217-profile-refusal-process`          |                10 | `UNVERIFIED_DYNAMIC_CODE_EXECUTION` |
| `pare217-bounded-process-lifecycle`        |                 7 | `UNVERIFIED_DYNAMIC_CODE_EXECUTION` |
| `pare217-private-inspector-observer`       |                 3 | `UNVERIFIED_MODULE_LOADER_ESCAPE`   |

Os dois grupos runtime cobrem reflexão de envelopes JSON e dos métodos enumerados do host confiável, incluindo os respectivos emits públicos. Quatro grupos de testes cobrem filhos nativos fixos, observação/encaminhamento das chamadas originais, recusa do perfil em memória e prazos de encerramento. O sétimo cobre o inspector exclusivamente dentro do próprio processo para contadores das funções capturadas, sem listen/open/porta. As expressões completas, linhas normalizadas, digests, arquivos literais e multiplicidades estão no JSON; nomes de grupos não autorizam outros sites.

O BUILD altera somente a tabela literal em `scripts/check-product-boundary.mjs` e testes de qualificação próprios necessários, com documentação/evidências. Nenhuma mudança em parser, razões, predicados, roots, globs, resolução, verificação installed/lock, política de produto ou semântica strict. Atualizar apenas `pins` do grupo de atestação existente, preservando seus quatro sites, razão e multiplicidades. Acrescentar exatamente os sete grupos propostos; nenhum fallback genérico. Os reparos de fonte217 precedem este freeze sob a autoridade217; a aprovação0220 não autoriza mudanças adicionais nessas fontes.

## 3. Identidade e limites verificáveis

Cada ocorrência exige a mesma razão, arquivo literal, linha normalizada por whitespace, digest da expressão AST completa, contagem máxima exata e todos os pins físicos regulares íntegros. Um byte diferente, ausência, symlink, expressão, razão, arquivo ou ocorrência adicional invalida a qualificação correspondente. O número de linha auxilia a reconstrução; o matcher vigente usa o texto normalizado e não passa a autorizar deslocamentos por número.

A lista finita de pins cobre o comando original, validators atestados, continuation/store/fencing, worker/lifecycle/preflight, índices e imports/exports locais, com mirrors emitidos pelo build público. O JSON fonte e o emitido têm hashes distintos porque TypeScript aplica formatação na emissão: exigir equivalência dos valores e replay determinístico byte a byte do emit com a toolchain pinada; o contexto copia o emit sem alterar bytes. Igualdade semântica não substitui nenhum dos dois pins físicos. Acrescentar dependência, alterar código ou recompilar com bytes distintos exige reavaliação; igualdade AST não dispensa pin de emit. Terceiros continuam terminais sob o verificador atual, sem exceção nova.

Filhos de teste: Node22.23.2 e tsx existentes; argv e entrypoints literais sob `apps/worker/src`, ou um dos quatro programas sintéticos literais do teste lifecycle, cwd desta candidata, ambiente enumerado sem NODE_OPTIONS herdado, HOME/TMP/XDG privados, PostgreSQL descartável explicitamente atribuído e limitado a loopback, schemas/roles próprios, saída/tempo limitados e cleanup com exit e stdio confirmados. Nos pais store/worker, o watchdog independente limita a vida a180s; após RESULT/record, espera de exit por5s, TERM com1s e KILL com2s. O perfil de recusa usa o mesmo tracker, watchdog10s/espera10s e TERM1s/KILL2s, com HOME removido somente após streams fechados e PID ausente. O watchdog funciona mesmo sem chamada posterior de finish/stop; setup/erro/timeout preservam o erro original e encerram o filho antes de retornar. O teste tem dez casos reais finitos, com prazos menores literais, incluindo filho que emite RESULT e mantém timer, recusa de TERM, parent abandonado, setup falho, idempotência e join. Cada HOME próprio só é removido após stop e confirmação de streams/PID. Nenhuma autorização de shell, download, provider ou processo externo arbitrário. Inspector: Session no mesmo processo, funções capturadas, propriedades/comandos fixos, valores escapados e limpeza dos breakpoints/global/session. Isso não é contenção de serving malicioso nem autenticação genérica do host.

## 4. Preservação histórica e compatibilidade

Preservar bytes das SPECs0215/0216/0217 e dos JSONs aprovados. A0215 mantém quatro grupos19+14+3+10=46. A0216 mantém três grupos4+1+8=13, sendo apenas os pins do grupo de quatro sites atualizados no checker ativo. Não editar a proposta antiga para fazer a fixture passar.

Manter fixtures históricas com seus inputs originais hash-bound e acrescentar fixtures atuais que consumam exclusivamente a proposta0220 aprovada. Não remover testes, trocar denominadores, reclassificar violações ou apresentar um snapshot antigo como fonte atual. Produto/SHIFT/unresolved/installed e qualquer razão distinta continuam bloqueantes; strict desativa todas as exceções.

## 5. Aceitação do BUILD futuro

O [plano de qualificação](../04_audit/evidence/PARE100-EXEC-20261014/spec0220/qualification-test-plan.md) fixa Q01–Q20. Exigir tabela AST exata, preservação46/13, controle positivo atual e negativos independentes para cada dimensão, incluindo todos os465 pins físicos únicos de código, dados e emits, byte drift/missing/symlink, excesso de ocorrência e cauda multiline. Regressões de produto/SHIFT/resolução/installed devem continuar detectadas com pins de controle válidos. As quatro rows de revisão atuais devem ser reconstruídas por AST (TS65/67 e JS30/32), sem alterar o matcher por número de linha. Não executar corpos de módulos de aplicação para comparar a tabela.

Verificar source/emit/toolchain e o caminho real público, usar dados sintéticos, registrar comandos/exits/PIDs reais quando disponíveis e hashes, obter crítica independente fresca e executar typecheck/lint/unit/PG/E2E/cobertura/certificação da candidata final. A simulação privada e o protótipo13 atual são preparação, não substituem os testes futuros nem o aceite da217. Se outro gate falhar, preservar a falha e corrigir dentro da autoridade disponível; nunca dispensá-la por esta SPEC.

## 6. Rollout, rollback e autoridade

Nenhuma promoção217 ao checkout principal antes da qualificação e dos demais gates exigidos. Após BUILD autorizado, integrar somente arquivos próprios por preimages/hashes e preservar alterações concorrentes. Rollback da qualificação remove os sete grupos e restaura apenas os pins próprios do grupo atualizado; mantém o detector bloqueante e preserva fonte/evidências. Não remover migration ou estado durável como rollback.

Esta aprovação, se concedida, cobre BUILD local sintético da tabela e seus testes. Não concede provider/canal/ferramenta sensível, dado real, produção, release, push, deploy, instalação/dependência ou alteração de contrato novo. A217 continua um avanço parcial de P100-010;34 cartões e a paridade integral permanecem abertos.
