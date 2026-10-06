# 0372 — Roteiro do kernel de plugins

- Data: 06/10/2026. Task: `KERNEL-PLUGINS-20261006` (Claude Code).
- Decisão: [ADR-011](../architecture/adrs/ADR-011-kernel-de-plugins-com-controles-obrigatorios.md).
  Diagnóstico: [auditoria 0596](../04_audit/0596_auditoria_motor_direcao_plugins_2026-10-06.md).
- Relação: substitui como direção do motor o item ENG-007 do
  [0371](0371_engine_production_backlog.md). Os cartões HISO do
  [0370](0370_harness_product_isolation_backlog.md) continuam com o Codex; onde
  há sobreposição, fica o ponteiro.
- Regra: os passos seguem a ordem. Cada passo termina com a suíte do motor e a
  suíte de conformidade verdes. Produção `NO_GO`; nada aqui autoriza dado real,
  provider externo, push ou deploy.

## KPLG-001 — Consolidar e ter uma linha de base verde

- Estado: `IN_PROGRESS`. Gate: T1/T2. Dependências: nenhuma.
- O quê: as correções ENG-001 a ENG-018 já estão em `73669b8`. O código não
  commitado restante é do Codex e não é tocado. A linha de base roda em worktree
  isolado de `HEAD`, com Node 22.23.2 e PostgreSQL descartável próprio: suíte
  completa, `test:postgres`, typecheck e lint.
- Aceite: um commit, uma execução, números e skips registrados, com o
  PostgreSQL efetivamente usado. A evidência fica pequena, fora dos 1,5 GB
  atuais (resumo + logs compactados).

## KPLG-002 — Contrato de plugins, conformidade e barra do harness

- Estado: `TODO`. Gate: T3 para a SPEC; revisão do usuário antes do KPLG-003.
  Dependências: KPLG-001.
- O quê:
  - SPEC curta do contrato: tipos de plugin, chaves de serviço, pontos de
    interceptação com modo de despacho, invariantes de controle e perfil
    obrigatório.
  - Suíte de conformidade derivada das invariantes da ADR-011, executada contra
    os três runtimes atuais.
  - Rascunho da barra de produção do harness para decisão do usuário.
- Aceite: SPEC revisada pelo usuário. A suíte roda e mostra, invariante por
  invariante, o que passa hoje em cada runtime. A barra é proposta, não
  aprovada por este cartão.

## KPLG-003 — Kernel com host de plugins

- Estado: `TODO`. Gate: T3. Dependências: KPLG-002 aprovado.
- O quê: implementar o kernel mínimo (loop + host + pontos de interceptação).
  Política, aprovação, orçamento, auditoria e journal atuais são embrulhados
  como plugins de controle, **sem mudar comportamento**.
- Aceite: os 520 testes do motor e a suíte de conformidade passam. O kernel
  recusa iniciar sem os controles obrigatórios. Guarda monotônica, aprovação
  ausente e exceção em plugin têm testes negativos.

## KPLG-004 — Unificar as pilhas

- Estado: `TODO`. Gate: T3. Dependências: KPLG-003. Fecha o ENG-007.
- O quê: single-pass, iterativo e o kernel durável do worker passam a usar o
  mesmo loop. `policy`/`policy-engine` e `agent-core` são consolidados ou
  removidos. A migração é coordenada com a extração do Codex em
  `packages/agent-runtime`.
- Aceite: uma única implementação do pipeline de governança. Suítes do motor,
  PostgreSQL e conformidade verdes. Pilha real local (API + worker + PostgreSQL)
  revalidada como no 0371.

## KPLG-005 — Modelo e canais como plugins de capacidade

- Estado: `TODO`. Gate: T2; T3 se mudar comportamento público. Dependências:
  KPLG-004.
- O quê: o `model-gateway` (orçamento, circuit breaker, retry, roteamento) vira
  plugin de capacidade com controle de orçamento no ponto "antes de chamar o
  modelo". O `channel-gateway` vira plugin de canal. Inclui o limite de bytes
  durante a leitura (HISO-011).
- Aceite: troca de provedor e de canal por configuração, sem tocar no kernel.
  Respostas acima do teto são cortadas durante a leitura.

## KPLG-006 — Assistente de Plantão como plugins

- Estado: `TODO`. Gate: T3. Dependências: KPLG-005. Cartões do produto:
  PISO-001, 003, 005 e 006.
- O quê: o assistente vira um conjunto de plugins sobre o kernel. A confirmação
  da nota usa a aprovação de uso único, o lembrete usa o journal de efeitos, o
  histórico usa a auditoria e a organização usa o gateway de modelo.
- Aceite: os defeitos da auditoria 0596 §5 fechados pelo motor, não por remendo
  no produto. Os 37 testes do assistente e os casos de homologação sintéticos
  passam. Nenhum import do produto no núcleo.
