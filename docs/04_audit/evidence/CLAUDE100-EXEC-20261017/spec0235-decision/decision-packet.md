# SPEC0235 — decisão de BUILD local

Task `C100-Q01-REF-PORT-001`. Estado `WAITING_HUMAN_APPROVAL`.

Contrato revisável: [SPEC0235](../../../../02_spec/0235_claude_native_port_probe.md), SHA-256 `aaa12b3ee55021e357fc9a17518316135eb4ca423b87215af754cd18dbb41f04`. [Revisão independente final](review-r3/REPORT.md): APPROVE_SPEC, zero achados obrigatórios; doze pins reconferidos.

Aprovar permite construir o probe privado e, somente após código congelado/revisão independente e preflight real, executar o binário Claude2.1.302 pinado em dois contêineres próprios sem rede externa. Coletor separado observa um POST nativo e envia erro503 fixo; cliente recebe apenas chave sintética. Os limites, identidades, protocolo, cleanup e falhas estão fechados na SPEC. A imagem local exige bind vazio readonly no volume declarado. Nenhuma conta, modelo real, dado real, M1, adapter de equivalência, instalação, push/deploy ou release faz parte desta decisão.

Todos NP01–NP10 continuam NOT_RUN. Aprovação documental não é aprovação humana nem prova de contenção/porta. A aprovação0229 já foi cumprida para o comparador e permanece separada.

A [constituição](../../../../07_agents/AGENTS.md), D-12/T3, exige “T2 + revisão explícita da SPEC pelo usuário antes do BUILD”. Este probe cria o contrato de segurança/identidade da execução nativa; por isso precisa desta decisão específica antes de código. Não é exigência inferida da skill.

Resposta aprovável: `Aprovar BUILD local da SPEC0235` neste SHA. Até essa resposta, somente documentação e trabalho independente já autorizado continuam.
