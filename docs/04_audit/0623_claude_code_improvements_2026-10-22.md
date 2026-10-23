# 0623 — Melhorias do Claude Code para incorporar ao harness — 22/10/2026

**A inspeção com REA identificou nove melhorias incorporáveis, com evidência e pontos de integração no código atual.** O maior ganho imediato está em inspecionar skills/plugins e seu custo de contexto; a fundação de runtime deve continuar pela continuidade de sessões, configuração reproduzível, streaming e orçamento compartilhado. Reusar o kernel, os gateways, a persistência e as carteiras existentes.

Entrega desta rodada: investigação executada, comparação entre versões, prova local de comportamento, matriz de incorporação e contrato concreto proposto para a primeira fatia. **Não houve implementação no runtime**, alteração de contratos públicos, publicação, deploy ou concessão de paridade/release. As propostas continuam sujeitas às dependências e gates dos cartões C100/PAR.

## Identidade e método

- Alvo: executável instalado Claude Code **2.1.308**, ELF x86-64, `/home/ricardo/.local/share/claude/versions/2.1.308`, SHA-256 `356733f185fa988e6bf3aa9a555269fdd167982a2e2a80d3c8a78037bb92ad58`.
- Comparação: **2.1.302**, SHA-256 `60d7eb7f12fbb28a52533fe8be5884097403562aa02dc73991a021c7067e29a5`, mesmo artefato da investigação 0618. O pin canônico do programa Claude100 permanece 2.1.302; esta inspeção não o move.
- Harness: main publicada **420b97b3373389f30ac82c4d4078a21b2363fdf9**, confirmada no remoto e congelada numa snapshot de leitura. O checkout compartilhado 3704 foi preservado. A fonte inclui os PRs 14/17/15 posteriores à auditoria 0622; os achados daquela revisão não foram simplesmente reapresentados como atuais.
- REA 6.5.0: abertura do ELF, capturas de processo e análise estática de JavaScript embutido. Não houve descompilação nativa: Ghidra/Hopper/IDA indisponíveis. Foi possível recuperar spans de texto já embarcados no ELF sem executar esses derivados.

As capturas usaram `env -i` e bubblewrap com namespace de rede/PID separado, sistema montado somente leitura, configuração e workspace sintéticos. O diretório pessoal real, credenciais e transcrições não foram montados. A REA captura o wrapper `/usr/bin/env`; a identidade do Claude foi amostrada separadamente, não vinculada atomicamente pelo sistema operacional à imagem executada. Tráfego de rede não foi monitorado pela REA; isolamento não equivale a uma prova de ausência de tentativas de rede.

O primeiro `--help` falhou porque `uv_os_homedir` não encontrava o cadastro de usuário. O ensaio foi corrigido montando `/etc/passwd` e `/etc/group` somente leitura, mantendo o home real ausente. A falha original foi preservada; não houve instalação ou mudança na configuração do Claude do usuário.

## Evidência produzida

| Verificação                            | Resultado                                                                                     | O que comprova                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Capturas REA                           | **23**, sem timeout ou truncamento: 18 exit 0 e 5 exit 1                                      | Versão, ajudas, validação, inventário de plugin e lista vazia de agentes                               |
| Exit 1 esperados                       | Manifesto inválido, warnings em strict, recusa do perfil directory e opção inexistente na 302 | Negativos funcionais; não falhas inesperadas da investigação                                           |
| Outro exit 1                           | Primeiro help sem cadastro de usuário                                                         | Limitação do ambiente, corrigida e preservada                                                          |
| Extração estática                      | 2507 spans UTF8, 48.337.208 bytes                                                             | Candidatos de texto na seção `.bun`, com offsets e digests; não são 2507 módulos completos comprovados |
| Análise REA desses candidatos          | **6 spans selecionados**, 94.242 bytes lidos, 6 JavaScript parseados, 0 parse failures        | Sintaxe e relações estáticas locais de configuração/CLI/plugins/evals                                  |
| Cobertura da aplicação                 | **Parcial**; 2501 spans não analisados                                                        | Imports com nomes originais e relações externas não foram reconstruídos; unknowns não são bugs         |
| Prova do loader CVG atual              | SKILL.md isolado recusado; skill.json canônico aceito                                         | Gap delimitado do loader inspecionado, com controle positivo; não alegação de ausência global          |
| Execução com modelo, MCP real ou cloud | **NOT_RUN**                                                                                   | Nenhuma alegação de funcionamento ou equivalência nesses cenários                                      |

O [índice](evidence/REA-CLAUDE-20261022/capture-index.json) aponta cada captura e EvidenceID. A [síntese estática da REA](evidence/REA-CLAUDE-20261022/rea-static-summary.json) preserva as limitações. O [manifesto de extração](evidence/REA-CLAUDE-20261022/extraction-manifest.json) vincula bytes ao executável. Derivados proprietários e o grafo completo permanecem no diretório privado indicado em [rea-bundle-location.json](evidence/REA-CLAUDE-20261022/rea-bundle-location.json), não incorporados como código do projeto.

## Descobertas novas em relação à 0618

**1. Validação tem perfis diferentes e isso precisa aparecer no resultado.** Na 308, o mesmo diretório sintético é aceito na validação normal com warning, recusado em strict, e recusado com `--profile directory` pelos critérios de publicação. Na 302, `--profile` é opção desconhecida. Isso foi executado nas duas versões, não apenas lido na ajuda.

Outro controle é particularmente útil: um manifesto válido teve `success:true` em strict, embora a seção informativa directory listasse impedimentos de publicação. Não é contradição: são escopos distintos. A adaptação CVG deve tornar explícitos **perfil solicitado, verificações executadas, cobertura e decisão**, evitando interpretar validação de manifesto como autorização de execução ou publicação. Não copiar as regras específicas do marketplace, nem relaxar os schemas strict existentes do CVG.

**2. O custo permanente pode permanecer pequeno enquanto o corpo da skill cresce.** No plugin sintético curto, o inventário mostrou uma skill, custo permanente estimado de aproximadamente 17 tokens e custo de invocação inferior a 20. Com o mesmo manifesto e frontmatter, mas corpo de 6098 bytes, o custo permanente continuou em 17 e o custo de invocação foi estimado em 1,5 mil. O teste comprova o relatório de estimativas e sua separação; não mede consumo real do modelo nem prova que todo carregamento em runtime é lazy.

**3. Há contraste executável com o loader do harness.** `loadSkillsFromDirectory` procura `skill.json` (`packages/harness/src/skills/loader.ts:131`). A fixture apenas com SKILL.md falhou; a fixture JSON canônica passou. A extensão deve preservar o manifesto e o grant existentes e acrescentar compatibilidade/proveniência/carregamento do corpo, sem tratar texto de skill como autoridade.

**4. A lista principal de flags não ganhou nomes novos nas capturas comparadas.** A ajuda de plugin eval é idêntica nas 302/308. Ela já anunciava comparação com/sem plugin, mocks, limites, repetição e relatório; não apresentar isso como novidade da 308. Mudaram descrições de resume/snapshot, mas a semântica funcional dessas diferenças não foi ensaiada. [Delta de versão](evidence/REA-CLAUDE-20261022/version-delta.json).

## Matriz de incorporação

Os IDs CC22 são referências desta investigação, não uma nova carteira de tarefas. Estados e dependências continuam em 0383 (C100) e 0380 (PAR). A [matriz JSON](evidence/REA-CLAUDE-20261022/improvement-matrix.json) contém evidências, paths e aceites positivos/negativos por item.

| Referência | Melhoria e ganho esperado                                                                                  | O que já existe / gap confirmado na inspeção                                                                                                                                                                   | Carteira canônica                 |
| ---------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| CC22-01    | **Inspeção de skills/plugins antes da ativação**, com perfil/cobertura e custo permanente versus invocação | Loader/registry e PluginManifestSchema strict existem. Falta projeção integrada de origem, digest e footprint nos caminhos examinados. Validação não deve instalar, executar ou aprovar plugin                 | C100-T01/T02; PAR-T07/H04/K04     |
| CC22-02    | **Discovery leve e SKILL.md sob demanda**: economizar contexto e facilitar reutilização                    | SkillDefinition e registry já guardam metadados. Loader atual exige JSON; falta contrato do corpo Markdown/referências com proveniência e limites                                                              | C100-T01; PAR-T07/C06/K05         |
| CC22-03    | **Avaliar com e sem plugin**: mostrar benefício versus custo antes de promover                             | runEvalSuite, evaluateRegressionGate e test-lab já existem. Reusar esses componentes para orquestrar pares e medir qualidade/custo/latência; não criar outro avaliador                                         | C100-E01/E02; PAR-Q03/Q04/Q06     |
| CC22-04    | **Configuração efetiva e prompt congelados por sessão**, com diagnóstico redigido                          | EnvSchema, checksum de prompt e pin de versão já existem. Completar origem/precedência e vínculo a resume/compactação; diagnóstico não substitui governança                                                    | C100-C02/H01/H02; PAR-M02/H02/K05 |
| CC22-05    | **Continuar e bifurcar sessões de verdade**                                                                | PostgreSQL de eventos e checkpoints existem. SDK `turn.send` monta contexto novo e single_pass em `packages/sdk/src/server.ts:274`; transcript persistido não recompõe sozinho a conversa                      | C100-S01; PAR-S01/S02/S04/S05/K03 |
| CC22-06    | **Streaming incremental com um único resultado terminal**                                                  | Eventos/cursor/framing já existem. Providers OpenAI/Ollama enviam `stream:false`; stdio aguarda dispatch. Ligar geração, lifecycle e cancelamento com buffers limitados                                        | C100-S02; PAR-M01/A01/A02/A05/A07 |
| CC22-07    | **Orçamento durável compartilhado por pai/filhos**                                                         | Gateway tem limites/reserva por escopos e checkpoint por execução. CostBudgetStore não oferece reserva transacional com identidade entre processos/árvore. Extensão CVG proposta; não foi comprovada no Claude | C100-B01/O01; PAR-K05             |
| CC22-08    | **Hooks declarativos com origem, prazo e eventos auditáveis**                                              | Event-bus e hooks de plugins já existem. Completar configuração/lifecycle externo e projeção no stream; hook só restringe autoridade                                                                           | C100-K01/K02; PAR-K09/K10         |
| CC22-09    | **MCP como adaptador governado**: integrar ferramentas sem criar um adapter por serviço                    | SDK JSON-RPC e registry controlado não são, por si, cliente MCP genérico. Discovery/schema precisam entrar na capability existente com grant explícito                                                         | C100-P01/P02; PAR-P01/X02/T12     |

Todas as melhorias de runtime/interface/identidade/configuração são alvo T3 e precisam de SPEC concreta aprovada. Nenhum item foi marcado DONE ou recebeu crédito de paridade. O comparador e suas dependências C100-Q01 continuam no caminho aprovado; esta análise não autoriza pular essa fundação.

## Como eu incorporaria

**Primeira fatia concreta: inspeção offline de skills e custo de contexto.** É possível preparar seu contrato e fixtures independentemente de qualquer modelo ou canal real. O [contrato proposto](evidence/REA-CLAUDE-20261022/skill-preflight-proposal.md) define entrada/saída, dono, caminhos sugeridos, limites, 12 aceites e dependências. Faz parte de C100-T01/T02, não substitui esses cartões inteiros nem concede sua execução antes do gate.

Exemplo de experiência desejada, ainda não implementada: o operador escolhe uma skill e recebe origem/hash, ferramentas solicitadas, risco declarado, cobertura da inspeção e os dois custos estimados. Uma mensagem como “manifesto válido; execução ainda não autorizada” não pode ser confundida com ativação. Ferramentas exigidas são comparadas ao grant real; texto do plugin não emite sua própria aprovação.

**Fundação de runtime em seguida, respeitando 0382:** fechar C100-Q01, recompor contexto ao continuar sessão, vincular configuração/prompt, expor parciais com cancelamento e implantar saldo durável por árvore. Isso amplia autonomia sobre estado recuperável e autoridade verificável. MCP/hooks/subagentes usam essas mesmas fronteiras; não deve surgir um segundo executor.

**Promoção por evidência de benefício:** acrescentar avaliação pareada ao runner existente. Um plugin que melhora acerto mas aumenta custo, latência ou intervenção precisa mostrar o trade-off. Um teste de qualidade verde não dá permissão de rede, shell, escrita ou tratamento de dado clínico. No CVG, cap esgotado ou resultado incompleto continua INCOMPLETE, não aprovação parcial silenciosa.

Não adotar as opções de bypass de permissões anunciadas pelo Claude, execução automática de scaffolds/MCP reais, nem publicar relatórios externamente por padrão. Não copiar a tolerância a configurações inválidas em headless mencionada pela ajuda: configuração governante inválida precisa falhar de forma explícita. Essas são decisões de adaptação ao contrato CVG, não alegações de defeitos ensaiados no Claude.

## Resultado, limites e continuidade

As cinco perguntas do claim foram respondidas: identidade, evidência REA, diferença 302→308, equivalentes/gaps do harness 420b97b e incorporação com aceites/gates. Para funções com modelo/MCP/cloud, a fonte nesta rodada é ajuda/sintaxe, com funcionalidade marcada NOT_RUN. A ausência de um recurso em caminhos inspecionados não prova ausência global no projeto.

Um scout readonly verificou sessão/stream/config/budget na snapshot atual, sem executar testes. Lead inspecionou skills/plugins/evals, executou as capturas e o contraste do loader. Código, índice Git, lockfile e trabalhos concorrentes foram preservados. Ledgers 99/20/30 e 0383 já tinham dono/mudanças; os [deltas prontos no handoff](../08_runtime/handoffs/rea_claude_20261022.md) respeitam a regra 5 de coordenação, sem sobrescrever estado alheio.

Revisão documental independente: **APPROVE_REPORT, zero obrigatórios**. Foram conferidos contagens, EvidenceIDs, cobertura, estimativas e preservação dos contratos/gates. [Parecer](evidence/REA-CLAUDE-20261022/report-review.json) e [verificação final](evidence/REA-CLAUDE-20261022/verification.json). O alvo REA foi fechado e os dois agentes auxiliares encerrados.

Próxima ação recomendada: o owner Claude100 reconcilia esta origem com C100-T01/T02 e prepara o gate da fatia descrita, preservando o pin 302 e declarando separadamente quais observações 308 serão adotadas. Não é necessário reabrir decisões D1–D4 do produto. Nenhuma melhoria proposta nesta análise concede release ao harness ou ao Assistente de Plantão.
