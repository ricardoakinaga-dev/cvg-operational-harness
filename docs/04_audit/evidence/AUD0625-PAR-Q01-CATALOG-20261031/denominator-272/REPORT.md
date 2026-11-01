# Q01 — medida r3 com 272 capacidades

**Emenda de escopo aplicada ao novo rascunho; Q01 continua aberto, sem aceite funcional.** A medida `r3-denominator-272` tem272 IDs únicos, mantém os270 IDs e descrições anteriores verbatim e acrescenta G1/SPILL-03 e G1/SESSION-07. O recibo32 e a disposição DF83727 autorizam esta alteração documental. Início GBrain85930, após a entrega prioritária da revisão0297/85652.

O [manifesto da medida](measure.json) publica os hashes comprimido e descomprimido do [catálogo272](catalog-272.json.gz), a autoridade e o denominador. O [índice legível](capability-index.json) contém os272 IDs e descrições. GrupoG1 passa de50 a52; G2=71, G3=56, G4=47 e G5=46. Numerador PASS_CURRENT=0, paridade NOT_MEASURED, produção NO_GO. Publicar este rascunho com hash não equivale ao freeze canônico do Q01 nem à implementação das capacidades.

## Duas capacidades com escopo autorizado

As [fichas novas](new-capabilities.json) conservam literalmente as descrições e procedimentos do scope-options aprovado. Incluem fontes Git768fb, positivos, negativos, artefatos e gates pendentes. SPILL-03 cobre as23 folhas de limpeza por idade/raízes confiáveis/sweep aguardado; SESSION-07 cobre as três folhas de renomeação manual/origem user/normalização/supersession da geração.

As26 folhas estão na [proposta de relações](scope-leaf-proposals.json), com metadados e status de extração preservados:21 STATIC e5 UNKNOWN. A decisão humana resolve a lacuna de escopo, mas não aceita automaticamente cada relação semântica. Nenhuma delas virou relação revista ou PASS. Os cartões candidatos PAR-C03/PAR-S03 permanecem associações para reconciliar; o catálogo não afirma que a SPEC0224 ou o escopo antigo do cartão já autorizam as capacidades novas.

## WEB-02: exceção da referência e meta CVG

A [disposição de proxy](proxy-disposition.json) registra a referência real: a rota direta valida/fixa IPs; o proxy delega DNS ao dispatcher e não faz a mesma resolução/fixação local. A recusa de literal não público continua explícita no código. O procedimento compara as duas rotas e documenta a exceção, sem fingir pinning local no proxy.

A exigência da CVG permanece **UNIVERSAL_FAIL_CLOSED**: validar e fixar também pelo proxy, ou deixá-lo desligado. A descrição WEB-02 original ficou verbatim; o procedimento anterior está no histórico. A disposição do DF não resolve as outras diferenças: QUERY-02/carregamento integral, SESSION-05/deduplicação de estatística e WEB-02/truncamento de stream continuam abertas. Nenhuma dispensa de egress ou produção foi concedida.

## Entrada concreta para revisão das355 propostas

O [handoff](review-handoff.json) congela exatamente as263 propostas util e92 propostas corrigidas pedidas pelo DF:220 grupos/355 folhas,268 STATIC e87 UNKNOWN. O [input355](review-input355.json.gz) preserva cada grupo original integralmente, com origem e status PENDING_INDEPENDENT_REVIEW. Não incorpora silenciosamente as26 novas relações ou as881 propostas de ferramentas à solicitação355. Nenhuma folha ou aceitação nova foi criada para inflar contagem.

A regra0380:31 continua literal: uma revisão independente por cartão, no máximo dois retrabalhos, retorno ao replanejamento após duas rejeições. O histórico não foi apagado: R1 rejeitou o freeze; REWORK1/R2 aprovou apenas reparos F02/F03/F04; a conferência F01/B01 rejeitou118 relações; veio o replanejamento78654; agora DF83727 pede revisão das355. Não se presume que uma nova versão da medida reinicie esse orçamento.

Nenhum crítico foi iniciado nesta unidade de autoria. **A revisão semântica independente permanece pendente.** Próxima ação concreta para Claude DF: dispor o gate remanescente exato sob esse histórico e0380:31, com escopo355 e revisor não autor/paths; dispor as26 relações separadamente. Se o ciclo permitido se esgotou, manter o replanejamento. Isso é uma pendência de aceite, não uma alegação de que a preparação documental ficou bloqueada ou de que o objetivo integral terminou.

## Conferências realizadas

- Os270 IDs/descrições estão exatos;269 objetos anteriores ficaram integralmente iguais. Somente WEB-02 recebeu a disposição autorizada, mantendo classificação, fontes, cartões, gates e histórico.
  -121 blobs da referência e1376 trechos citados foram autenticados por Git/OID/SHA/limites, incluindo as fontes carregadas pelas355 propostas. Isso é integridade da entrada, não nova leitura semântica independente de355 folhas. O Lead leu novamente os caminhos focais de cleanup, unload, rename e proxy.
- Matriz original44132 conferida:30586 STATIC/13546 UNKNOWN. As381 identidades da entrada355 e das26 novas propostas mantêm hashes, fonte, owner, escopo, extração e estado de paridade.
- A [verificação documental](verification.json) aceitou o pacote e recusou15 cópias deliberadamente inválidas: remoção/mudança de ID ou descrição, denominador errado, perda de positivo/folha, promoção UNKNOWN, PASS fictício, dispensa de proxy, eliminação do pendente de stream, alteração da entrada355, falso aceite/reset e fecho indevido do Q01. São guardas do artefato, não testes funcionais do produto.
  -15 inputs anteriores/recibos/backlog conferidos sem alteração. Todos os originais ficam imutáveis. O índice de folhas270 e as antigas lanes foram qualificados como proveniência histórica; as26 propostas têm suplemento próprio e não recebem crédito retroativo pelo índice antigo.

Partição global, sem dupla contagem:2893 relações estáticas revistas anteriormente +355 propostas para revisão +881 propostas de ferramentas +26 propostas de escopo novo +74 util unresolved +94 ferramentas unresolved +1511 sessão pendentes +811 orquestração pendentes +37487 fora do B01 =44132. Continuam41239 folhas sem aceite semântico e1262 propostas não aceitas. Uma relação estática revista não é PASS funcional.

[Metadados completos das26](shape-integrity-addendum.json), [inputs](input-pins.json), [fontes](source-pins.json), [trechos autenticados](authenticated-ranges.json), [recibo32](receipt32.json), [cadeia31](receipt31.json), [checks](checks.json), [notas](NOTAS.md), [deltas](LEDGER-DELTAS.md), [bruto](raw-scope272.tar.gz), [inventário](raw-files.json), [readback do bruto](raw-archive.json).

Nenhum BUILD, aplicação, import de produto, teste funcional, provider, PG, Docker, instalação, rede de aplicação, push, merge ou produção foi executado. A autoria documental usa inspeção própria, sem declarar revisão independente. O objetivo integral permanece ativo.
