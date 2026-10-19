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

## Qualificação vigente e limpeza preservadora

Fonte selecionada c352d314 / HEAD a46687c3 no PR #4. Revisão independente APPROVE sem obrigatórios; build runtime e SDK e prova externa de reply PASS. Segurança hospedada PASS; unit/gates completos locais e CI ainda em execução. A frente complete192 é arquivo recuperável, sem promoção. Snapshot adicional de22worktrees inclui avançosR4d6f869e5 e a nova build0241; todos HEADs importados no espelho de recuperação. Detach das candidatas no mesmo HEAD, comparação de índice/conteúdo antes/depois e remoção CAS das refs estão em andamento; diretórios, deltas e recursos dos pares preservados.

## Reparo da barra hospedada

CIa466 terminou FAIL após26,9min deunit:44falhas/5608PASS e15não executados por setup falho. Causas finitas identificadas e registradas emci-a466-repair-task.md. Driverci-bar recupera enforcement já implementado ema724 (perfile1, invalidação de snapshot e piso agregado), teste do scanner aceita somente dois tipos de fingerprint exato. Fixture negativa usa outro ELF físico real em vez de pathnameNode24 inexistente. Duas provas que exigem identidade física fixaGit/tar/strace passam a perfil explícito com os mesmos bytes/pins; semskip/repin/mocks.109testesCI e101runtimePASS, negativaNode24realPASS. Revisão fresca e perfil físico completo em andamento. Nova barra hospedada ainda precisa passar antes de merge.

Execução adaptada à evidência: após FAIL conclusivo da barra hospedada, o certify local a466 foi encerrado como superseded, logs preservados. Na nova candidata a barra hospedada continua incluindo todos gates e certify integral; localmente antecipar cobertura por arquivo/agregada e executar provas físicas/externas separadas, sem repetir uma certificação idêntica adicional nem transferir certificado de outra árvore.

## Checkpoint final de runtime

87492b10: CIunit/cobertura/cobertura crítica/mutação/startup/PG/recuperação/observabilidadePASS; restantes gates e certificação ainda em execução. Localmente provas físicas47,reply4,E2E12PASS; probe de runtime5080PASS,289fontes/50críticas100%, agregado94,27/90,80/96,13/95,13%. Probe filtra explicitamenteB6/scripts fora do denominador de produção e não substitui a barra completa. Incidente da primeira cobertura local permanece inconclusivo emcoverage-worker-triage.json, replays passaram sem editar fonte; não declarar causa histórica nem ocultar o FAIL. QuatroPGs próprios removidos com verificaçãoID/label/zero clientes, nenhuma porta de app própria ocupada. Próximo WAIT-CI-CERTIFICATION, merge protegido e última limpeza preservando252novos arquivos documentais do root concorrente ad17c0ee, a recomputar antes da troca.

## Envelope do parentcertify

Medição da própria CI874: unit1626s +coverage1788s +PG173s +format42s +types16s +lint15s +build21s +startup1s =3682s, ainda sem outros oito componentes obrigatórios. Timeout externo de3600s não oferece envelope para o catálogo atual. Delta isolado aumenta somente parentcertify para5400s, todos outrosparents3600s e deadlines internos/caps nativos inalterados.46regressõesPASS, críticoGibbsAPPROVE. Novo commit exige nova barra completa; fonte de runtime ébyteidêntica874. Objetivo segue main única, com snapshots e novos avanços dos pares preservados no fechamento.

## Compatibilidade do scanner com squash protegido

TaskT2 documentada antes do delta. Scanner real reproduziu52falsos positivos na integração proposta:26valores já triados e26identificadores Git no relatório histórico. A candidata mantém defaults/pins/allowlists anteriores e aceita somente29pares de detector+caminho+literal exatos viaAND, com manifesto de25fontes congeladas.82unitPASS,lint/typecheckPASS e30provasCLI PASS/zero skip (default detecta, par exato aceita, outra localização/novo valor/provedores permanecem detectados). Histórico proposto e squash inicial zeraram achados. Revisão fresca, squash da árvore final e nova barra hospedada integral ainda pendentes; main/proteções inalteradas.

Repetição da prova nativa anterior falhou em um controle de novo valor no detector default (28PASS/2FAIL incluindo parent). O valor transitório foi removido pelo cleanup e não há causa histórica medida. A geração agora garante alta entropia por construção, preservando todos detectores/asserts; nova prova e revisão do delta pendentes. O primeiro30PASS permanece histórico, sem substituir a execução atual.

Após precondição de entropia, provaCLIreal atual30PASS/zero falhas/zero skips em76,753s; lint do deltaPASS. Formato completo e links/higienePASS. A suíte explícita continua fora da coletaVitest padrão, confirmada via comando real de listagem. Publicar nova revisão para barra integral; prova da árvore publicada e revisão estreita final ainda pendentes.
