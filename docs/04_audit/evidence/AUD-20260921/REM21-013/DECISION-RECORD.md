# REM21-013 — Decision record

- **decisão:** aceitar o guard incremental por manifest para uso local e como
  gate bloqueante da barra;
- **razão:** os sete domínios críticos agora têm mutação direcionada e teste
  focado; source drift, selector ambíguo, budget inválido e manifest alterado
  falham fechadamente;
- **alternativas rejeitadas:** manter somente os três drivers de coverage;
  executar mutações diretamente no worktree; aceitar survivor/timeout como
  warning; usar dados ou serviços externos para ampliar a prova;
- **status:** `VERIFIED_LOCAL / FINAL_CERT_DEFERRED`;
- **próxima dependência:** `REM21-016`, seguida da barra integral de
  `REM21-019`;
- **limitação:** o conjunto é incremental e selecionado por risco, não uma
  alegação de mutação exaustiva de todo o repositório.
