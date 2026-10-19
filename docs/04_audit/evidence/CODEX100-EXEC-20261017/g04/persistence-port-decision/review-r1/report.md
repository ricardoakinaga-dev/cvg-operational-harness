# Revisão independente R1 — portas de persistência

**REVISE — mandatory_count: 1.** A escolha mínima de reutilizar as fundações canônicas é defensável, mas o handoff omite uma restrição material já conhecida do caminho standalone/unbound. Corrigir o mapa e registrar sua lacuna basta nesta rodada; não se exige uma SPEC completa, implementação ou contrato wire resolvido.

Task: `DX100-G04:RESOLVE-CANONICAL-PERSISTENCE-PORTS`. Sujeito: [freeze R1](../review-freeze-r1.json), SHA-256 `e63452011a4e3f8e0f0b972c977e27a0b9ed41d3c870ff42996c2fb02cbc2099`. [Task](../task.json): `a0b1d5bc6e4dda34a08e2b6829bc8c5aea7c45a66723d85c22e115a720275953`. [DECISION.md](../DECISION.md): `39f8f83c75815352b7032c280f2be52d441038d748a1637a83e1d16f36a95f43`.

## R1-01 — restrições standalone/unbound ausentes do handoff

Severidade **P2 / MEDIUM**, obrigatório, confiança HIGH. Local: [DECISION.md](../DECISION.md), linhas47–51 e75–77; [port-bindings.json](../port-bindings.json), PP03/PP04 e CP03/CP04, linhas118–195 e284–305.

A porta PP03 descreve CAS; PP04 e CP04 descrevem o fence bound e seu matcher específico de ferramenta. Isso deixa sem classificação explícita o caminho standalone, sua compatibilidade e a autoridade anterior ao dispatch. Uma obrigação genérica de testar dois writers não registra essa restrição de implantação já conhecida.

Prova primária, já congelada no sujeito:

- [A05 — SPEC0224](../inputs/A05.source.txt), linhas368–403, SHA-256 `f3bc9a6115d17abb4185644cfc998f7aef39164774afff00042a64202b2c49ea`: todas as escritas V2 exigem CAS; uma reserva alheia pendente deve permanecer UNKNOWN. Crucialmente, linhas396–403 dizem que CAS unbound serializa estado/orçamento, **não cria lease de worker/ACK externo**, e que a fatia isolada não mistura writers antigos/novos. Compartilhar execução ou integrar hosts requer gate operacional próprio; não se pode alegar contenção de um writer legado com acesso direto ao banco.
- [G01 — guardOptionalPublishedWrite](../inputs/G01.source.txt), linhas127–152, SHA-256 `c73c3fa055fb5ad385da86c445dce4a360f262dd179450277a8489713787ce7c`: sem binding `controlled-published-v1` e sem fence, retorna null. Não constitui guarda genérica de execução standalone.
- [S02 — CAS](../inputs/S02.source.txt), linhas319–350, SHA-256 `e110ee06553b5612a798f8b8966516d3f7c4e416b4850a764e052db0f7c14cbd`: invoca esse guard opcional e compara checkpointId/digest. Isso prova uma costura de código, não lease/admissão genérica de worker.

Impacto: o próximo autor pode tratar a elegibilidade standalone como uma simples questão de escolher exports/CAS ou generalizar o fence bound. A decisão não concede BUILD nem afirma sucesso runtime, o que limita a gravidade; ainda assim, o mapa de ownership/compatibilidade solicitado está incompleto. Não foi demonstrado um bypass em execução.

Correção agrupada mínima: acrescentar às portas e às lacunas a distinção standalone/unbound versus execução admitida por worker/bound; transportar as restrições de A05, incluindo reserva alheia UNKNOWN, incompatibilidade de writers e ausência de lease/ACK pelo CAS. Classificar a salvaguarda de epoch standalone e as guardas de claim/lease/dispatch/settlement do worker como fonte elegível comprovada ou **UNKNOWN, sem crédito e bloqueando BUILD desse caminho**, com owner e ação de reconciliação na próxima SPEC. O exame de epoch/worker é requisito explícito deste briefing; não há prova de epoch standalone nesses vínculos, e esta revisão não afirma que o mecanismo inexiste no sistema. Pode-se manter a solução concreta aberta. Não copiar WIP, ampliar matcher, criar store/migration, reabrir aprovação0221/0225 ou exigir novo gate para os ajustes já aprovados.

Aceite documental da correção: fatos conhecidos ligados a ranges/SHA, incógnita explicitamente rastreada em PP03/PP04/gap e no próximo passo. A futura SPEC completa decide a costura; a prova runtime continua NOT_RUN.

## Demais critérios examinados

A autoridade foi validada pelo original **e** pela redução revisada. A01 vincula A02/A03; O02 vincula O01/original/autoridade, O04 vincula O03/original/autoridade, ambos com zero obrigatórios. Os rótulos pending dos originais não foram usados para reabrir decisão humana. O05 permite apenas BUILD local0225, mantendo qualificação/promoção bloqueadas. O07 é observação relatada44casos/88processos, com drift de teste preservado; não é aceitação independente, concorrência CQ12 ou certificado da jornada.

A decisão distingue Root, desenho aprovado, snapshot WIP e baseline Git. Há cinco portas cobrindo CQ07/09/10/11/12; CQ01–14 permanecem exigidos. Rejeitar stores/migrations duplicados e copiar C100/ativar0226 é coerente com o reuso mínimo. O journal de digest R12 não é confundido com o resultado lógico operacional.

Não encontrei afirmação de transação global: confirm/payload são uma fronteira; checkpoint, terminal e entrega permanecem separados. Sessão advisory e attempt de efeito não são elevados a fence de execução. A restrição `${executionId}:s2:find_available_slots` está corretamente exposta. Cancel admitido, terminal vencedor e ACK durável são distintos, com ambas as ordens de commit remetidas à SPEC futura. Wire/cursor/pressão/retenção ainda abertos são lacunas legítimas deste T1, não achados por falta de contrato final.

Os limites de output1MiB, contexto32768bytes, captura de todo ToolResult8MiB e checkpoint unsigned8MiB permanecem independentes. Tickets, shutdown agregado e superfícies adiadas da0221 não voltam pela porta dos fundos. Coexistência v1 da sessão não autoriza readers antigos no journal ativado. A qualificação0231 permanece de seu mecanismo local, sem transferência para runtime.

## Controles efetivamente realizados e limites

[Antes](inputs-before.json) e [depois](inputs-after.json) registram97entradas:38payloads congelados, o próprio freeze,31fontes primárias e27projeções R3. SHA-256/tamanho conferidos; G01/G02 também conferidos como objetos Git e blob IDs do commit declarado. Os76excerpts coincidem exatamente com ranges/path/hash; todas as referências de portas resolvem para spans. Os dez vínculos de autoridade conferem. Inventário Root: seis observações de presença/ausência e29migrations conferem, sem inferir ausência em todo o repositório.

[Reconferência do recovery](recovery-check.json): checkpoint `c305052f…` igual ao hash declarado,2007payloads rehasheados;2004iguais e três diferenças apenas em state/continuation/execution-log autorizados ao Lead. Esse drift posterior de continuidade não altera o sujeito R1 nem reclassifica a observação histórica do recovery. O manifesto do qualificador é ligado pelo checkpoint; nenhum gate foi reexecutado ou crédito transferido.

Foram feitos leitura textual, JSON, hashes, verificação de links locais e formatação dos próprios arquivos com Node22/Prettier `--ignore-path /dev/null`. O resultado exato está em [checks.json](checks.json). Inventário de bytes não prova comportamento. A revisão não é auditoria de todo o sistema nem da implementação WIP.

Revisor fresco independente, uma rodada R1, sem redelegação/descendentes. Escrita exclusiva nesta pasta e no TMP permitido. Nenhuma alteração de fonte, sujeito, coordenação, shared99/20/30/0190 ou evidência alheia. Nenhum import/alvo/probe/aplicativo/rede/PG/Docker/build/gate/teste foi executado. **Full runtime: NOT_RUN; functional_receipts: 0.**

Próxima ação: Lead trata R1-01 em um único reparo documental agrupado e, se usar R2, entrega novo freeze ao mesmo crítico, em pasta nova. Após aceite independente dos outputs pelo Lead, seguir `DX100-G04:SPECIFY-FULL-NATIVE-JOURNEY`, preservando CQ01–14 e gates próprios antes de qualquer BUILD nativo.
