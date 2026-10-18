# Consolidação na main — 18/10/2026

Pedido: deixar somente a main ativa, integrar as melhorias e preservar o trabalho existente. Task e critérios MC01–05: [contrato](../04_audit/evidence/MAIN-CONSOLIDATION-20261018/task.json).

## Escopo e autoridade

Consolidação Git/integração de mudanças já desenvolvidas, com governança proporcional e gates das respectivas SPECs preservados. A solicitação autoriza merge/publicação por PR e remoção das branches redundantes depois de backup verificado. Não concede aprovação de contrato novo, aceite de experimentos reprovados ou release de produção. Artefatos privados de recuperação ficam fora do repositório.

## Plano de execução

1. Inventariar refs e worktrees, preservar bundle e deltas não commitados. Comparar conteúdo/patches: promoção por cópia e squash tornam ancestralidade insuficiente.
2. Classificar código aprovado, duplicado/superado e experimento em andamento; congelar a composição antes de BUILD. Dois scouts somente leitura, Lead como único integrador.
3. Construir candidata isolada no volume principal, preservando as correções de CI já na main. Integrar somente fontes justificadas e testar a composição atual; nenhuma certificação copiada entre árvores.
4. Publicar por PR, verificar os checks e integrar por histórico linear. Preservar as refs/HEADs das candidatas arquivadas para recuperação e conferir ausência de perda de alterações.
5. Remover branches locais/remotas redundantes e encaminhar o checkout principal para main. Worktrees em uso ou sujas são preservadas; mudança de referência exige mesma árvore e reconciliação dos claims.

## Progresso observado

- Inventário inicial: 43 branches locais, 18 worktrees e cinco branches remotas além da referência simbólica, conforme inventário salvo. Main remota atual b9f48a77 (PR #3 integrado por squash).
- Bundle completo verificado e patches/tars locais dos deltas das 18 worktrees preservados em `/home/ricardo/cvg-main-consolidation-20261018`; symlink de compatibilidade em `/mnt/ia/cvg-main-consolidation-20261018`.
- Não promover os commits de reference capture rotulados UNREVIEWED por mera fusão. Estado/revisão da implementação recente em investigação antes da composição.
- Arquivo de runtime, log e backlog anteriores seguem históricos; a próxima entrada refletirá o resultado atual desta consolidação.

## Verificação e recuperação

Os critérios MC01–05 permanecem abertos até evidência executada. O bundle preserva os commits/refs; `dirty-backups.json` indexa patches binários e arquivos não rastreados por worktree. Nenhum reset, clean, stash ou descarte de deltas alheios é permitido. Ao encontrar uma regressão, guardar o resultado, corrigir apenas na candidata própria e repetir o check discriminante.

## Próxima ação

`MAIN-CONSOLIDATION-20261018:QUALIFY-COMPOSITION`: validar fonte41ab2813, reparoR1 e gates atuais antes de publicar/aceitar integração e limpar refs locais.

## Checkpoint de integração

A composição aprovada para teste está em41ab2813, na candidata própria. Root permanece intacto em834 com deltas documentais próprios. Dois scouts encerrados e críticoR1REVISE/doisP2; um reparo agrupado, R2 ainda pendente. Os quatro branches remotos antigos foram removidos após backup, PR1/2 fechados; main remota b9f48a77 segue protegida. As fontes R4 vivas permanecem isoladas e não foram promovidas.

Testes iniciais: buildruntime/lint/formato/typecheck/SDKPython47PASS. Duas tentativas de compilação SDK porconfig genérica falharam por incluir testes/rootDir e types; o builder público versionado correto passou, sem alterar fonte para contornar. Check de docs executado em paralelo aos unit encontrou corrida sobre fixture transitória de teste; repetir sequencialmente. Relocationfirstred confirma guardaantiga; primeiro namespacefocal falhou por /dev/null readonly no harness de teste; corrigido namespace com /dev próprio sem alterar guardas de fonte. Preservados todos logs brutos.

## Perfil de provas externas

Código da composição41ab2813 aprovado emR2 pelo críticoGodel, encerrado sem obrigatórios. Uma descoberta posterior de ambiente abriu a taskT2 separada CI-REFERENCE-PROOF-CLASSIFICATION: referênciaDeepseek instalada não existe no runner, portanto seus25controles agora têm perfil explícito e obrigatório. Em6c99801e os três renames são100%byteidênticos; controle de glob e recusa sem recurso PASS,25provas relocalizadas PASS/zero skip. Não há alteração de escopo/identidade selada CI_BAR, pisos ou fonte de aplicação. Baselines anteriores foram interrompidas porPID próprio antes dos renames e registradas como não-finais; novos PGs próprios substituíram apenas recursos do mesmo claim. Certificação e CI reiniciadas na fonte6c99801e.

## Seleção após os probes

A árvore promovida834+portabilidade e correções de suporte é a opção selecionada para concluir a main. O probe comprovou100% nos arquivos críticos modificados; compatibility.ts permanece idêntico à main e precisa da suíte completa para seu uso fora do subconjunto. A frente experimental192872d6 continua íntegra, com melhoria de desempenho e revisões, porém não promovida pela qualificação ainda aberta. Histórias foram unidas preservando a árvore selecionada; nada foi descartado nem forçado no remoto. Nova açãoQUALIFY-STABLE, antes de merge/limpeza.
