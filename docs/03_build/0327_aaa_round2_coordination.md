# AAA-20260912 — próxima tarefa do Agente 3

- status: `IN_PROGRESS`; last_completed_action: verificação isolada da imagem runtime Node22 registrada em AAA-14, ainda REVIEW; nenhum resultado novo de imagem alegado.
- next_action: **Agente 3 / imagem runtime AAA-14**, [prompt](../04_audit/evidence/AAA/AAA-14/runtime-image-assignment/next-task-agent-3.md). Build explícito target runtime, instalação prod-only e smoke sintético; se Docker indisponível, preservar bloqueio sem equiparar fallback à imagem. Evidências somente, sem alterar produto/publicar imagem.
- coordenação: Agente 1 mantém cobertura crítica AAA-07; Agente 2 mantém mutação dirigida AAA-12. Ensaio AAA-13 aprovado permanece histórico daquele snapshot; sem full certify novo ou gates/DONE concedidos.

# AAA-20260912 — próxima tarefa do Agente 2

- status: `IN_PROGRESS`; last_completed_action: tarefa de mutação dirigida AAA-12 registrada após cobertura aprovada; seleção deve ser congelada antes da execução, conforme AAA-04 v2 §9.1.
- next_action: **Agente 2 / guards críticos do canal**, [prompt](../04_audit/evidence/AAA/AAA-12/mutation-assignment/next-task-agent-2.md). Mutantes somente em cópia isolada; origem permite testes/evidências próprios. Nenhum resultado de mutação ainda medido ou aprovado.
- coordenação: Agente 1 mantém cobertura crítica AAA-07; Agente 3 aguarda atribuição. AAA-12 REVIEW, sem DONE/G_QUALITY/SQL/AAA-21; não repetir cobertura já aceita como tarefa nova.

# AAA-20260912 — auditoria das três entregas / próxima ação única — 2026-09-12

- status: `IN_PROGRESS`; last_completed_action: AAA-07 C6-F01/F02 fechados; AAA-12 subset/branches críticos medidos aprovados; AAA-13 ensaio isolado aprovado. Três tasks em REVIEW, sem DONE. [Parecer](../04_audit/evidence/AAA/coordinator-batch-review/REVIEW.md).
- evidência independente: hashes AAA07 3/3, testes canal4/4+pinados14/14, ensaio52/52; approval+canal153 PASS; canal isolado105 PASS e coverage98,39/96,18/96,11/99,61; probe C6 exit0; verifier do snapshot exit0/27hashes. Full certify e suites globais não reexecutados.
- next_action: **somente Agente 1 / cobertura crítica AAA-07**, [prompt](../04_audit/evidence/AAA/coordinator-batch-review/next-task-agent-1.md). Agentes 2/3 aguardam atribuição do coordenador, sem repetir entregas aceitas nem iniciar outra task. AAA-09 não iniciada.
- limites: shared-before/after têm metadados diferentes, linhas de hashes iguais. Snapshot Node24 não qualifica árvore atual/Node22 alvo. Cobertura global/mutação/durabilidade/composição/gates externos continuam pendentes; nenhum gate de produção ou G_QUALITY concedido.

# AAA-20260912 — aceite AAA12-C4-F01 / cobertura do canal — 2026-09-12

- status: `IN_PROGRESS`; last_completed_action: C4-F01 fechado independentemente; 14 hashes/digest 70311445… conferidos, canal 7/57 PASS; probe de 6 versões rejeita sem alterar bytes/permitir claim. AAA-12 **REVIEW**, sem DONE.
- next_action: somente **Agente 2 / cobertura comportamental AAA-12**, [prompt](../04_audit/evidence/AAA/AAA-12/review-coordinator-c4/next-task-agent-2.md), testes/evidências próprios e código do produto preservado. Frentes 1/3 mantidas.
- evidência: [parecer](../04_audit/evidence/AAA/AAA-12/review-coordinator-c4/REVIEW.md), checks/logs/probe adjacentes. Subset functions 79,61% FAIL e branches críticos abaixo da barra permanecem abertos; PASS global não compensa. Coverage e suites globais não reexecutados nesta auditoria focada.
- limites: sem SQL/migrations/AAA-21, durabilidade física, produção ou gate concedido; nenhum código do produto alterado pelo coordenador.

# AAA-20260912 — aceite AAA-13 R4 / ensaio isolado — 2026-09-12

- status: `IN_PROGRESS`; last_completed_action: R4 aprovado no recorte corrigido; C5-F01/F02 fechados, C3-F01 continua fechado. 3 hashes conferidos; 37/37 checks + R1/R2 do coordenador PASS (39/39 no harness estendido); histórico 27 hashes PASS. AAA-13 **REVIEW**, sem DONE/qualificação atual.
- next_action: somente **Agente 3 / ensaio integrado AAA-13**, [prompt](../04_audit/evidence/AAA/AAA-13/review-coordinator-r4/next-task-agent-3.md). Full certify autorizado exclusivamente em cópia consistente/isolada com dependências sintéticas, seguido do verificador; sem editar produto/certificados compartilhados. Frentes 1/2 preservadas.
- evidência: [parecer](../04_audit/evidence/AAA/AAA-13/review-coordinator-r4/REVIEW.md), hashes/logs/reprodução adjacentes. 37 checks incluem 9 helpers e 28 CLI; C0 sintético não comprova integração do produtor completo. Chaos obrigatório conferido com suíte real.
- limites: full certify, suites globais, Docker e benchmark não executados nesta auditoria. Nenhuma autoridade de produção, signoff ou G_QUALITY inferida. Débitos declarados dos demais parsers permanecem registrados.

# AAA-20260912 — auditoria AAA-07 lifecycle — 2026-09-12

- status: `IN_PROGRESS`; last_completed_action: 4 hashes conferidos e pacote 4/42 PASS. AAA-07 **REWORK** por AAA07-C6-F01/F02 P1: sweep antigo modifica reserva nova; token liberado pode ser reutilizado para EXECUTING. Probes públicos sintéticos, zero efeitos.
- next_action: somente **Agente 1 / fencing entre gerações AAA-07**, [prompt](../04_audit/evidence/AAA/AAA-07/review-coordinator/next-task-agent-1.md). AAA-09 aguarda correção revisada. Frentes 2/3 preservadas.
- evidência: [parecer](../04_audit/evidence/AAA/AAA-07/review-coordinator/REVIEW.md), hashes/logs/probe no mesmo diretório. Suítes globais do executor não reexecutadas nesta revisão; coverage crítica 84,48% abaixo da barra congelada 95%, sem dispensa. Store local não prova durabilidade.
- limites: nenhum código de produto ou artefato antigo alterado pelo coordenador; sem SQL/ação real/commit/push/deploy, gate ou DONE.

# AAA-20260912 — auditoria AAA-13 rework R3 — 2026-09-12

- status: `IN_PROGRESS`; last_completed_action: três hashes conferidos, self-test 19/19 PASS, histórico 27 hashes PASS. AAA13-C3-F01 fechado no recorte de evidência ausente.
- AAA-13: **REWORK** por AAA13-C5-F01/F02 P1. CLI público aceita coverage sem pct e chaos com 14 assertions skipped; ambos exit 0 sem failures em fixtures isoladas. [Parecer](../04_audit/evidence/AAA/AAA-13/review-coordinator-rework-r3/REVIEW.md).
- next_action: somente **Agente 3 / validação dos resultados brutos AAA-13**, [prompt](../04_audit/evidence/AAA/AAA-13/review-coordinator-rework-r3/next-task-agent-3.md). Frentes 1/2 e locks preservados. Nova hipótese com RED executado, sem relaxar barra/limite de tentativas.
- limites: nenhum produto/certificado compartilhado alterado nesta revisão; full certify, Docker e suites globais não executados. Nenhum gate, DONE ou qualificação atual concedido.

# 0327 — Rodada 2: reconciliação, revisão e avanço das três frentes

## Orientação vigente para o Agente 2 — revisão do candidato 8d49cb2a

AAA-12 **REWORK pontual / AAA12-C4-F01**. Algoritmo compartilhado e caminho normal de versão aprovados no recorte; 13 hashes/digest conferidos e 51 testes PASS. Porém, versão explícita malformada no arquivo é normalizada para legacy, permitindo reserva/mutação/claim pelo caller legado. Gateway atual shared continua rejeitando esses registros; nenhum efeito real foi executado.

[Próxima e única tarefa](../04_audit/evidence/AAA/AAA-12/review-coordinator-hash-version/next-task-agent-2.md): distinguir ausência de versão inválida e provar não mutação. [Parecer](../04_audit/evidence/AAA/AAA-12/review-coordinator-hash-version/REVIEW.md). Cobertura do subset permanece FAIL; SQL/actor/AAA-21 fora da rodada. Outras frentes preservadas.

## Orientação vigente para o Agente 1 — rework AAA-08 aprovado

AAA08-C1-F01 fechado com prova independente DENY/0 e 6 arquivos/62 testes PASS. AAA-08 permanece REVIEW de qualificação integral, com correção funcional aprovada. AAA-03 rev2 + adendo AAA03-R-ACT-v1 aprovados e congelados tecnicamente por hash em [parecer](../04_audit/evidence/AAA/AAA-08/review-coordinator-rework/REVIEW.md); AAA-03 VERIFIED documental.

Próxima e única tarefa da frente 1: [AAA-07 lifecycle local de aprovação](../04_audit/evidence/AAA/AAA-08/review-coordinator-rework/next-task-agent-1.md). Insumos técnicos AAA-03/04/05 disponíveis; READY limitado ao recorte sintético, sem gate humano/SQL/produção. Runtime e adapters duráveis ficam para tasks próprias; não confundir nova API de approval com correção já integrada de F02.

Agentes 2/3 preservam suas tarefas vigentes. O coordenador integra os registros no retorno; executor não republica estado compartilhado.

## Orientação vigente para o Agente 2 — AAA-05 v3 aprovada

**AAA-05 VERIFIED documental**, v3 `cebeddab…` aprovada independentemente e congelada tecnicamente em [parecer](../04_audit/evidence/AAA/AAA-05/review-coordinator-v3/REVIEW.md). C2-F01/F02/F03 fechados no contrato; gap de código não fechado. A instrução anterior de refazer v3 está concluída.

Próxima e única tarefa da frente 2: [AAA-12 canonicalização/versionamento](../04_audit/evidence/AAA/AAA-05/review-coordinator-v3/next-task-agent-2.md), rework local do candidato já entregue. HashVersion deve existir no registro apesar da omissão no snippet documental; registros legados não podem ser apagados, rehasheados ou reenviados para contornar conflito. Migrations, adapters SQL, composição AAA-21 e actor de reconciliação fora da rodada. Locks e recorte registrados no ledger.

DAG e gates completos permanecem: aprovação documental não torna dependentes READY automaticamente, nem concede revisão humana/BUILD SQL. Outras frentes continuam em suas tarefas vigentes.

## Orientação vigente para o Agente 3 — handoff auditado

**AAA-13 REWORK / AAA13-C3-F01:** CLI público aceitou candidato sintético com zero gates executados, zero logs e manifesto vazio. Próxima e única tarefa: [corrigir AAA-13](../04_audit/evidence/AAA/AAA-13/review-coordinator-r3/next-task-agent-3.md); [parecer](../04_audit/evidence/AAA/AAA-13/review-coordinator-r3/REVIEW.md). Não agendar full certify como próximo passo antes de corrigir e revisar esse falso aceite.

AAA-04 v2 aprovada independentemente pelo coordenador e congelada tecnicamente por hash (VERIFIED documental; sem G_SPEC/humano/produção). AAA-14 permanece REVIEW com checagem isolada de licenças aprovada e imagem não construída. AAA-15 permanece REVIEW: arquivo equivalente por AST completo e formatado, gate global ainda pendente. Não reformatar evidências pinadas nem ampliar ignore por conveniência.

As tarefas vigentes das outras frentes permanecem: Agente 1 rework AAA-08; Agente 2 AAA-05 v3. Esta rodada só atribui rework AAA-13 ao Agente 3. Pareceres históricos citados no handoff não substituem as revisões posteriores já integradas.

## Orientação vigente para o Agente 1 — retorno da rodada 2 auditado

**AAA-08 REWORK**: suíte 29/29 PASS e F15 original DENY/0, mas combinação modify + draft + action confirm/reschedule/cancel chama ferramenta falsa sob ALLOW. Próxima e única tarefa da frente 1: [AAA-08 / AAA08-C1-F01](../04_audit/evidence/AAA/AAA-08/review-coordinator-r2/next-task-agent-1.md). [Parecer executado](../04_audit/evidence/AAA/AAA-08/review-coordinator-r2/REVIEW.md).

AAA-03 rev2 já recebeu APPROVE independente por hash; falta integrar congelamento/autoridade aplicável. AAA-04 v2 já existe e aguarda revisão própria; o parecer de v1 é histórico. AAA-05 continua REWORK, e AAA-16 já tem aprovação técnica local. Não repetir pedidos antigos de atualização de link AAA-05 ou revisão AAA-03 rev2 já recebida. Não avançar dependentes por inferência nem transformar escopo local em aprovação de gate.

Esta rodada não altera a tarefa vigente do Agente 2 nem distribui tarefa ao Agente 3. O coordenador consolida os registros após cada retorno; Agente 1 entrega artefatos próprios no rework, sem republicar estado das outras frentes.

## Orientação vigente para o Agente 2 — auditoria da v2

O retorno v2 foi auditado pelo coordenador: **AAA-05 REWORK**. Próxima e única tarefa desta frente: [AAA-05 v3](../04_audit/evidence/AAA/AAA-05/review-coordinator-v2/next-task-agent-2.md). [Parecer e evidência executada](../04_audit/evidence/AAA/AAA-05/review-coordinator-v2/REVIEW.md).

A errata AAA12-R3-F01 foi reproduzida e fechada; AAA-12/16 têm pareceres independentes APPROVE no escopo local, registrados em REVIEW até dependências/gates. AAA12-R3-F02 continua aberto e agora integra o aceite de AAA-21, sem iniciar essa task. As instruções anteriores de revisão ainda pendente e prompts para a frente 2 são históricas onde divergirem deste adendo.

A v2 corrigiu a distinção dos hashes e FAILED terminal, mas a equivalência dos canonicalizadores falha com metadata válida de chaves numéricas; a interface omite release; o plano SQL precisa refletir D05-1/2 já decididos (0012 canal, 0013 runtime, implementação SQL pelo Agente 2 sob handoff). As reservas antigas de planejamento não substituem essas decisões e nenhuma delas concede BUILD.

Esta atualização não redistribui as outras frentes. A cada retorno, auditar o executor correspondente e devolver somente sua próxima tarefa. O coordenador integra os registros comuns; não pedir que três agentes os reescrevam.

## Atualização vigente — recebimento da frente 2 (2026-09-12)

Este adendo prevalece sobre os status e pedidos de entrega abaixo. AAA-05, AAA-12 e AAA-16 estão **IMPLEMENTED**, com revisão independente pendente e promoção bloqueada. Os manifestos e hashes dos arquivos declarados foram conferidos; os testes de produto não foram reexecutados nesta atualização. Nenhum finding foi encerrado e nenhum gate foi concedido.

- AAA-05: contrato `8db1541f…` recebido; §3.1 já contém a reconciliação proposta com AAA-03 `db75899f…`. Revisar a composição, sem pedir que o autor refaça um documento já entregue.
- AAA-12: candidato `33aa2807…` recebido. O manifesto registra 886 testes PASS/27 skips e cobertura global 86.41/81.46/89.71/87.51; isso não atende automaticamente à barra crítica. Arquivo single-host sem fsync não prova durabilidade física.
- AAA-16: logs registram 84/84 PASS, zero skips; falhas anteriores preservadas. Cluster descartável na porta 55432, com fsync/synchronous_commit/full_page_writes desligados. Testes das tabelas atuais não validam um adapter SQL de journal ainda inexistente.
- D05-1: sequência 0012 livre na inspeção e reservada ao Agente 2 para planejamento. D05-2: Agente 2 prepara desenho e paths exatos dos adapters SQL de ambas as portas; Agente 1 mantém integração runtime/outbox/postgres. A reserva não autoriza código novo nem altera o escopo de AAA-12 silenciosamente: registrar task/escopo e gates antes de implementar.
- D05-3/D05-4: retenção e capacidades reais do provider permanecem pendentes. Não inventar decisão de negócio ou homologação.

### Prompt atualizado — Agente 1

```text
Atue como coordenador das três frentes. Leia AGENTS e runtime/log/backlog, 0327 e os manifestos AAA-05/12/16. Preserve alterações concorrentes. Considere as três entregas IMPLEMENTED, sem DONE nem autorização retroativa.
Revise AAA-04 de forma independente. Com o Agente 2, feche as condições do parecer AAA-03 e a compatibilidade do §3.1 de AAA-05: idempotencyKey = operationKey para a mesma entrega governada; namespace explícito para notificações distintas. Não presuma proposalHash = payloadHash: confira os campos canônicos de cada fronteira e documente o vínculo verificável. Resolva também a aparente divergência entre replay de FAILED e o exemplo de retry após falha sem efeito.
Mantenha 0012 reservada ao Agente 2 somente para planejamento; registre paths e task/escopo dos adapters SQL antes de qualquer BUILD. Outbox/postgres/runtime continuam sob seu ownership. Após parecer independente dos hashes finais, registre congelamento técnico e autoridade aplicável separadamente. Não confunda revisão técnica com revisão humana de SPEC.
Integre pareceres do Agente 3 sobre AAA-05/12/16, mantenha o DAG granular de 0327 e publique sozinho os registros comuns após este recebimento. Se houver gate pendente, continue documentação/revisão independente; não inicie código dependente. Entregue decisões, hashes, gates concedidos ou pendentes e próxima task realmente pronta. Sem commit/push/deploy nem efeitos reais.
```

### Prompt atualizado — Agente 2

```text
Suas entregas AAA-05/12/16 foram recebidas como IMPLEMENTED, ainda sem aceite. Leia 0327 e aguarde o parecer independente antes de outra rodada de mudanças nos candidatos em revisão; preserve manifestos e logs históricos.
Prepare um adendo de contrato para as questões de hashes, namespaces e retry de FAILED levantadas pelo coordenador, indicando exatamente quais evidências ficariam obsoletas. Migration 0012 está reservada a você para planejamento. Proponha paths e atribuição de task para adapters SQL de ChannelEffectJournal e EffectJournalPort, sem tocar outbox.ts/postgres.ts, exports ou migration antes de registrar escopo e gates. Não tratar AAA-17 como autorização automática para esse trabalho.
Apresente plano de correção da cobertura crítica e dos casos adversariais ausentes. O débito da implementação de canal pertence a AAA-12, com eventual coordenação de AAA-34; AAA-15 trata formatação e AAA-04 não deve baixar a barra. Diferencie teste com duas instâncias de teste com processos distintos, restart real e queda de energia. Faça correções somente após lock, task e gate aplicáveis, preservando RED e emitindo novo digest.
Mantenha o PostgreSQL descartável disponível ao revisor; nenhum acesso à porta 5432 ou dados reais. Atualize referências históricas de dependências por adendo, sem apagar evidências antigas. Entregue handoff próprio; não escreva runtime/log/backlog/ledger compartilhados. Nunca autoaprovar DONE.
```

### Prompt atualizado — Agente 3 (próxima revisão prioritária)

```text
Faça revisão independente, sem editar código do autor, de AAA-05/12/16. Leia AGENTS, 0327, AAA-03 e seu parecer, AAA-04 e os três manifestos. Confirme hashes e fixe o candidato; mudanças posteriores exigem nova revisão. Você não aprova seu próprio AAA-04: essa revisão cabe ao Agente 1.
AAA-05: confronte identidade/namespace, canonicalização de proposalHash e payloadHash, transições, retry de FAILED, fencing e fronteira das duas portas. Não aceite mera equivalência de nomes como prova de binding. Verifique que SQL proposto não é apresentado como implementado.
AAA-12: revise diffs e reexecute cenários focados em fixture sintética; inclua concorrência, payload divergente, tenants/canais, lease vencido, resposta tardia, crash antes/depois do efeito, takeover e falha fechada. Verifique se há processos distintos e restart real; duas instâncias não comprovam isso. Confronte cobertura por módulo com a barra AAA-04 sem reduzir limiares. Registre limites do arquivo sem fsync e necessidade de reconciliação de efeito incerto.
AAA-16: confira isolamento do cluster 55432 e harness sem asserções afrouxadas; reserve o recurso com Agente 2 antes de reexecutar os 84 testes. Registre zero skips e exit code, não somente contagem PASS. Não use 5432. Separe RLS/migrations funcionais de durabilidade física e de testes futuros do journal SQL.
Publique parecer por task em docs/04_audit/evidence/AAA/AAA-XX/review-agent-3/, com digest, comandos/exit codes, critérios PASS/FAIL/NOT RUN e blockers. Solicite REWORK onde houver critério obrigatório sem prova; APPROVE técnico não concede G_SPEC/G_QUALITY. Envie ao Agente 1 para integração; não edite registros comuns. Preserve suas tasks 13/14/15, mas não misture alterações delas ao candidato em revisão.
```

Programa: `AAA-20260912`. Atualização documental solicitada pelo usuário em 2026-09-12. Este documento substitui a orientação operacional desatualizada da rodada 1, preservando seus registros históricos. Não altera os contratos normativos nem concede aprovação retroativa a código já produzido.

## Estado observado e decisões desta atualização

| Task         | Estado registrado agora              | Evidência e limite                                                                                                                                                 |
| ------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AAA-01       | VERIFIED, somente baseline histórico | Parecer independente APPROVE; digest de 858 arquivos `9ed0777a…` reconferido. Não qualifica o working tree que recebeu alterações depois.                          |
| AAA-03       | REVIEW                               | Parecer técnico APPROVE sobre `db75899f…`, com condições de binding, consumo, TTL/sweep e limites por turno. Contrato ainda PROPOSED_NOT_FROZEN.                   |
| AAA-04       | REVIEW                               | Contrato/barra/protocolo e manifesto presentes; seis hashes reconferidos. FROZEN_PENDING_INDEPENDENT_REVIEW significa versão fixada pelo autor, não gate aprovado. |
| AAA-05       | REVIEW                               | Draft existente; reconciliar identidade da operação e corrigir referências que diziam AAA-03 ausente. Nenhum congelamento ou aceite presumido.                     |
| AAA-12       | BLOCKED para promoção                | Código/testes observados; dependências/contratos ainda não aceitos. Pode preparar handoff e responder à revisão; não promover a VERIFIED/DONE nem ampliar escopo.  |
| AAA-16       | REVIEW                               | Log registra 11 arquivos/84 testes PASS, zero skips. Revisão do ambiente, candidato e requisitos pendente; isso não fecha automaticamente AAA-05/14/04.            |
| AAA-13/14/15 | Status não promovido por inferência  | Existem alterações concorrentes em supply chain/artefatos. Agente 3 deve entregar estado e manifesto por task; diff não prova conclusão.                           |

Os pareceres foram lidos em `docs/04_audit/evidence/AAA/AAA-01/review-agent-3/` e `AAA-03/review-agent-3/`. Não foram reexecutadas nesta atualização a suíte do produto, o PostgreSQL ou a reprodução do canal; os números acima vêm dos logs e pareceres identificados. Os checks executados aqui são de documentação, identidade dos artefatos e coerência dos registros.

O review de AAA-01 observou `channelRace.sends: 2 → 1` após alteração concorrente do canal; isso não aprova o conjunto da implementação AAA-12. A classe `FileChannelEffectJournal` declara persistência local a um host; não substitui journal PostgreSQL multi-host nem prova sobrevivência a perda de energia/disco. O ledger relata PostgreSQL descartável com fsync desligado: serve como evidência funcional a revisar, não como prova de durabilidade física/RPO-RTO. Se o ensaio exigir crash/durabilidade, usar fixture isolada adequada com fsync habilitado e documentar o cenário.

## Correção de dependências e topologia

| Task do Agente 1 | Pré-requisitos, além de gate SPEC/autoridade aplicável |
| ---------------- | ------------------------------------------------------ |
| AAA-08           | AAA-03 e AAA-04                                        |
| AAA-07           | AAA-03, AAA-04 e AAA-05                                |
| AAA-09           | AAA-07, AAA-08 e AAA-04                                |
| AAA-10           | AAA-09, AAA-05, AAA-16 e AAA-04                        |
| AAA-11           | AAA-10 e AAA-04                                        |

AAA-16 não é bloqueio universal de AAA-07–11. G_QUALITY de qualificação final também não pode ser exigido circularmente antes de todo código: o pré-requisito é a barra AAA-04 revisada/congelada e G_SPEC aplicável, seguido da qualificação após implementação. Resolver redações ambíguas nos contratos sob revisão, sem afrouxar a barra nem fabricar autorização.

A instrução posterior do usuário fixa **três agentes no total**. A configuração original de quatro slots fica preservada como baseline de planejamento; a configuração vigente é lead/integrador + duas frentes, com revisão independente alternada no tempo. Não criar quarto agente. O autor de uma alteração não é seu único revisor.

## Ordem imediata e responsáveis

1. **Agente 1 revisa AAA-04**, que foi escrita pelo Agente 3, e devolve parecer por hash; se a análise pedir alteração, o Agente 3 versiona a barra e renova o manifesto antes do BUILD dependente.
2. **Agentes 1 e 2 reconciliam AAA-03/05**, cada um escrevendo somente seu documento. Devem definir mapeamento de identidade, porta de journal, payload hash, chave da notificação outbox, escopo tenant/canal/kind e operações distintas. Um nome igual não basta: acrescentar exemplos de retry, colisão e mudança de payload.
3. **Agente 3 revisa as versões finais de AAA-03/05** e fecha as condições que recaem no texto. Obrigações que só podem ser provadas em BUILD viram critérios de regressão das tasks donas, não alegações de que testes inexistentes passaram.
4. **Agente 2 entrega manifestos AAA-12/16** com hashes/candidato, comandos, limites e recuperação; Agente 3 revisa. Reconciliar ownership do adapter durável e migrations antes de novas mudanças em persistence.
5. **Agente 1 integra os pareceres e registra gates por task**. Evidência antiga permanece histórica. Se a autoridade humana exigida não estiver registrada, preparar o pacote concreto para decisão e continuar trabalho independente permitido; não pedir confirmação repetida quando o contexto já a fornecer.
6. **Liberar a menor task pronta**: AAA-08 após 03/04 e gate aplicável; AAA-07 depois de 05; AAA-09 depois de ambas; AAA-10 só com 16 revisada e handoff de persistência. Agente 3 avança AAA-14/15/13 após seus gates, com outro agente revisando suas mudanças.

## Locks e recursos

- Agente 1 publica backlog/ledger/runtime/log após esta atualização pontual expressamente solicitada ao assistente. Agentes 2 e 3 entregam propostas de atualização em seus diretórios, não escrevem os registros compartilhados.
- Agente 1: contrato de execução e pacotes approval/policy/runtime. `outbox.ts`/`postgres.ts` exigem handoff exclusivo com Agente 2 para AAA-10.
- Agente 2: contrato de dados, canal e fixture PostgreSQL. Sem alterar contrato de execução nem barra. Reservar migration, schema/exports e adapter com Agente 1.
- Agente 3: contrato de qualidade, supply chain e certificação. `verify.yml` compartilha escopo com Agente 2; `server.ts` somente formatação AAA-15 em janela cedida pelo Agente 1.
- Nenhum `npm install`, format global, coverage ou gerador de certificação concorrente no mesmo destino. Cada teste usa banco/schema/portas/diretório próprio.
- A porta 55432 e `/tmp/opencode/aaa-agent2-pg16` são referências históricas da fixture do Agente 2: confirmar identidade e propriedade antes de usar. A porta 5432 foi identificada como operacional de outro projeto e permanece fora do escopo.
- Não restaurar SBOM/license-report ao estado antigo por reflexo: agora existem mudanças de outras frentes. Preservar autoria e snapshots; regeneração exige janela e evidência próprias.
- Os contratos AAA-03/04/05 não foram editados nesta atualização para preservar hashes/revisões e ownership. Seus autores devem reconciliar o texto e renovar evidências como indicado acima.

## Prompt de continuação — Agente 1

```text
Continue como Agente 1 em /home/ricardo/cvg-agent-secretary-v2.
Leia AGENTS, runtime/log/backlog e docs/03_build/0327_aaa_round2_coordination.md;
depois confira JSON canônico, ledger, contratos AAA-03/04/05 e reviews existentes.
Não repita a rodada inicial nem use o baseline histórico como candidato atual.

Prioridade: revisar AAA-04 independentemente; reconciliar seu AAA-03 com o
AAA-05 do Agente 2; incorporar condições do parecer de AAA-03. Cada autor edita
seu contrato. Peça ao Agente 3 revisão dos hashes finais e registre os gates
aplicáveis sem fabricar aprovação humana ou retroativa de BUILD.

Congele exemplos e testes para operationKey→identidade do canal, payload
divergente, namespaces da outbox, reserva/execução/confirmação/incerteza,
limites por turno e sweep de reservas. A revisão da SPEC exige que os testes
estejam especificados; sua aprovação não pode fingir que já foram executados.

Respeite prontidão granular: AAA-08 depende de 03/04; AAA-07 de 03/04/05;
AAA-09 de 07/08/04; AAA-10 acrescenta 05/16; AAA-11 depende de 10/04.
Não imponha AAA-16 a todas as tasks nem G_QUALITY final antes de BUILD.

Após dependências e autoridade aplicável comprovadas, implemente a menor task
pronta com regressão negativa, correção mínima e revisão de outro agente.
Não integre AAA-21. Não assuma ownership concorrente de outbox.ts/postgres.ts.

Seja o publicador único dos registros depois desta atualização. Capture
candidato atual antes de cada qualificação; preserve snapshots e pareceres
anteriores. Use três agentes no total e revisão alternada. Sem dado/ação real,
provider/canal externo, commit/push/deploy. Não sobrescreva mudanças alheias.
Entregue progresso por task com hashes, testes/exit codes, parecer e próximo passo.
```

## Prompt de continuação — Agente 2

```text
Continue como Agente 2 em /home/ricardo/cvg-agent-secretary-v2.
Leia AGENTS, runtime/log/backlog e docs/03_build/0327_aaa_round2_coordination.md;
confira AAA-03/04/05, seus diffs e logs. O Agente 1 publica registros comuns.

Reconcilie AAA-05 com o contrato AAA-03 atual. Corrija as referências antigas
de que AAA-03 estava ausente, preserve histórico e entregue hash novo para
revisão do Agente 3. Defina com Agente 1 mapping operationKey/operationIdentity,
tenant/canal/kind, payload hash e ownership do adapter durável/migrations.

Empacote evidências AAA-12 e AAA-16 em manifestos exclusivos: candidato,
contratos, comandos/exit codes, casos concorrentes, restart e limitações.
84/84 no PostgreSQL é evidência funcional a revisar, não gate universal ou
aprovação do journal. Journal em arquivo single-host não prova multi-host.
Fsync desligado não prova durabilidade física; ensaio de crash/durabilidade
precisa de fixture apropriada e medição explícita, sem banco operacional.

AAA-12 permanece sem promoção até contratos, dependências e revisão. Preserve
o código produzido; não o descarte e não amplie a implementação enquanto
interfaces estiverem conflitantes. Após gates, responda aos findings e prove
concorrência entre processos, chave com payload divergente, takeover, lease
expirado, retry e resultado incerto. Não prometa exactly-once externo sem suporte.

Disponibilize AAA-16 revisável para desbloquear AAA-10. Confirme propriedade
da fixture 55432 antes de usá-la; não toque 5432 nem DATABASE_URL operacional.
Não altere outbox.ts/postgres.ts, migrations/exports ou verify.yml sem reserva.
AAA-17 só inicia após nova atribuição e gates; não crie subagentes.
Entregue ao lead manifestos, revisão solicitada, limitações e próximo passo.
```

## Prompt de continuação — Agente 3

```text
Continue como Agente 3 em /home/ricardo/cvg-agent-secretary-v2.
Leia AGENTS, runtime/log/backlog e docs/03_build/0327_aaa_round2_coordination.md;
confira seus reviews e os manifests atuais. Não repita revisão já válida para
o mesmo hash, mas reabra quando o contrato/candidato relevante mudar.

AAA-04 já existe em REVIEW: entregue ao Agente 1 para revisão independente;
não autoaprove sua barra. Se houver mudança, versione os artefatos e renove
hashes mantendo o protocolo congelado antes do holdout e do BUILD dependente.

Priorize a revisão final de AAA-03/05 reconciliados e dos pacotes AAA-12/16
entregues pelo Agente 2. Verifique mapping de operação, payload, namespaces
da outbox, lifecycle e matriz crash. Diferencie requisito especificado de
teste executado; SPEC pode aprovar HOW sem inventar prova de implementação.

Confira os limites do journal single-host e da fixture PostgreSQL com fsync
desligado. Aprove somente o que a evidência sustenta, exigindo testes próprios
para multi-processo, resultado incerto e durabilidade física quando alegada.

Com AAA-04 revisada e gates aplicáveis, avance AAA-14 para desbloquear AAA-16,
AAA-15 na janela exclusiva de server.ts e AAA-13. Reserve instalação/lockfile,
verify.yml e certification/ com o lead. Não sobrescreva evidência histórica ou
artefatos de outra frente. Reporte os estados reais das tasks de supply chain.

Suas alterações exigem revisão por Agente 1 ou 2. Você revisa as deles em
janela separada, sem editar a implementação julgada. Produza APPROVE/REJECT/
BLOCKED com escopo, hash e critérios; nada disso autoriza produção.
Não antecipe AAA-27/34/36/40/41. Não crie quarto agente. Sem dados/ações reais,
commit/push/deploy; nenhum skip obrigatório ou hash histórico vira PASS atual.
```

## Critério de encerramento desta rodada

Contratos reconciliados e revisados com versões/hashes; autoridade aplicável registrada; cada task promovida somente pelo aceite específico; primeiras correções prontas executadas com regressão e revisão; demais pendências localizadas sem bloqueio artificial de todo o programa. O status atual de produto e seus findings não é melhorado por esta atualização documental.
