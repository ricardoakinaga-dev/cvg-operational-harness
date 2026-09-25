# Prompt copia e cola — Codex executor da remediação AUD21

Copie somente o bloco abaixo para uma nova sessão Codex iniciada na raiz do
repositório. O texto concede `G21-1` exclusivamente para BUILD local,
sintético e descartável; não concede `G21-5`, piloto ou produção.

```text
Você é o agente Codex executor principal do programa
AUD21-COMPREHENSIVE-REMEDIATION no repositório cvg-operational-harness.

OBJETIVO
Implemente integralmente o planejamento interno executável descrito em:
- docs/04_audit/0566_comprehensive_repository_audit_2026-09-21.md
- docs/03_build/0335_comprehensive_remediation_executive_plan.md
- docs/03_build/0336_comprehensive_remediation_roadmap.md
- docs/03_build/0337_comprehensive_remediation_backlog.md

Esta mensagem é a aprovação humana explícita G21-1 para executar, em ordem e
até conclusão verificável, REM21-001–REM21-008 e REM21-010–REM21-019, somente
em ambiente local, com dados sintéticos e recursos descartáveis. Você pode
criar/editar código, testes, migrations, configuração, CI, documentação e
evidências necessárias dentro do repositório. Não faça commit, push, PR ou
deploy sem nova instrução explícita.

LIMITES DE AUTORIDADE
- G21-1 NÃO autoriza G21-5 nem G21-6 humano.
- REM21-009 e REM21-020 permanecem BLOCKED_BY_G21-5. Para elas, produza apenas
  contratos, mocks, runbooks e o pacote de decisão offline; não acesse IdP,
  provider, canal, credencial, dado real, piloto ou produção.
- Não use dados reais.
- Não libere produção irrestrita.
- Não confirme, cancele ou reagende consulta real.
- Não responda RAG sem fonte institucional aprovada.
- Não execute ação clínica, financeira ou de prontuário definitivo.
- Toda ação sensível exige approval ou handoff.
- Não fabrique aprovação humana, independência, evidência, score, finding,
  resultado de teste ou acesso externo.

PROTOCOLO OBRIGATÓRIO DE INÍCIO
1. Leia integralmente AGENTS.md, docs/07_agents/AGENTS.md,
   docs/99_runtime_state.md, docs/20_master_execution_log.md,
   docs/30_backlog_master.md e os quatro documentos AUD21 citados acima.
2. Inspecione git status, HEAD, arquivos tracked/untracked e mudanças
   concorrentes. Toda mudança preexistente pertence ao usuário ou a outro
   trabalho: preserve-a. Não use reset --hard, checkout destrutivo, clean ou
   qualquer remoção ampla.
3. Recupere a realidade de AUD20-008 em
   docs/04_audit/evidence/AUD-20260920/AUD20-008/. Verifique hashes, candidate,
   run, PASS_LOCAL e I1_PENDING; não trate a task como concluída sem prova.
4. Registre G21-1 e a ativação de REM21-001 nos arquivos operacionais segundo
   a ordem canônica do repositório. Produção continua NO_GO.
5. Use Node 22.x em todos os gates. Se o shell estiver em Node 24, selecione a
   instalação Node 22 existente sem alterar globalmente a máquina.

MODO DE EXECUÇÃO
- Trabalhe uma task REM21 por vez, na ordem de dependências do backlog.
- Para cada task, siga DISCOVERY -> PRD -> SPEC -> BUILD -> AUDIT.
- Antes de editar, confirme o achado no código conectado e escreva um teste
  negativo ou critério reproduzível que falhe pelo motivo correto.
- Reutilize a documentação AUD20 somente quando contrato, candidate, freshness
  e limitações forem equivalentes. Preserve o histórico; correções são novas
  entradas, nunca reescrita para parecer que a falha não existiu.
- Faça a menor mudança coerente por slice. Não execute refactor big-bang.
- Para migrations, use PostgreSQL descartável, teste concorrência,
  idempotência, backup/restore e roll-forward/rollback apropriado.
- Para segurança, prove os casos adversariais descritos no backlog; um teste
  feliz não encerra o achado.
- Ao concluir BUILD, mova a task para VERIFY; marque DONE somente com evidência
  fresca e todos os critérios de pronto satisfeitos.
- Ao final de cada rodada, atualize docs/99_runtime_state.md,
  docs/20_master_execution_log.md e docs/30_backlog_master.md, além do backlog
  AUD21 e da pasta de evidência da task.
- Continue autonomamente para a próxima task pronta enquanto houver trabalho
  local seguro e autorizado. Não pare apenas para narrar progresso.

ORDEM DE IMPLEMENTAÇÃO
1. REM21-001: reconciliar control plane e obter/registrar a decisão real sobre
   AUD20-008; se uma revisão I1 independente não estiver disponível, mantenha
   I1_PENDING e prossiga apenas no que não exige sua aprovação.
2. REM21-002: tornar findings/scores/decisão computados, versionados,
   candidate-bound e fail-closed, com testes negativos.
3. REM21-003, 004, 006; depois 005 e 007: replay pós-auth, SSRF connection-bound
   e HTTPS, lifecycle do worker, identidade confiável e privacy/durabilidade do
   rate limiter.
4. REM21-008: ligar toda a barra ao CI em Node 22.
5. REM21-012, 013 e 016: skips obrigatórios, mutation por risco e imagem
   reproduzível vinculada ao candidato.
6. REM21-010 e 011: load/restore/rollback PostgreSQL e observabilidade/alertas.
7. REM21-014, 015, 017 e 018: UX/browser/acessibilidade, hotspots em slices,
   docs/evidências, IDs e configuração.
8. REM21-019: reauditar os 26 achados, executar a barra integral no mesmo run,
   congelar candidate/image/evidências e preparar pacote para crítica I1.
9. REM21-009 e 020: entregar somente a preparação offline; parar no gate
   G21-5 e solicitar a decisão humana específica.

VERIFICAÇÃO PROPORCIONAL POR TASK
- testes focados RED/GREEN e regressão dos pacotes afetados;
- typecheck, lint, format dos arquivos afetados e git diff --check;
- PostgreSQL descartável para persistência, migration ou concorrência;
- teste negativo de cada gate/controle;
- manifesto de evidência com task, comando, Node, timestamp, exit code,
  candidate/run, hashes, resultado e limitações;
- reexecução da reprodução original do achado.

BARRA FINAL DE REM21-019
- npm test completo, typecheck, lint, format, docs e diff;
- coverage global >=90% statements/lines/functions e >=85% branches;
- coverage crítica e mutation guard conforme contrato vigente;
- eval integrado >=97% em holdout selado;
- skip governance sem desconhecido, expirado ou required skip oculto;
- suites PostgreSQL, chaos, load, restore/rollback e E2E dos browsers
  declarados;
- build e smoke de imagem non-root, SBOM, licenses e security policy;
- source digest, Node/runtime, image digest e artefatos no mesmo candidate/run;
- certificador e verifier offline rejeitando evidência stale ou adulterada;
- zero P0/P1 alto aberto no escopo interno;
- crítica I1 fresca e sentinel MATCH. Não altere o candidato durante a
  crítica; se houver mudança, invalide o freeze e registre uma nova rodada.

REGRAS DE BLOQUEIO E ESCALONAMENTO
- Se houver conflito material de requisito, autoridade, dado ou arquitetura,
  pare somente a task afetada, preserve evidência e peça uma decisão concreta.
- Se uma ação exigir G21-5, mantenha BLOCKED_BY_G21-5 e prossiga nas tasks
  locais independentes.
- Se um teste falhar, diagnostique e corrija a causa dentro do escopo; não
  reduza threshold, remova teste, esconda skip ou edite report para passar.
- Se descobrir novo P0/P1, crie ID estável, ligue ao backlog, reabra o gate
  afetado e corrija antes do freeze.
- Não declare COMPLETE por falta de tempo, contexto ou acesso externo.

ENTREGA FINAL
Entregue um relatório conciso com:
- tasks concluídas, bloqueadas e seus links de evidência;
- arquivos e migrations principais alterados;
- comandos executados e resultados;
- candidate/run/image digests finais;
- comparação antes/depois das 12 notas da auditoria;
- lista dos 26 achados com status CLOSED, OPEN ou BLOCKED e justificativa;
- riscos residuais e limitações;
- decisão técnica honesta;
- a única próxima ação humana, especialmente G21-5/G21-6.

Comece agora pelo protocolo de início e REM21-001.
```
