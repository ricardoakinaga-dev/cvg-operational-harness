# R2 final — HOW concreto da SPEC0225

**ACCEPT_SCOPED_HOW — zero divergências materiais obrigatórias.** Aceite do blueprint no SHA-256 `0f2fd6f9ea52bac9e6a73bf59e582d27cfd2238bcf72012027027512373fbfdc`, com task `917d416f…`. A interpretação R1 permanece aceita e intocada; esta revisão não a reabre. Não se aprova execução de BUILD/SQL/PG, código, estado funcional, promoção ou créditoPAR.

Task `C100-FND-JOURNAL-0225-BUILD-001`. Segunda e última revisão de preparação deste orçamento. Nenhum descendente; crítica de código futura é unidade distinta, explicitamente planejada no HOW/task. Não se cria R3 ou ciclo de retrabalho adicional.

## Escopo e autenticidade

Foram confrontados [HOW](sources/000-short-how.md.source.txt), [task](sources/001-task.json.source.txt) e [freeze](sources/002-how-freeze-r1.json.source.txt) contra a [cópia ajustada0225f26c](sources/004-adjusted-spec-proposal.md.source.txt), a [decisão16/10](sources/005-spec-gates.json.source.txt) e a [entradaR1](sources/006-entry-reconciliation.md.source.txt), com seu [aceite peloLead](sources/003-lead-review-acceptance.json.source.txt). A aprovação humana continua vinculada ao original04b92ba4 e somente aos ajustes listados; não há extensão silenciosa a0226/0238, operação mista, hosts ou produto.

[Inspeção independente](entry-inspection.json):3arquivos do freeze exatos;11paths únicos/disjuntos das9proteções, todas as pré-imagens e proteções conferidas. Nove paths novos continuam ausentes; os dois existentes são o adapter nativo e o loader. Base `2f0cc11f7bdda82456f069ac7cc8914cb5335c57` limpa, SQL0029 e registro no loader presentes; inventário completo igual ao da task, sem0030/0031. Os objetos Git0029/loader/builder correspondem aos arquivos de trabalho. Isso prova identidade de fonte, não aplicação de migration ou funcionamento.

## Avaliação do desenho

| Tema | Confronto com o contrato aprovado |
| --- | --- |
| Fronteira e queries | HOW24–45/65–74 mantém o journal PostgreSQL nativo, opção explícita congelada e default legado; codec interno sem barrel público. Detecta legado/expandido/ativado antes de projetar e exige supressão SQL de payload oversized antes do parserJSONB, com overflow distinto de ausência emget/reserve/transitions/RETURNING. Isso corresponde à SPEC§4/§5, linhas88–184; não permite SELECT ilimitado seguido de rejeição só emJS. |
| Codec e limites | HOW49–58/91–93 conserva JSON estrito e canonicalizador existente com parâmetros explícitos1048576/64/root1/1000000. Envelope/quatro campos, ASCII1398104, expandido1398616, SHA/length/base64, UTF-8 fatal/semBOM, scan lexical e recanonicalização seguem§4/§5. Output1MiB e ToolResult8MiB permanecem fronteiras distintas; checkpoint8MiB/contexto32KiB e prova de nós por componente permanecem§11.1/§11.2. |
| Migration/guard | HOW26–37/55–64 escolhe0030 aditiva depois de0029, sem tocar0016/0029/checksums/backfill. Duas colunas e versão imutável preservam0/NULL, payload1 apenasCONFIRMED e atomicidade. Expansão nega1; guard migration-owned SECURITY INVOKER recebe schema/principal confiáveis quotados e binding fixado pelo owner, sem nova tabela de autoridade/GUC/SECURITY DEFINER. É a solução já escolhida em§5/§6.1/§8, não novo desenho de segurança. |
| Readiness e legado | HOW29–34/59–69 verifica schema/role/ACL/guard no mesmo client e identidade por conexão, sem cache cruzado de tenant/schema/role. Principal dedicado sem memberships/super/bypass/ownership/DDL; original-reader resolve tabela viaUSAGE e deve obter42501. Opt-inget0 inspeciona sem adoção;reserve/transitions0 recusam órfão/FAILED/proposal igual, default recusa1. Mantidas as barreiras de§6/J05–J07. |
| Transações/fences | HOW43–45/70–74 preserva composição nativa e lock/recheck/lease antes da escrita. Confirmação repetida exige bytes/hash iguais, sem demoverCONFIRMED ou transformar ACK perdido emretry seguro. A base mostra as portas nativas relevantes no adapter linhas1070–1245/1735–1857. O HOW modifica o adapter dentro do pathset e não reivindica que os helpers atuais já implementemV1. |
| Provas/regressões | HOW13–14/86–105 e task conservamJ01–J13/J16 e só adiamJ14/drill completoJ15. J13 requer triggers/fences0029 reais; positivo unbound não basta. NUL vermelho, PID novo/SIGKILL nos crashpoints distintos, contadores/frames/receipts, J07 isolado e J12 separado permanecem. J16/gates atuais e43reds/P0 não são dispensados; não há repin/checker/skip nem transferência de certificado. |
| Escopo |11paths ficam em persistence:3módulos internos, adapter/loader,0030,4suítes e fixture. Proteções impedem alteração de0016/0029, storepublished, capture/checkpoint/contracts/manifests/lock/checker. A opção comfence na composição sintética não ativa constructorpublished nem autoriza produto/SDK/hosts ou capacidades adicionais. |

O HOW é uma proposta suficientemente delimitada para o contrato existente. Não há obrigação de trazer nesta revisão todos os corpos SQL/queries ou detalhes de infraestrutura ainda não provisionada. Também não se presume que o blueprint tenha implementado qualquer um deles. O [canonicalizador primário](sources/024-complete-json.ts.source.txt), linhas17–48, oferece parâmetros explícitos; isso sustenta a escolha de reutilização sem editarcontracts, não comprova o codec novo.

A promessa de preservar erro primário/cleanup/markUncertain é obrigação de§7/J12, ainda sem prova. A leitura do [wrapper nativo](sources/029-effect-journal.ts.source.txt), linhas372–418, mostra a composição confirm→catch→markUncertain; portanto não se transfere ao código futuro qualquer PASS de propagação de causa só por manter o wrapper. As provas têm de discriminar essa fronteira. Não foi demonstrada, por inspeção do HOW, uma escolha que exija violar seus paths ou enfraquecer o contrato; eventual necessidade de alterar fonte protegida deve ser reconciliada antes da edição, como o próprioHOW102 exige.

## Obrigatórios e observação

**Obrigatórios: nenhum.** O [resultado estruturado](result.json) mantém fontes e avaliações por tema.

**R2-I01 · INFO · status de autoridade:** HOW5–6 ainda diz que a entrada está em revisão; o reciboLead e aR1 já registramACCEPT. A redação é conservadora e desatualizada, sem ampliação de autoridade ou divergência material do HOW. Não exige retrabalho nem terceira revisão de preparação. A decisão desta R2 usa os registros autenticados.

**R2-I02 · INFO · coord concorrente:** o Lead acrescentou claim de preparação da candidata, sem código até HOW aceito/checklist. O [diff](coord-concurrent.diff.source.txt) é somente aditivo e preserva o conteúdo anterior. O [primeiro coletor](collector-attempt1.json) parou preventivamente nesse drift; [antes/depois](concurrent-drift.json) mantêm a baseline e a autoria externa. Não é execução demonstrada nem divergência material do HOW.

## Condições externas mantidas

1. **Antes de código:** Lead efetivar claim de fonte da candidata/branch nova e11paths; revalidar base, pré-imagens,0029/loader e reserva/inventário0030; registrar dependências físicas/ferramentas. Aceitar este HOW satisfaz a avaliação do desenho; não cria a candidata nem conclui esse checklist.
2. **Antes de provisionar PG ou executar processos:** congelar matriz executávelJ01–J13/J16 e manifestos runtime/fonte; registrar recurso sintético próprio, roles/schema/credenciais/portas/limites/HOME-TMP-config-cache/cleanup e binding legítimo da fixture. Conservar checks path/hash/CWD/UID/mode/argv/identidadeDocker; nenhum root/argv arbitrário, containerPARE ou identidade alheia. Esses detalhes podem ser concluídos no checklist previsto, sem inventar execução ou novo requisito de contrato.
3. **Antes da admissão/prova:** cutover exclusivo sintético, owner separado, binding/recibo imutáveis e negativos originais42501/J05–J07 devem passar de fato. Queriesbounded, causa primária, ambas as barreirasJ13 e todas as fronteirasJ12 exigem prova real no ponto correspondente; blueprint/codec isolado/mock não a substitui.
4. **Antes de encerrar rodada/integrar:** crítica de código da unidade distinta planejada, todos os aceites/regressões/gatesT2/certificação/verificador atuais sobre a fonte exata.43reds eP0 continuam bloqueantes enquanto abertos; não enfraquecer pins/checker/seleções nem herdarPASS. Os aceitesPAR dependentes e limites humanos permanecem os daR1; nenhumDONE ou promoção é concedido aqui.

## Evidência, preservação e limites

Somente leitura de fontes/textos/JSON e Git read-only, com hashes e conferência de inventário. Nenhum target/import, teste, BUILD, SQL, PG, Docker, rede, instalação, provider, conta ou recurso de processo foi executado/criado. Escrita somente neste how-review-r2; coord/ledgers/state e fontes permanecemreadonly. Leituras iniciais estão no histórico da ferramenta; a coleta posterior registra stdout/stderr emJSON emcommands, sem criar streams vazios.

[Antes/depois](beforeafter.json):30inputs observados:29 idênticos, incluindo HOW/task/freeze, autoridade e fontes; o único drift é o adendo concorrente de coord documentado acima, sem alteração dos bytes anteriores. [Entrada antes/depois](entry-beforeafter.json):11pré-imagens,9proteções, inventário/base limpa e3objetosGit preservados. [139artefatosR1](R1-protected-beforeafter.json) preservados por hash; verificação de integridade somente, sem reabrir sua avaliação. A nova revisão não altera a interpretação aceita nem seus congelamentos.

Todos os resultados de implementação, SQL aplicado, readiness/ACL efetiva, testesJ e recursos futuros permanecemNOT_RUN/não observados nesta lane. As avaliações acima são de fidelidade do HOW; não são evidência de comportamento. [Manifesto](manifest.json) cobre todos os artefatos próprios, exceto ele mesmo e seu digestSHA256.

Próxima ação: Lead encerrar a preparação e completar os checklists aplicáveis; a futura crítica de código é a unidade distinta já planejada. Orçamento de revisão de preparação2/2 encerrado, sem revisão adicional implícita.
