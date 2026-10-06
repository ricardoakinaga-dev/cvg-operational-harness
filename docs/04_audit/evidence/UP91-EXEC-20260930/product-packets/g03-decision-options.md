# G03 — conflito temporal e opções para decisão humana

Data:30/09/2026. `PROPOSED / HUMAN_REVIEW_PENDING / NO_WAIVER / NO_GO`. Documento de decisão candidato da lane UP91-007-DOC. Nenhuma opção foi aplicada. O texto original continua vigente; nenhuma prioridade, estado, autorização, fonte canônica ou aceite foi alterado.

## Regra vigente e prova de cobertura

[0354 §2:47](../../../../03_build/0354_production_executive_plan_2026-09-26.md:47) exige, no mesmo digest/configuração:

> 3. Zero itens P0/P1 abertos em 0356.

[0363](../../../../03_build/0363_program_roadmap_2026-09-30.md:140) preserva a regra literal para promoção final e pede conciliação humana; não a modifica. [UP91-050](../../../../03_build/0364_program_backlog_2026-09-30.md#up91-050) repete essa obrigação. G12 exige piloto concluído; G13 exige autorização humana com hash do candidato e escopo. Nenhuma média de score ou aceite de documento substitui os13 gates.

Foram lidos os83 cartões H3 de[0356](../../../../03_build/0356_production_backlog_2026-09-26.md) e os13 gates de0354. Contagem efetiva: **50 P0,25 P1,8 P2**. O resumo final de0356 ainda enumera79/49/22/8; não foi corrigido nesta lane. Quatro adições H3 explicam83: PR-009-PROV(P0 para promoção), PR-011-CODEQL(P1), PR-301-FENCING-CONSTRAINT-PREFLIGHT(P1), PR-301-WEBHOOK-REPLAY(P1). Dois H4 de replay/schema/clock são suplementares, não cartões adicionais na contagem83.

[task-source-proof.json](task-source-proof.json) conserva bytes/hash/linhas de cada cartão, campos Pronto quando existentes, os52 cartõesUP91 e dependências,13 textos de gate e mapeamento83/83. Nove fontes H3 não têm linha padronizada `- Pronto`; recebem `acceptanceText=null`. Critérios em outras formas e todo o corpo original permanecem preservados, sem inventar ou apagar aceite. A [matriz](task-source-matrix.md) aponta às fontes canônicas. É fotografia imutável; não é backlog de estados atualizado.

## Casos concretos e dependências

| Fonte                  | Prioridade real | Condição de conclusão / dependência                                                                                                 | Consequência para G03                                                                                                                                                                                  |
| ---------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PR-704 / UP91-047      | P0 / P0-R       | DecisãoD14 com hash/config/escopo;047 depende045 e046.                                                                              | Cartão de decisão do piloto. Não é P1 nem pós-GA; fechamento no próprio ato da decisão exige procedimento explícito.                                                                                   |
| PR-705 / UP91-048      | P0 / P0-R       | Piloto limitado, critérios0355 por duas semanas;048 depende047.                                                                     | Pode ser concluído antes de GO produtivo; não forma por si um ciclo pós-GA.                                                                                                                            |
| PR-706 / UP91-049      | P0 / P0-R       | Relatório/feedback/correções;049 depende048.                                                                                        | É saída do piloto antes de050; não é P1 pós-piloto dispensável.                                                                                                                                        |
| PR-707 / UP91-050      | P0 / P0-R       | DecisãoD15 registrada e plano de expansão aprovado;050 depende046/049 e exige G03 vigente.                                          | Decisão positiva e fechamento do próprio cartão têm ambiguidade de ordem quando G03 exige zero aberto antes do ato. Não tratar cartão como DONE antecipadamente.                                       |
| PR-708 / UP91-051      | P1 / P1         | Cada novo tenant com onboarding,RIPD,hypercare;051 depende050.                                                                      | Na ordenação atual, expansão vem depois do GO. O texto de PR-708 isolado não diz literalmente “pós-GA”; dependência explícita é da unidade051. Aprovar plano não realiza onboarding dos novos tenants. |
| PR-709 / UP91-051      | P1 / P1         | Título: “Auditoria de 30 dias pós-GA”; aceite: SLO/custo/incidentes/qualidade revisados e roadmap seguinte proposto;051 depende050. | Fechamento exige experiência posterior a GA. Auditoria sintética ou plano de auditoria não satisfazem esse aceite.                                                                                     |
| PR-608 / UP91-037 e051 | P2 / P0-R eP1   | Suporte/comunicação/templates; origem incluída em unidadeM9 mas também operação anterior.                                           | Demonstra por que prioridadeUP91 e fase não substituem prioridadePR. Não é P1 de0356; suporte necessário em G10 não pode ser adiado por seu P2.                                                        |
| PR-L11 / UP91-052      | P1 / P1         | DependePR-L07 e decisãoDL05;052 depende020/022/030/036. DL05A após neutroCI, DL05B após primeiro piloto.                            | Condicional à decisão pendente. Não demonstrado ciclo obrigatório pós-GA: mesmo DL05B pode ocorrer antes deD15. IsolamentoG01 não equivale à retirada definitiva.                                      |
| PR-208 / UP91-004      | P2 / P1         | D13B mantém11 findings de teste como risco aceito, correçãoP2.                                                                      | Não é exceçãoG03 nova. PrioridadeUP91 de integrar/validar não muda a prioridadePR208.                                                                                                                  |

Os demais23 cartõesP1 de0356 não foram classificados como pós-GA. Por exemplo PR-106/504 (fonte), PR-505 (efeito governado), PR-404 (direitos), PR-603/606/607 (migration/carga/DR) são obrigações pertinentes antes do uso correspondente. A prova83 contém todos os outros IDs e seus aceites; não afirma quantos estão abertos hoje. `COMPLETED` histórico, fatia isolada e conclusão integrada são estados distintos que só o holder pode adjudicar por evidência atual.

## Ciclo demonstrado e limite da inferência

O grafo explícito de dependências dos52 cartõesUP91 é acíclico. Isso não resolve a dependência adicional imposta pelo gateG03. No sentido “A exige B antes de concluir”, o testemunho temporal é:

```text
GO produtivo D15 (UP91-050)
  → G03 literal satisfeito
  → PR-709 concluída (P1, não excepcionada)
  → GA já ocorreu + janela30dias + auditoria efetiva
  → GO produtivo D15
```

[0355 F7](../../../../03_build/0355_production_roadmap_2026-09-26.md:127) chama M-GA o marco de D15 aprovado; [0363](../../../../03_build/0363_program_roadmap_2026-09-30.md) ordena M8GO→M9expansão/revisão;0364 fixa051→050. **Há ciclo temporal sob a interpretação de GA como essa entrada em produção controlada**, interpretação sustentada por essas fontes. Não há evidência de outra GA anterior autorizada. Se o titular usa outro significado de GA, deve definir evento/data/candidato, demonstrar autorização e revisar explicitamente a semântica; não inventar GA para romper o ciclo.

PR-708 produz também inversão de ordem quando sua conclusão é tomada como realização de expansão051, mas a força dessa relação vem do mapeamento/aceite051, não de frase “pós-GA” no cartãoPR708. O ciclo mínimo usa somentePR709 e não depende dessa inferência. PR-707 produz problema de fechamento da própria decisão, cuja solução transacional/documental não está demonstrada; não somar isso como segundo defeito de runtime. G12 é resultado pré-GOprod;0363 distingue sua parte pré-piloto de sua parte resultado. Interpretar todos13 como requisito de entrada no piloto recriaria um ciclo com705; essa leitura não é adotada silenciosamente.

## Opção A — manter regra literal e NO_GO

Alteração exata em0354: **nenhuma**. Manter “3. Zero itens P0/P1 abertos em 0356.” e todos os demais textos originais.

Efeito: não promover enquanto esse critério não for demonstrado. Preserva integralmente autoridade; não oferece caminho satisfatível para o primeiro GO se GA continua significandoD15 e709 exige30dias após ele. O titular pode escolher manter o bloqueio até decidir mudança formal. Encerrar709 por plano/ensaio ou reclassificar708/709 automaticamente violaria o aceite original; não são ações desta opção.

## Opção B — aplicabilidade por fase e escopo com obrigações preservadas

**Recomendação PROPOSED**, porque remove o ciclo de trabalho futuro sem alterar prioridade ou apagar obrigação. Exige decisão explícita do titular do plano; não é interpretação já autorizada de G03. Toda atribuição de aplicabilidade deve ser revisada por origem, não só por rótuloM9. Mudança de escopo volta ao gate pertinente.

Alteração exata proposta1: substituir somente o item3 da seção2 de0354 por:

```text
3. Zero itens P0/P1 abertos em 0356 aplicáveis à fase e ao escopo do GO
   solicitado, identificados individualmente em matriz de aplicabilidade
   aprovada pelo usuário e vinculada ao hash do candidato, da configuração
   e do escopo. A matriz deve cobrir todas as tasks de origem de 0356,
   preservar seus IDs, prioridades e aceites e justificar cada obrigação
   de fase posterior; não pode postergar correção de falha, controle ou
   risco P0/P1 que afete o candidato ou o uso solicitado.
```

Alteração exata proposta2: inserir o seguinte parágrafo imediatamente após o item13, antes de “## 3. Não-objetivos permanentes”:

```text
Aplicabilidade por marco: estas condições qualificam o GO de produção
controlada D-15; o piloto mantém seu pacote de entrada D-14, seus limites e
os pré-requisitos pertinentes, e seus resultados completam G12 antes de
D-15. No GO inicial, PR-709 permanece P1 aberta como obrigação posterior
a M-GA, com dono, prazo de 30 dias, critério original e revisão humana dos
resultados; PR-708 permanece P1 para cada expansão de tenant posterior,
com onboarding, RIPD e hypercare antes do uso por esse tenant. O plano
de expansão aprovado não encerra essas tasks. A matriz deve nomear a
data/evento M-GA que inicia a janela e os owners e prazos, sem presumir
que toda task M9 seja adiável. Achado P0/P1 que afete o escopo atual
bloqueia seu uso ou nova promoção independentemente do marco. As tasks
de decisão PR-704 e PR-707, quando correspondem ao próprio GO solicitado,
concluem seu aceite no ato do registro humano hash-bound; antes desse
registro não existe GO nem se declara a task concluída. Os demais aceites
aplicáveis devem estar comprovados antes desse ato. Todos os 13 gates
continuam obrigatórios para D-15 e os não-objetivos permanentes permanecem
válidos em todas as fases. A alteração de aplicabilidade não autoriza
BUILD, integração, dado real, efeito externo ou produção irrestrita.
```

Após eventual aprovação, o holder deverá preparar a matriz completa83 para o candidato/fase, identificar owners reais/prazos, atualizar o0354 sob claim próprio e registrar referência da decisão em0357/ledgers canônicos. Nada disso está autorizado ou realizado por este pacote. As83 tasks correntes e52 unidadesUP91 continuam com todos os aceites; a fotografia atual não é uma applicability matrix já aceita. Novo cartão futuro exige incorporar seu ID na avaliação, não limitar o universo para sempre às83 capturadas.

No GO inicial, esta proposta permitiria somente o trabalho genuinamente posterior709 e a expansão708 fora do escopo inicial, com decisão individual e limites. Não dispensaria identidade, fontes, egress, approvals, suporte, retenção, backup, pentest, qualificação do mesmo candidato ou piloto concluído. O limite de tenant/contatos/horário do piloto permanece vigente no seu pacote; expansão demanda nova qualificação pertinente e decisão humana. Sem assinatura de owner/prazo, matriz completa e alteração formal aprovada, usar a opçãoB continua proibido e vale opçãoA.

## Decisões efetivas solicitadas

1. Aceitar opçãoA e seu bloqueio, ou aprovar/revisar os dois textos exatos da opçãoB? A resposta deve citar este documento/hash e o escopo da mudança de G03; recomendação técnica não é waiver.
2. Confirmar que GA significa M-GA/D15 e qual evento oficial inicia30dias dePR709. Registrar dono e obrigação temporal antes de um futuro GO.
3. Confirmar limite do GO inicial e regra de expansão708; não declarar a expansão realizada quando apenas seu plano foi aprovado.
4. Aprovar ou corrigir o procedimento de registro/fechamento no mesmo ato paraPR704/707 e a separação entrada do piloto/resultadosG12. Trata-se de delta de governança proposto, não condição já cumprida.
5. Nomear autoridade e owners para a futura matriz83 e decisõesDL05/dados/retention ainda pendentes. Nenhuma pessoa/ambiente foi inventado aqui.

Até essas decisões, `G03_ORIGINAL_IN_FORCE / HUMAN_REVIEW_PENDING / NO_GO`. Builder fornece prova e proposta; líder revisa e solicita crítica fresca; somente autoridade humana pode alterar o plano. D12 e D13 preservados, sem redução de trilha ou dispensa silenciosa.
