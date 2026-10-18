# Fonte única dos cartões PAR (backlog 0380). Gerado para o doc e para os totais do roadmap 0379.
# Campos: id, fase, titulo, tam, prio, trilha, rel, ref, legado, deps, estado, hoje, entrega, aceite

C = []


def card(id, fase, titulo, tam, prio, trilha, rel, ref, legado, deps, hoje, entrega, aceite, estado="TODO"):
    C.append(dict(id=id, fase=fase, titulo=titulo, tam=tam, prio=prio, trilha=trilha, rel=rel, ref=ref,
                  legado=legado, deps=deps, estado=estado, hoje=hoje, entrega=entrega, aceite=aceite))


# ---------------- F0 — Medida, base e processo ----------------
card("PAR-G01", "F0", "Consolidar o trabalho PARE100 em andamento", "P", "P0", "T1", "alta",
     "Estado do programa em 16/10/2026", "P100-001..004, 010, 012, 025; SPECs 0217–0226", [],
     "182 caminhos alterados sem commit na worktree `/tmp/cvg-pare100-exec-20261014-6az3hlay/worktree` (o `/tmp` é limpo no boot); cinco gates T3 pendentes (0220, 0221, 0222, 0225, 0226); 2 de 36 cartões P100 concluídos localmente.",
     "Commit em branch própria do trabalho da worktree, pelo dono (Codex); decisão do usuário sobre os cinco gates num único pacote; cartões P100 em andamento remapeados para os IDs PAR desta carteira.",
     "Nenhum código aceito existe só em `/tmp`; cada gate pendente tem decisão registrada; a tabela de correspondência P100→PAR está publicada.")
card("PAR-Q01", "F0", "Congelar o catálogo de capacidades PAR-CAP v1", "M", "P0", "T1", "alta",
     "266 capacidades da análise PARE100-GAP (G1–G5)", "P100-003", ["PAR-G01"],
     "Matriz de 44.132 folhas estáticas (30.586 STATIC, 13.546 UNKNOWN), sem nenhum PASS funcional; levantamento por capacidade feito em 16/10 por leitura.",
     "Revisar as 266 capacidades com fonte (caminho e commit da referência), relevância, classe (EQUIVALENTE, EQUIVALENTE_GOVERNADA ou DIVERGENTE_DECIDIDA) e procedimento de aceite. As folhas estáticas ficam como rastreabilidade, ligadas a uma capacidade.",
     "Nenhuma capacidade sem procedimento e cartão; denominador publicado com hash; qualquer mudança de escopo exige decisão registrada e nova versão da medida.",
     estado="IN_PROGRESS")
card("PAR-Q02", "F0", "Comparador diferencial keyless operando", "M", "P0", "T2", "alta",
     "G4/TST-03; regra 6 do plano 0376", "P100-004, PDSH-032", ["PAR-Q01", "PAR-Q03"],
     "Fixtures F-DIF-TOOL e F-DIF-ERR aceitas no escopo de test-support; o comparador integral ainda não roda.",
     "Executar referência e CVG em home sintética com providers keyless; comparar transcript, efeitos e estado com normalizações declaradas.",
     "Caso conhecido-bom passa; fixtures com efeito extra, evento perdido e resultado indevido falham; nada lê `~/.dsh` ou dado real.",
     estado="IN_PROGRESS")
card("PAR-Q03", "F0", "Kit neutro de test-support", "M", "P1", "T2", "média",
     "G4/TST-03, TST-04, TST-05", "P100-004", [],
     "Replay de fixtures do núcleo (`scripts/snapshot-replay.mjs`) e orquestradores roteirizados dentro dos testes; nenhum kit publicado.",
     "Extrair normalizador de log de sessão, manifesto de suíte e kit do runtime governado num pacote de teste neutro.",
     "Três famílias diferentes usam o kit sem copiar helpers; o normalizador só aceita as normalizações declaradas.")
card("PAR-Q04", "F0", "Servidor de falhas de modelo e replay de stream sintético", "M", "P1", "T2", "média",
     "G4/TST-01, TST-02", "P100-004", ["PAR-Q03"],
     "Falhas roteirizadas em `packages/chaos` e testes do gateway; sem servidor HTTP compatível nem gravação de stream.",
     "Servidor HTTP de falhas no formato do gateway (429, timeout, corte de stream, JSON inválido) e gravação/replay de stream com `record`/`refresh` só sobre dados sintéticos.",
     "Cada falha roteirizada produz o erro normalizado esperado; o modo `record` recusa execução com credencial real.")
card("PAR-Q05", "F0", "Medidor de paridade publicado", "P", "P0", "T1", "alta",
     "Regras 3 a 5 do plano 0376", "P100-050", ["PAR-Q01"],
     "Paridade integral `NOT_MEASURED`.",
     "Script que lê o catálogo e os resultados atuais e publica PASS_CURRENT/total por família e no geral, como relatório (ainda não como gate).",
     "O relatório só conta PASS_CURRENT; PARTIAL, NOT_RUN, BLOCKED e exceção pendente contam como não aprovado; o número sai do mesmo commit dos resultados.")

# ---------------- F1 — Kernel único e contenção ----------------
card("PAR-K01", "F1", "Um só pipeline para API, worker e execução publicada", "G", "P0", "T3", "alta",
     "G1/CORE-03; AUD0611 lacuna 1", "P100-010, PDSH-003b", ["PAR-G01"],
     "`CONTROLLED_RUNTIME` da plataforma ainda executa fora do kernel; fatia sintética 0214 aprovada; SPEC0217 aprovada; SPEC0220 pendente.",
     "API, worker e execução publicada passam pelo kernel durável, com adaptador compatível para os contratos atuais.",
     "Conformidade I1–I12 verde nos três modos; teste de arquitetura prova que não sobra caminho de execução fora do kernel; restart retoma a execução.",
     estado="IN_PROGRESS")
card("PAR-K02", "F1", "Retirar as bibliotecas legadas ativas", "M", "P0", "T3", "média",
     "Plano 0376, frente de legado", "P100-011", ["PAR-K01"],
     "`legacy/packages/secretary-*` ainda têm consumidores.",
     "Retirar exports, rotas, workspaces e lock do legado depois da migração; preservar dados, migrations e evidências.",
     "Host compila, testa e empacota sem `legacy/`; nenhum import residual.")
card("PAR-K03", "F1", "Checkpoint durável antes do modelo e do efeito", "G", "P0", "T3", "alta",
     "G1/SESSION-02, G1/LLM-03", "P100-020 (parte); SPEC0224 aprovada; SPEC0225 pendente", ["PAR-K01"],
     "Journal de efeitos e step-store existem; rota RESPONSE com contexto completo aceita só em memória (R19, AUD 0616); retry não é registrado antes do backoff.",
     "Checkpoint antes da requisição ao modelo, antes de efeito externo e antes do próximo passo; tentativa de retry gravada antes do backoff; retomada pública em PostgreSQL.",
     "Crash entre modelo e ferramenta, e entre ferramenta e resultado, não repete efeito em PostgreSQL real; a tentativa de retry aparece no log antes da espera.",
     estado="IN_PROGRESS")
card("PAR-K04", "F1", "Lifecycle de capabilities com quiescência", "G", "P0", "T3", "alta",
     "G1/CORE; G4/HOST-07", "P100-012; SPEC0222 pendente", ["PAR-K01"],
     "Boot selado, ordem, rollback e dispose existem; não há gerações, recarga nem quiescência.",
     "Gerações de capability, admissão, retirada, recarga e unload com quiescência; controles imutáveis.",
     "Recarga com turno em curso não perde nem duplica efeito; unload ou reordenação de controle é negado e auditado.",
     estado="IN_PROGRESS")
card("PAR-K05", "F1", "Perfis e presets declarativos validados", "G", "P1", "T3", "média",
     "G1/BUNDLE-01, PRESET-01..03; G4/HOST-02, SDK-06", "P100-012, P100-040", ["PAR-K04"],
     "Composições existem em código (`createSdk`, `createSdkMinimal`, workers homolog/controlado/contínuo); sem perfil nomeado, herança ou persona por sessão.",
     "Perfis nomeados com herança (base, headless, sdk, produção), presets de ferramentas, prompt e skills por sessão, persona composável.",
     "Perfil ou preset sem controle obrigatório é recusado no boot; troca de preset não altera sessão já criada; persona não remove bloqueios.")
card("PAR-K06", "F1", "Agente vivo: steering, cancelamento e espera de ociosidade", "M", "P1", "T3", "média",
     "G1/CORE-01, CORE-02; G4/API-04", "P100-012", ["PAR-K01"],
     "Execução inicia e retoma com checkpoint; não há registro de agentes vivos nem follow-up durante o turno.",
     "Registro de agentes vivos com iniciador, follow-up/steering, cancelamento e espera de ociosidade.",
     "Steering entra no passo seguinte; cancelamento não executa efeito pendente de aprovação; agente de outro tenant não é visível.")
card("PAR-K07", "F1", "Ferramentas paralelas com limite", "M", "P2", "T3", "baixa",
     "G1/CORE-04", "P100-012", ["PAR-K03"],
     "Ferramentas executam em série.",
     "Concorrência limitada para ferramentas marcadas como seguras; ferramentas exclusivas sozinhas e em ordem de chegada.",
     "N ferramentas seguras rodam em paralelo; a exclusiva roda sozinha; o journal registra a ordem real.")
card("PAR-K08", "F1", "Guardas de repetição e timeout cooperativo", "M", "P1", "T3", "alta",
     "G1/GUARD-01..03", "P100-012", ["PAR-K01"],
     "`detectDecisionCycle` detecta ciclo de decisões; timeouts espalhados por pacote, sem política única.",
     "Lembrete consultivo para ferramenta repetida com os mesmos argumentos; timeout cooperativo uniforme por ferramenta.",
     "A quarta chamada idêntica gera lembrete sem bloquear; ferramenta que excede o limite deixa o efeito como incerto, nunca como concluído.")
card("PAR-K09", "F1", "Hooks configuráveis sob controle", "M", "P2", "T3", "média",
     "G1/HOOKS-01", "P100-012", ["PAR-K04"],
     "Pontos de interceptação existem no kernel, mas não são configuráveis por arquivo.",
     "Protocolo de hooks com eventos, matcher e merge; hooks só negam ou anexam contexto; comando externo só por allowlist e aprovação.",
     "Hook nunca altera decisão de controle obrigatório; erro de hook falha fechado; toda negação de hook fica no log.")
card("PAR-X01", "F1", "Serviço único de subprocesso e ambiente do filho", "M", "P0", "T3", "alta",
     "G2/SUB-01..04 (subprocess), G2/SH-06", "P100-023", ["PAR-G01"],
     "`runContained` executa bwrap com timeout e limite de saída; não há serviço único, kill de descendentes comprovado nem allowlist de ambiente.",
     "Serviço de spawn, grupo, kill, wait e dispose usado por shell, MCP stdio, LSP e conversão de documentos; ambiente do filho por allowlist.",
     "Depois de cancel, timeout ou dispose nenhum processo da árvore sobra (verificado em `/proc`); o filho não vê variáveis do host.")
card("PAR-X02", "F1", "Landlock real e relatório honesto de contenção", "G", "P0", "T3", "alta",
     "G2/SBX-03, SBX-07", "P100-024, AUD0611-G02", ["PAR-X01"],
     "`landlock` é inferido de `os.release() >= 5.13`; nenhum ruleset é aplicado; `requireLandlock` não prova nada.",
     "Probe de ABI por syscall e ruleset aplicado no processo filho (helper nativo pequeno); o campo deixa de afirmar suporte só pela versão.",
     "Sem ruleset aplicado, `requireLandlock` falha fechado; teste nativo mostra escrita fora do workspace negada pelo Landlock.")
card("PAR-X03", "F1", "Testes nativos de contenção e limites de recurso", "M", "P0", "T3", "alta",
     "G2/SBX lacunas 3 e 4", "P100-024", ["PAR-X02"],
     "Bubblewrap e allowlist reais, sem prova adversarial nem limites de CPU, memória, pids e disco.",
     "no-new-privs, seccomp e limites (rlimits ou cgroups); suíte nativa de fuga.",
     "Escrita fora, leitura de `/etc/shadow` e `~/.ssh`, rede, symlink e hardlink de fuga e fork bomb são negados em teste nativo.")
card("PAR-X04", "F1", "Enforcement por efeito e política de sandbox por sessão", "M", "P1", "T3", "média",
     "G2/SBX-01, SBX-02, SBX-06", "P100-024", ["PAR-X02"],
     "Modos por ferramenta com `denyModes` e journal; sem fato de enforcement por efeito nem política por sessão persistida.",
     "Modos read-only e workspace-write por sessão ou tenant, persistidos; enforcement de arquivo, rede e processo reportado como fato.",
     "Contenção parcial ou indisponível é recusável pelo chamador; a política da sessão sobrevive a restart.")

# ---------------- F2 — Modelo, sessão e contexto ----------------
card("PAR-M01", "F2", "Streaming no gateway com um resultado terminal", "M", "P0", "T3", "alta",
     "G1/LLM-01", "P100-014", ["PAR-K03"],
     "Providers fixam `stream: false` (`openai-compatible.ts`, `ollama.ts`).",
     "Stream por provider com cancelamento, usage parcial e exatamente um resultado terminal.",
     "Todo stream termina em sucesso, falha ou cancelamento; corte de conexão não grava resposta parcial como final.")
card("PAR-M02", "F2", "Requisição congelada antes do adaptador", "P", "P2", "T3", "baixa",
     "G1/LLM-02", "P100-014", ["PAR-M01"],
     "Gateway valida contratos, mas não congela a requisição montada.",
     "Requisição imutável e reconstruível pelo log antes de chegar ao adaptador.",
     "Adaptador que tenta reescrever a requisição falha em teste; a requisição é reconstruída byte a byte pelo log.")
card("PAR-M03", "F2", "Entrada multimodal de imagem", "M", "P1", "T3", "alta",
     "G2/FS-06; G4/SDK lacuna 4", "P100-014", ["PAR-M01", "PAR-T04"],
     "Gateway e SDK só aceitam texto.",
     "Imagem como entrada do modelo, a partir de anexo verificado, no gateway e no SDK.",
     "Imagem sintética chega ao provider de teste com hash; MIME falso é recusado antes do modelo.")
card("PAR-M05", "F2", "Modelo padrão e seleção por sessão", "P", "P2", "T3", "baixa",
     "G1/CORE-05; G3/SUB-07", "P100-014", ["PAR-K05"],
     "Modelo vem da composição; sem troca em configuração viva.",
     "Modelo padrão alterável em configuração viva e seleção entre opções aprovadas por sessão e por filho.",
     "A troca não afeta execução já iniciada; modelo fora da lista aprovada é recusado.")
card("PAR-S01", "F2", "Persistência pública de sessão entre processos", "G", "P0", "T3", "alta",
     "G1/SESSION-01 (presente) e ownership entre processos", "P100-015, P100-020; SPEC0221 pendente", ["PAR-K03"],
     "Store append-only em PostgreSQL com RLS e catálogo v1 existe; ownership entre processos e transição com writers antigos não existem.",
     "Mesmo log v1 com ownership entre processos, adoção explícita de metadata e recusa de writer antigo.",
     "Dois processos escrevem e leem o mesmo log sem lacuna nem duplicata; writer antigo é recusado; outro tenant não lê nada.")
card("PAR-S02", "F2", "Projeções de sessão com cache", "M", "P1", "T3", "alta",
     "G1/SESSION-04", "P100-020", ["PAR-S01"],
     "Nenhuma projeção de estado atual.",
     "Projeções reconstruídas do log (estado atual, pendências, metas, todos) com cache de checkpoint.",
     "Projeção reconstruída do zero é igual à do cache; cada item cita o evento de origem.")
card("PAR-S03", "F2", "Estatísticas, esboço de turnos e título", "M", "P2", "T3", "média",
     "G1/SESSION-05, SESSION-06", "P100-020", ["PAR-S02"],
     "Ausentes.",
     "Estatísticas da sessão (turnos, passos, tempos de modelo e ferramenta), esboço de turnos e título.",
     "Valores batem com o log em sessão sintética longa; título não usa dado de paciente quando a política proibir.")
card("PAR-S04", "F2", "Fork e retomada de sessão", "M", "P1", "T3", "média",
     "P100-020; G5/CL-02; G3/SUB-03", "P100-020", ["PAR-S01"],
     "Retomada existe por execução; fork não existe.",
     "Fork semeado com turnos concluídos, sem herdar aprovações pendentes.",
     "Fork mantém tenant e linhagem; aprovação pendente do original não vale no fork.")
card("PAR-S05", "F2", "Consulta de sessões com rastreio", "M", "P1", "T3", "alta",
     "G1/QUERY-01, QUERY-02", "P100-020", ["PAR-S01"],
     "Leitura de eventos por stream; sem filtro, cursor, listagem nem rastreio.",
     "Listar, filtrar e ler com cursor; rastrear aprovação → efeito → evento.",
     "Consulta de outro tenant volta vazia ou negada; o rastreio de uma aprovação mostra o efeito e o evento de origem.")
card("PAR-S06", "F2", "Busca textual nas sessões", "G", "P2", "T3", "média",
     "G1/QUERY-03", "P100-020", ["PAR-S05"],
     "Ausente.",
     "Busca ranqueada (PostgreSQL full-text) com política de acesso e retenção.",
     "Busca respeita tenant e papel; conteúdo retido além do prazo não aparece.")
card("PAR-S07", "F2", "Formatos novos e export/import versionado", "M", "P2", "T3", "média",
     "G1/SESSION-03 e lacuna 6", "P100-020", ["PAR-S02"],
     "Só o formato v1 é real; migrações v2/v3 são sintéticas.",
     "Cadeia de migração adjacente e export/import JSONL interoperável; PostgreSQL continua fonte de verdade (ADR-011).",
     "Exportar e importar reproduz as mesmas projeções; o original nunca é reescrito.")
card("PAR-C01", "F2", "Compactação por modelo sob pressão", "M", "P1", "T3", "alta",
     "G1/COMP-01", "P100-021", ["PAR-M01", "PAR-K03"],
     "Resumo heurístico de até 512 caracteres e estimativa de 4 caracteres por token.",
     "Condensação com requisição de modelo sob pressão de tokens, nova tentativa após overflow, preservando fatos, obrigações e aprovações.",
     "Aprovação pendente e obrigação aberta sobrevivem à compactação (teste por fato); overflow não chega ao provider sem compactar antes; compactação cancelada não grava resumo.")
card("PAR-C02", "F2", "Pressão de tokens antes do dispatch", "P", "P1", "T3", "média",
     "G1/COMP lacuna 2; AUD0611 dimensão de modelo", "P100-021", ["PAR-M01"],
     "Medidor agrega usage de chamadas bem-sucedidas.",
     "Pressão calculada antes de cada chamada, com usage por tentativa, inclusive falhas.",
     "A projeção de pressão bate com o usage reconstruído do log.")
card("PAR-C03", "F2", "Spill de saídas grandes e poda de resultados", "M", "P1", "T3", "alta",
     "G1/SPILL-01, SPILL-02, COMP-03; G2/SH-04", "P100-021; SPEC0224", ["PAR-S01"],
     "Saídas truncadas em 1 MiB sem arquivo de continuação; spill só proposto na SPEC0224.",
     "Armazenamento de texto grande com localizador opaco, prévia de cabeça e cauda e poda de resultado de ferramenta.",
     "O modelo recebe localizador e prévia com aviso de corte; falha de gravação nunca descarta conteúdo em silêncio.")
card("PAR-C04", "F2", "Descarregamento de imagens antigas", "M", "P2", "T3", "média",
     "G1/COMP-04", "P100-021", ["PAR-C03", "PAR-M03"],
     "Ausente.",
     "Imagens antigas trocadas por texto com caminho de leitura, sem gastar retry do provider.",
     "Depois do offload a imagem continua recuperável pelo localizador; o contexto cai abaixo do limite.")
card("PAR-D01", "F2", "Storage de domínio tipado sobre PostgreSQL", "M", "P2", "T3", "média",
     "G1/STOR-01", "P100-015", ["PAR-S01"],
     "Repositórios PostgreSQL específicos; sem API de domínio chave-valor tipada.",
     "Domínios chave-valor com schema validado, herdando tenant e RLS.",
     "Um tenant não lê domínio de outro; escrita só resolve depois de durável.")

# ---------------- F3 — Ferramentas, eventos e SDK ----------------
card("PAR-T01", "F3", "Arquivos: leitura antes de editar, faixas e replace_all", "M", "P1", "T3", "média",
     "G2/FS-04, FS-05", "P100-022", ["PAR-K03"],
     "`fs.read/write/edit/list` com confinamento e escrita atômica; sem prova de leitura prévia, faixa de linhas ou `replace_all`.",
     "Política read-before-edit com guarda de versão; leitura por faixa com truncamento informado; `replace_all`.",
     "Edição de arquivo não lido ou alterado depois da leitura é negada e registrada.")
card("PAR-T02", "F3", "glob e grep contidos", "M", "P2", "T3", "média",
     "G2/FS-07", "P100-022", ["PAR-X01"],
     "Ausentes.",
     "Busca por padrão e conteúdo dentro do workspace, com limites de tempo e de resultado.",
     "Caminho fora do workspace e symlink de fuga são recusados; regex patológica termina pelo limite.")
card("PAR-T04", "F3", "Anexos com verificação e retenção", "M", "P1", "T3", "alta",
     "G2/ATT-01..03; G5/WEB-03", "P100-022", ["PAR-S01"],
     "Mídia de exame só no egress do canal; não existe anexo ligado ao modelo.",
     "Anexo por tenant e sessão com hash, MIME verificado, tamanho, retenção e reenvio ao modelo; upload com limites.",
     "Anexo com MIME falso é recusado; a política de retenção apaga o anexo; o replay reconstrói a referência.")
card("PAR-T05", "F3", "Entregáveis com aprovação e resumo de mudanças", "M", "P1", "T3", "alta",
     "G2/DLV-01..03", "P100-022", ["PAR-T01"],
     "`fs.write` grava intenção e journal; sem evento de entrega nem resumo por turno.",
     "Ferramenta de apresentação de arquivos finais com aprovação para entrega externa; resumo de mudanças por turno a partir do journal.",
     "Nenhum arquivo sai do workspace sem evento de entrega aprovado; o resumo lista só caminhos registrados.")
card("PAR-T06", "F3", "Conversão de Office para PDF contida", "G", "P2", "T3", "média",
     "G2/DOC-01..03", "P100-022", ["PAR-X03"],
     "Ausente.",
     "Conversão em processo contido, sem rede, com fila limitada, cache e timeout.",
     "Documento hostil (zip bomb, macro) é recusado ou convertido sem efeito fora do workspace; cancelar não deixa processo.")
card("PAR-T07", "F3", "Skills com origem, hash e catálogo", "M", "P1", "T3", "alta",
     "G2/SKL-01..03", "P100-022", ["PAR-K05"],
     "Registry e loader de skills com `requiredTools`; uma skill (`exam-intake`).",
     "Descoberta por origem com precedência, hash aprovado, observação de mudanças e ferramenta de catálogo para o modelo.",
     "Skill que exige ferramenta fora do grant falha ao carregar; skill sem hash aprovado não entra no catálogo.")
card("PAR-T09", "F3", "Registro de workspaces e sessões por tenant", "P", "P2", "T3", "média",
     "G2/WS-01, WS-02", "P100-022", ["PAR-S05"],
     "Workspace por tenant resolvido por caminho; sem registro de projetos.",
     "Projetos nomeados (unidade, turno) com sessões agrupadas; esconder sem apagar.",
     "Esconder não apaga evidência; listagem só do tenant.")
card("PAR-T11", "F3", "Perguntar ao humano com pausa e retomada", "M", "P1", "T3", "alta",
     "G5/INT-03", "P100-041", ["PAR-K03"],
     "Decisão `ASK_USER` existe no contrato v2; sem ferramenta nem fluxo de resposta.",
     "Ferramenta `ask_user` com schema validado, pausa do turno e resposta única pelo console ou canal.",
     "Segunda resposta é rejeitada; sem respondedor, a ação sensível fica negada; o turno retoma depois da resposta.")
card("PAR-T12", "F3", "Web fetch e search com proteção SSRF", "M", "P2", "T3", "média",
     "G2/WEB-01, 02, 04, 05, 06", "P100-031", ["PAR-X01"],
     "Guarda SSRF com DNS fixado só no egress de exames.",
     "Serviço web com fetch e search, provider explícito, guarda SSRF reaproveitada e marca de conteúdo não institucional.",
     "Rebind, redirect para IP privado, resposta acima do limite e host fora da allowlist falham fechado; resultado marcado como não institucional.")
card("PAR-A01", "F3", "Stream de eventos na API com cursor", "G", "P0", "T3", "alta",
     "G4/API-02, API-03; G5/WEB-01", "P100-040, P100-041", ["PAR-S01", "PAR-M01"],
     "API só tem request/response e leitura paginada por `afterSequence`; nenhum SSE ou WebSocket.",
     "Canal de eventos por sessão (SSE ou WebSocket) com cursor de retomada, cancelamento, backpressure e RLS.",
     "Dois tenants assinando ao mesmo tempo não veem eventos um do outro; queda e reconexão não perdem nem duplicam evento.")
card("PAR-A02", "F3", "Controle ao vivo de turno e sessão pela API", "M", "P1", "T3", "alta",
     "G4/API-04", "P100-040", ["PAR-K06", "PAR-A01"],
     "Comandos de execução, entrada e takeover existem; sem pausa, retomada ou troca de modo por turno.",
     "Pausar, retomar, cancelar e trocar modo ou modelo de um turno sem baixar controles.",
     "Operador sem papel recebe 403; pausa preserva pendências e a retomada drena sem duplicar.")
card("PAR-A03", "F3", "Contrato de API gerado e cliente tipado", "M", "P2", "T2", "média",
     "G4/API-01", "P100-040", ["PAR-A01"],
     "Rotas Fastify com validação por rota; sem descritor gerado.",
     "Descritores gerados a partir das rotas e cliente tipado derivado.",
     "Mudança de rota sem regenerar o contrato quebra o CI.")
card("PAR-A05", "F3", "Notificações push no SDK", "M", "P1", "T3", "alta",
     "G4/SDK-01", "P100-025", ["PAR-A01"],
     "SDK v1 com quatro métodos e polling de `session.events`.",
     "Notificações `session.event`, `session.status` e término de filho, com assinatura por sessão e backpressure.",
     "Perda ou duplicação de notificação é detectada pelo cursor; versão incompatível é recusada.")
card("PAR-A06", "F3", "Cliente de alto nível e prompt multimodal no SDK", "M", "P2", "T3", "média",
     "G4/SDK-02, SDK-04", "P100-025", ["PAR-A05", "PAR-M03"],
     "Clientes TS e Python de baixo nível.",
     "Operação `run` (envia, espera ociosidade, devolve última resposta e motivo de parada) em TS e Python, com imagem.",
     "TS e Python produzem o mesmo transcript para o mesmo cenário.")
card("PAR-A07", "F3", "Pedidos do servidor ao cliente no SDK", "M", "P2", "T3", "média",
     "G4/SDK-05", "P100-025", ["PAR-T11", "PAR-A05"],
     "Aprovação só por `/v1/approvals`.",
     "Pedidos iniciados pelo servidor (aprovação, entrada) respondidos pelo cliente, ligados ao operador autenticado.",
     "Resposta de cliente sem identidade válida é negada; aprovação vale uma única vez.")
card("PAR-A08", "F3", "SDK Python completo e pacote verificável", "M", "P2", "T3", "baixa",
     "G4/SDK-04, SDK-07, DST-03", "P100-025", ["PAR-A06"],
     "Cliente stdlib experimental (CPython 3.12.3, Linux), quatro RPCs, distribuído por cópia de fonte.",
     "Paridade de superfície com o cliente TS e wheel verificável com matriz de versões.",
     "Wheel instala num ambiente limpo e passa a suíte de cenários; hash publicado com a candidata.",
     estado="IN_PROGRESS")
card("PAR-A09", "F3", "Suíte de cenários equivalentes do SDK", "M", "P1", "T2", "média",
     "G4/SDK-08", "P100-025, P100-004", ["PAR-A05", "PAR-Q02"],
     "Interop TS↔Python testada; sem cenários equivalentes aos da referência.",
     "Cenários multi-turn, ferramenta com aprovação, cancelamento, EOF e shutdown comparados com a referência.",
     "Cada cenário passa pelo comparador diferencial nos dois motores.")
card("PAR-P01", "F3", "MCP governado (stdio e HTTP)", "G", "P1", "T3", "média",
     "G2/MCP-01..06", "P100-030", ["PAR-X02", "PAR-T12"],
     "Só o tipo de origem `mcp` no registry de capabilities; nenhum cliente.",
     "Cliente MCP como adaptador de capabilities: allowlist de servidores por tenant, credencial por servidor, classificação de efeito obrigatória, validação de schema, recursos e instruções limitadas.",
     "Ferramenta externa só executa pelo pipeline (policy, aprovação, journal); servidor desconhecido, schema hostil e timeout são recusados; processo stdio morre no dispose.")

# ---------------- F4 — Orquestração ----------------
card("PAR-O01", "F4", "Subagentes com herança estrita de autoridade", "G", "P1", "T3", "média",
     "G3/SUB-01, 02, 03, 05, 08", "P100-033", ["PAR-K06", "PAR-S04"],
     "Nenhum mecanismo de delegação; orçamentos existem no loop iterativo.",
     "Registro de subagentes e driver no mesmo kernel (spawn e fork); filho recebe subconjunto de ferramentas, orçamento e tenant; linhagem no audit.",
     "Filho nunca executa ferramenta fora do grant do pai; falha do filho volta como erro; linhagem correta na auditoria.")
card("PAR-O02", "F4", "Filhos continuáveis com mailbox durável", "G", "P2", "T3", "média",
     "G3/SUB-04", "P100-033", ["PAR-O01"],
     "Ausente.",
     "Enviar mensagem, interromper e listar filhos, com mailbox em PostgreSQL e retomada.",
     "Restart retoma a mensagem sem entregar duas vezes; filho de outro tenant não é endereçável.")
card("PAR-O03", "F4", "Jobs de agente em segundo plano", "G", "P1", "T3", "alta",
     "G3/JSW-01..03", "P100-037", ["PAR-S01", "PAR-A01"],
     "Fila do worker e outbox durável; sem job por agente com dono.",
     "Iniciar, listar, ler saída e encerrar jobs com posse por sessão; aviso de conclusão que acorda o agente com teto.",
     "Crash, retry e duplicata não criam efeito extra; só o dono lê ou encerra o job.")
card("PAR-O04", "F4", "Agendamento persistente com entrega idempotente", "G", "P1", "T3", "alta",
     "G3/JSW-04..06, JSW-09", "P100-037", ["PAR-O03"],
     "Só varredura periódica de aprovações expiradas.",
     "Lembretes únicos, por intervalo, diários, semanais e cron com fuso IANA, entregues na sessão original; gestão e registro de entregas.",
     "Tick perdido entrega uma ocorrência; recorrente entrega só a última perdida; agenda clínica real nunca é alterada automaticamente.")
card("PAR-O05", "F4", "Webhooks genéricos com regras confiáveis", "M", "P1", "T3", "alta",
     "G3/JSW-07, JSW-08", "P100-037", ["PAR-O03"],
     "Webhooks de canal assinados (Chatwoot, Evolution); sem registro genérico de regras.",
     "Regra confiável registrada transforma evento externo em nova sessão ou tarefa pelo mesmo pipeline.",
     "Assinatura inválida, replay e tenant errado são recusados; resposta 202 sem esperar o turno.")
card("PAR-O06", "F4", "Workflow durável", "G", "P2", "T3", "média",
     "G3/WF-01..04", "P100-035", ["PAR-O01", "PAR-O03"],
     "Loop iterativo com checkpoint por passo; sem coordenação de filhos.",
     "Workflow com agentes, paralelo, pipeline e fases, checkpoints e execução em segundo plano; a forma (script do modelo ou definição declarativa) sai da decisão D4.",
     "Workflow interrompido retoma do checkpoint; reexecução mantém um efeito; cancelamento vira erro, nunca sucesso parcial.")
card("PAR-O08", "F4", "Goal durável por sessão", "G", "P2", "T3", "média",
     "G3/GPT-01..04", "P100-036", ["PAR-S02"],
     "Objetivo existe só dentro do run.",
     "Goal persistido com compare-and-set, ferramentas de leitura e atualização, driver de rodadas com limite e comandos de operador.",
     "Corridas de pausa, parada e rodada preservam a intenção; goal encerrado não reabre; goal nunca concede autorização.")
card("PAR-O09", "F4", "Modo de planejamento e todos da sessão", "M", "P2", "T3", "média",
     "G3/GPT-05..07; G5/INT-06", "P100-036", ["PAR-S02", "PAR-T11"],
     "Aprovação e handoff cobrem revisão humana; sem modo de plano nem todos.",
     "Plano revisável aprovado antes de efeitos; lista de todos por sessão com posse e projeção.",
     "Aprovar o plano não aprova efeito; todos são dado não autoritativo.")
card("PAR-O10", "F4", "PTC: programas do modelo em Node contido", "G", "P2", "T3", "baixa",
     "G3/PTC-01, 02, 04, 05, 06", "P100-034", ["PAR-X03", "PAR-K03"],
     "Ausente; `shell.run` só executa argv puro.",
     "Execução de programa escrito pelo modelo em processo contido, com bindings para as ferramentas registradas e taxonomia de falhas.",
     "Programa com N subchamadas gera N entradas de audit e journal; loop, escape e saída excessiva são negados e o processo termina.")
card("PAR-T10", "F4", "Shell com jobs em segundo plano e relatório de negação", "M", "P2", "T3", "média",
     "G2/SH-03, SH-05", "P100-023", ["PAR-X01", "PAR-O03"],
     "Timeout mata o comando (máx. 120 s); sem background.",
     "Comando longo vira job com id, dono, saída e kill; negações de política reportadas como fato.",
     "Job de outro tenant não é legível; cancelar mata o grupo inteiro.")
card("PAR-A04", "F4", "Controlador de jobs observáveis na API", "M", "P2", "T3", "média",
     "G4/API-07 (jobs)", "P100-040", ["PAR-O03", "PAR-A01"],
     "Jobs de worker sem superfície de cliente.",
     "Progresso e saída de jobs por stream na API.",
     "Somente o dono acompanha; reconexão retoma a saída do ponto certo.")

# ---------------- F5 — Console, operação e interação hospitalar ----------------
card("PAR-H01", "F5", "CLI de operação", "M", "P1", "T2", "média",
     "G4/HOST-01, 03, 05; G1/BUNDLE-02", "P100-040", ["PAR-K05"],
     "Entrada só por `apps/api` e `apps/worker` com variáveis de ambiente.",
     "Comando `cvg` com api, worker, migrate, doctor, dump de configuração e execução headless de uma tarefa.",
     "`cvg doctor` e o dump rodam sem rede e sem segredo na saída; ação sensível em headless vira handoff.")
card("PAR-H02", "F5", "Configuração tipada com dump e catálogo", "M", "P1", "T3", "alta",
     "G4/HOST-04", "P100-040", ["PAR-K05"],
     "Variáveis documentadas em `.env.example`, sem schema exportável.",
     "Schema único de configuração, validação no boot, dump da configuração efetiva sem segredos e catálogo gerado.",
     "Configuração inválida falha com uma mensagem única; o dump nunca contém valor de segredo.")
card("PAR-H03", "F5", "Credenciais por referência e autorização humana", "G", "P1", "T3", "alta",
     "G4/HOST-09, HOST-10", "P100-040", ["PAR-H02"],
     "Segredos por arquivo com rotação documentada; sem serviço de credenciais.",
     "Configuração guarda só o nome; valor no cofre; rotação vale na chamada seguinte; fluxo de autorização humana para credencial de provider ou canal.",
     "Rotação sem reinício vale na próxima chamada; segredo não aparece em log, dump ou erro.")
card("PAR-H04", "F5", "Configurações por formulário e gestão de plugins", "G", "P2", "T3", "média",
     "G4/HOST-06, HOST-08; G5/CL-09, CL-10; G3/EXT-05", "P100-040, P100-012", ["PAR-H02", "PAR-K04"],
     "Versões de agente, catálogo de plugins e aprovação de capability existem; sem edição por schema nem inventário carregado.",
     "Formulário derivado do schema com revisão; inventário somente leitura do que está carregado; instalar e remover plugin revisado com aprovação.",
     "Plugin não revisado não instala; plugin nunca libera o que um controle negou.")
card("PAR-U01", "F5", "Console: chat ao vivo", "G", "P1", "T3", "alta",
     "G5/CL-01", "P100-041", ["PAR-A01", "PAR-T04", "PAR-A02"],
     "Console lista conversas e mostra timeline somente leitura.",
     "Composer, anexos, estado do turno em tempo real e feedback por mensagem.",
     "Console nunca marca sucesso sem evento do motor; mensagem enviada passa pelo pipeline como qualquer entrada.")
card("PAR-U02", "F5", "Console: sessões, fork e trajetória", "M", "P1", "T3", "alta",
     "G5/CL-02, CL-03", "P100-041", ["PAR-S04", "PAR-S05", "PAR-U01"],
     "Trace de execução e auditoria em telas separadas.",
     "Navegação por sessões, fork, histórico e trajetória por turno.",
     "Cada passo exibido liga ao evento do log; sessão de outro tenant não aparece.")
card("PAR-U03", "F5", "Console: planos, goals, jobs, agenda e subagentes", "G", "P2", "T3", "média",
     "G5/CL-03, CL-04, CL-05", "P100-041", ["PAR-O04", "PAR-O08", "PAR-O09", "PAR-O01", "PAR-U01"],
     "Lista de tarefas operacionais.",
     "Painéis de plano, goal e todos, jobs com saída ao vivo, agenda e lembretes, subagentes e workflow.",
     "Aprovar plano na UI não aprova efeito; reenvio não duplica job.")
card("PAR-U04", "F5", "Console: entregáveis e preview seguro", "G", "P1", "T3", "alta",
     "G5/CL-08", "P100-041", ["PAR-T05", "PAR-T06", "PAR-U01"],
     "Ausente.",
     "Cartão de arquivos alterados, diff e preview de PDF, imagem e Markdown; Office e HTML em origem isolada.",
     "HTML ativo não executa na origem do console; documento só leitura.")
card("PAR-U05", "F5", "Comandos, atalhos e gatilhos", "M", "P2", "T3", "média",
     "G5/CL-11, INT-05", "P100-041", ["PAR-U01"],
     "Comandos só no produto (WhatsApp).",
     "Registro de comandos no núcleo sem ida ao modelo; `/` e `@` no console; tabela de atalhos.",
     "Comando com efeito passa por policy e aprovação como qualquer ação.")
card("PAR-U06", "F5", "Console: i18n, tema, acessibilidade e reconexão", "M", "P2", "T2", "média",
     "G5/CL-12", "P100-041", ["PAR-U01"],
     "pt-BR fixo e marcações ARIA básicas.",
     "Camada de i18n (pt-BR e en), tema, navegação por teclado auditada e reconexão.",
     "Jornadas principais completas só com teclado; queda de rede reconecta sem perder estado.")
card("PAR-U07", "F5", "Presets de permissão", "M", "P2", "T3", "média",
     "G5/INT-04", "P100-041", ["PAR-X04", "PAR-K05"],
     "Policy e policy-engine sem seletor.",
     "Presets de sandbox e política de aprovação como contrato público e seletor no console.",
     "Nenhum preset relaxa controle obrigatório.")
card("PAR-I01", "F5", "Voz e transcrição revisável", "G", "P1", "T3/T4", "alta",
     "G5/VOZ-01..06", "P100-044", ["PAR-K04", "PAR-U01"],
     "Transcritor Whisper só dentro do produto de plantão.",
     "Contrato de transcrição no núcleo com cancelamento e retenção; provider local com assets aprovados; UI de gravação com texto editável; áudio de canal transcrito com marca.",
     "Baixa confiança gera revisão humana; transcrição nunca vira registro definitivo sem aprovação.")
card("PAR-I02", "F5", "Feedback por mensagem e por sessão", "M", "P1", "T3", "alta",
     "G4/OBS-01, OBS-02", "P100-046", ["PAR-S01"],
     "Ausente.",
     "Nota, categoria e observação por mensagem e por sessão, por tenant, fora do contexto do modelo; exposto em API e SDK.",
     "Feedback não entra no histórico do modelo; observação respeita limite e redação.")
card("PAR-I03", "F5", "Inspetor de runtime autenticado", "M", "P2", "T3", "média",
     "G3/INS-01, INS-02, EXT-03; G4/OBS lacuna 4", "P100-046, P100-045", ["PAR-S05"],
     "Trajetória e traces administrativos existem; sem inspetor do registro do kernel.",
     "Inspeção somente leitura de serviços, hooks, ferramentas e eventos por correlação, para operador autenticado.",
     "Falha reconstruída por correlationId sem payload sensível; acesso sem credencial é recusado.")
card("PAR-I04", "F5", "Invariantes de runtime por pacote", "M", "P2", "T2", "média",
     "G4/OBS-05", "P100-046", ["PAR-K04"],
     "Verificações de cadeia e preflights isolados.",
     "Registro de invariantes por pacote com chave global, filtro e falha atribuída ao dono.",
     "Invariante violada aponta o pacote dono; desligada não custa nada no caminho quente.")

# ---------------- F6 — Cauda integral (escopo a decidir em D2) ----------------
card("PAR-P02", "F6", "LSP somente leitura", "M", "P3", "T3", "baixa",
     "G2/LSP-01..03", "P100-032", ["PAR-X01"],
     "Ausente.", "Serviço LSP por extensão e ferramenta com quatro consultas somente leitura.",
     "Arquivo fora do workspace, timeout e EOF do servidor recusados; subprocesso encerra no dispose.")
card("PAR-P03", "F6", "Perfil ACP por stdio", "G", "P3", "T3", "baixa",
     "G2/ACP-01..04; G1/BUNDLE-03", "P100-026", ["PAR-A05", "PAR-P01"],
     "Ausente.", "Servidor ACP sobre o mesmo contrato de sessão: criar, listar, retomar, prompt, cancelar, MCP por sessão.",
     "Sessão ACP herda tenant e grants; cancelamento não duplica efeito; MCP não aprovado é recusado.")
card("PAR-P04", "F6", "Execução remota por SSH", "GG", "P3", "T3/T4", "baixa",
     "G2/SSH-01..04", "P100-026", ["PAR-X04", "PAR-P03"],
     "Ausente.", "Carrier remoto com helper verificado, fs e subprocesso remotos e sandbox remoto.",
     "Fixture remota controlada passa; desconexão e retry não duplicam efeito; remoto real só com gate T4.")
card("PAR-P05", "F6", "Protocolo remoto tipado por decorador", "GG", "P3", "T3", "nenhuma",
     "G1/TYP-01, TYP-02", "P100-025", ["PAR-A03"],
     "Ausente; o CVG expõe contratos versionados.", "Exposição de métodos do host por decorador e gerador de tipos.",
     "Método sem autorização explícita não é exposto.")
card("PAR-T14", "F6", "Terminais PTY persistentes", "G", "P3", "T3", "baixa",
     "G2/TRM-01..04", "P100-023", ["PAR-X03", "PAR-T10"],
     "Ausente.", "Seis ferramentas de terminal (abrir, enviar, ler, fechar, listar, sinalizar) com PTY dentro da contenção.",
     "Terminal só responde ao dono exato; encerrar a sessão mata todos os descendentes; `send` repetido não repete efeito.")
card("PAR-T15", "F6", "PowerShell", "M", "P3", "T3", "nenhuma",
     "G2/SH-08", "P100-023", ["PAR-T10"],
     "Ausente.", "Executor PowerShell local, contido e persistente.", "Mesma suíte de contenção do bash passa.")
card("PAR-U08", "F6", "Console: terminal e árvore de arquivos", "G", "P3", "T3", "baixa",
     "G5/CL-06, CL-07", "P100-041", ["PAR-T14", "PAR-U01"],
     "Ausente.", "Abas de terminal recuperáveis e árvore de arquivos com seletor de diretório.",
     "Somente papéis administrativos acessam; nada fora do workspace do tenant.")
card("PAR-U09", "F6", "Aplicativo desktop", "GG", "P3", "T3/T4", "baixa",
     "G5/DK-01..07", "P100-042", ["PAR-U01"],
     "Ausente.", "Shell desktop com host local, seletor nativo, deep links, instalador e atualização.",
     "Jornadas do desktop iguais às do Web numa plataforma suportada; preload sem API genérica de execução.")
card("PAR-I07", "F6", "Browser use", "G", "P3", "T3/T4", "baixa",
     "G5/BRW-01..06", "P100-043", ["PAR-P01", "PAR-X03"],
     "Ausente.", "Provider único por sessão (Playwright via MCP, DevTools, Stagehand) com allowlist de destinos.",
     "Jornada em site sintético; destino fora da allowlist negado; submit exige aprovação; fechar a sessão encerra o browser.")
card("PAR-I08", "F6", "Computer use", "G", "P3", "T3/T4", "nenhuma",
     "G5/CMP-01..04", "P100-043", ["PAR-I07"],
     "Ausente.", "Provider de desktop em VM descartável, com screenshots sob retenção.",
     "Jornada em app sintético numa VM isolada com aprovação por ação e kill.")
card("PAR-O11", "F6", "Subagentes por providers externos", "G", "P3", "T3/T4", "baixa",
     "G3/SUB-06", "P100-033", ["PAR-O02", "PAR-P03"],
     "Ausente.", "Filhos via ACP, SDK, Codex e Claude Code em processo isolado, sem credenciais do pai.",
     "Filho externo nunca recebe credencial do pai; falha volta como erro.")
card("PAR-O12", "F6", "PTC em Python", "M", "P3", "T3", "baixa",
     "G3/PTC-03", "P100-034", ["PAR-O10"],
     "Ausente.", "Backend Python do PTC com protocolo de descritor e limites.", "Mesma suíte de falhas do PTC Node passa.")
card("PAR-O13", "F6", "Agent Teams com mailbox e quadro de tarefas", "G", "P3", "T3", "baixa",
     "G3/AT-01..07", "P100-038", ["PAR-O02", "PAR-O06"],
     "Ausente.", "Roster com limite, mailbox durável, quadro de tarefas com DAG e versão otimista, ferramentas, perfil e UI.",
     "Mensagens e DAG sobrevivem a restart; duplicata não executa duas vezes; conflito de versão é explícito.")
card("PAR-O07", "F6", "Loop Ralph", "M", "P3", "T3", "baixa",
     "G3/WF-05, WF-06", "P100-035", ["PAR-O06"],
     "Loop iterativo do kernel sem filhos frescos.", "Rodadas de filho novo sobre objetivo imutável, com relatório limitado e `maxRounds`.",
     "Relatório inválido encerra a rodada com erro; o limite de rodadas é respeitado.")
card("PAR-E01", "F6", "Extensões dinâmicas host e cliente", "G", "P3", "T3", "baixa",
     "G3/EXT-01, EXT-02, EXT-04", "P100-045", ["PAR-K04", "PAR-H04"],
     "Divergência deliberada pela ADR-011 (código de plugin gerado em runtime).",
     "Definições dinâmicas com grant, capabilities declaradas e controles fora do alcance; painel de gestão.",
     "Extensão nunca registra controle nem executa sem grant; unload de controle negado.")
card("PAR-E02", "F6", "Guest em Web Worker", "G", "P3", "T3", "nenhuma",
     "G3/WW-01..03", "P100-045", ["PAR-K05", "PAR-U01"],
     "Ausente.", "Empacotador de imagem VFS e runtime de plugins num Web Worker com túnel HTTP.",
     "Jornadas mapeadas iguais entre guest e host; CSP e limites testados.")
card("PAR-K10", "F6", "Pontes de hooks do Claude Code e do Codex", "M", "P3", "T3", "baixa",
     "G1/HOOKS-02, HOOKS-03", "P100-012", ["PAR-K09"],
     "Ausente.", "Execução de configurações de hooks de outras ferramentas sob o protocolo do PAR-K09.",
     "Comando não revisado não roda; ponte nunca altera controle obrigatório.")
card("PAR-I09", "F6", "Telemetria de produto e identidade anônima", "P", "P3", "T4", "nenhuma",
     "G1/IDENT-01, 02; G4/OBS-04, OBS-06", "P100-046, P100-040", ["PAR-H02"],
     "Ausente; o CVG usa operador identificado.", "Identificador de instalação e telemetria de produto com consentimento.",
     "Nada sai do ambiente sem autorização; identificador não deriva de dado pessoal.")
card("PAR-I05", "F6", "Exportação de log de sessão por OTEL", "M", "P3", "T4", "baixa",
     "G4/OBS-03; G1 session-telemetry", "P100-046", ["PAR-S01"],
     "Adaptador OTEL de spans e métricas com redação.", "Canal de log de sessão com fila limitada, retry e shutdown com deadline.",
     "Exporter fora do ar não altera o turno; nada sai sem redação.")
card("PAR-I06", "F6", "Revisor automático consultivo", "P", "P3", "T3", "baixa",
     "G3/AR-01..03", "P100-046", ["PAR-K04"],
     "Divergência: no CVG ação sensível exige humano.", "Revisor por modelo que só pode rebaixar para aprovação humana.",
     "O revisor nunca converte \"requer aprovação\" em \"permitido\".")
card("PAR-D02", "F6", "Backends JSON e SQLite", "G", "P3", "T3", "baixa",
     "G1/STOR-02, STOR-03", "P100-015", ["PAR-D01"],
     "Só PostgreSQL, por decisão da ADR-011.", "Backends JSON e SQLite com a mesma suíte de conformidade.",
     "A suíte única passa nos três backends; não há dual-write silencioso.")
card("PAR-M04", "F6", "Provider DeepSeek e campos de extensão", "M", "P3", "T4", "baixa",
     "G1/LLM-04, LLM-05", "P100-014", ["PAR-M01", "PAR-H03"],
     "Providers OpenAI-compatível, Ollama e determinístico.", "Adaptador DeepSeek com chave por referência e campos de extensão.",
     "Sem chave falha fechado; provider real só com gate T4.")
card("PAR-T13", "F6", "Providers de busca web", "M", "P3", "T4", "baixa",
     "G2/WEB-03", "P100-031", ["PAR-T12", "PAR-H03"],
     "Ausente.", "Exa, Perplexity e DeepSeek atrás do seam web.", "Provider ambíguo é erro; provider real só com gate T4.")
card("PAR-T08", "F6", "Skills de Office e relatório de dependências", "M", "P3", "T3", "baixa",
     "G2/SKL-04, SKL-05", "P100-022", ["PAR-T07", "PAR-T06"],
     "Ausente.", "Pacote de skills de Word, PowerPoint e Excel com checagens; relatório de interpretadores.",
     "Skill carrega só com as ferramentas do grant.")
card("PAR-T03", "F6", "Editor str_replace", "P", "P3", "T3", "nenhuma",
     "G2/FS-08", "P100-022", ["PAR-T01"],
     "Redundante com `fs.edit`.", "Ferramenta view, create, str_replace e insert.", "Mesma política de leitura antes de editar.")
card("PAR-C05", "F6", "Compactação manual", "P", "P3", "T3", "baixa",
     "G1/COMP-02", "P100-021", ["PAR-C01"],
     "Sem comando manual.", "Compactação manual por rota e comando, com poda opcional.", "Compactação manual cancelada não grava resumo.")
card("PAR-C06", "F6", "Instruções de workspace e referências a arquivos", "M", "P3", "T3", "baixa",
     "G1/CTX-01..03", "P100-021", ["PAR-T09"],
     "Ausente.", "Instruções de origem aprovada no runtime e menções `@arquivo` e `@sessão`.",
     "Instrução de origem não aprovada não entra no prompt; nada fora do workspace é listado.")
card("PAR-Q10", "F6", "Executável e distribuição por plataforma", "G", "P3", "T4", "nenhuma",
     "G4/DST-02, SDK-07", "P100-052", ["PAR-Q08"],
     "Entrega é imagem de contêiner.", "Executável autônomo com sidecars e wheels por plataforma.",
     "Instalação limpa por plataforma suportada passa o smoke.")

# ---------------- F7 — Prova e aceite ----------------
card("PAR-Q06", "F7", "Gates de paridade no CI", "M", "P0", "T2", "alta",
     "P100-050; G4/TST-07", "P100-050, PDSH-033", ["PAR-Q05", "PAR-Q02"],
     "Gates fortes de E2E, mutação e cobertura por arquivo; sem gate de snapshot por superfície nem de paridade.",
     "Snapshot por superfície (SDK, sessão, API, web), diferenciais e medidor como checks obrigatórios.",
     "Regressão de capacidade já aprovada derruba o CI.")
card("PAR-Q07", "F7", "Recuperação, concorrência e performance", "G", "P0", "T3", "alta",
     "P100-051", "P100-051", ["PAR-Q06"],
     "Provas de restore e pausa existem para o núcleo atual.",
     "Restart, replay, cancelamento, duplicata, crash no efeito, troca de tenant e carga em todas as famílias aprovadas.",
     "Cada família tem caso negativo de recuperação passando na candidata.")
card("PAR-Q08", "F7", "Candidata reproduzível com SBOM e assinatura", "M", "P1", "T4", "média",
     "G4/DST-01, DST-04, DST-06", "P100-052", ["PAR-K02"],
     "SBOM, licenças e registro de imagem existem; sem assinatura nem instalação limpa comprovada.",
     "Instalação limpa sem fonte nem legado, hash e assinatura ligados ao SBOM.",
     "Imagem ou pacote sintético instala num diretório limpo e passa o smoke.")
card("PAR-Q09", "F7", "Auditoria independente e aceite de 100%", "M", "P0", "T4", "alta",
     "P100-053", "P100-053", ["PAR-Q07", "PAR-Q08"],
     "Sem auditoria de paridade.",
     "Auditoria que reexecuta amostra crítica e negativos de cada família e confere o catálogo inteiro.",
     "Medidor marca 100% PASS_CURRENT no escopo decidido, sem exceção funcional aberta; sem auditoria o estado é AUDIT_PENDING.")
