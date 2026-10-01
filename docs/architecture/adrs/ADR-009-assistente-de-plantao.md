# ADR-009: Missão do harness — Assistente de Plantão

- Status: accepted em 30/09/2026 pelo usuário (Ricardo Akinaga)
- Fonte da verdade:
  [CVG — Direção dos programas e plano do Operational Harness](../../CVG_DIRECAO_PROGRAMAS_E_PLANO_HARNESS_2026-09-30.md)
- Substitui como direção do programa: o plano executivo
  [0354](../../03_build/0354_production_executive_plan_2026-09-26.md) e suas
  13 condições de GO, o roadmap 0366 e os backlogs 0356/0367. Esses documentos
  ficam como histórico; seus IDs e provas não são apagados.

## Contexto

Como plataforma genérica de agentes, o harness chegou a prontidão 20/100 sem
nenhum produto consumidor. A dor real do hospital é a perda de informação entre
pessoas no plantão, e a causa raiz é a entrada do registro: registrar exige
sentar no computador, o que o plantão não permite. O cvg-his-v4 é a fonte da
verdade e segue com equipe própria.

## Decisão

- O harness passa a ser o **Assistente de Plantão**: recebe áudio, foto e texto
  da equipe pelo WhatsApp, devolve a informação organizada e pronta para colar
  no HIS, transforma promessas em pendências com dono e hora, lembra, passa o
  plantão e cobra até o registro aparecer no HIS.
- **Poder zero por construção.** O assistente não escreve no HIS (credencial
  somente leitura), não executa comando, não acessa arquivo nem servidor, não
  navega livremente e não fala com tutor. A garantia vem da lista fechada de
  ferramentas, da policy que nega por padrão e do container sem shell, sem root,
  com disco somente leitura e saída de rede por lista.
- **Processo determinístico no centro, IA na borda.** Regras, prazos e
  escalonamento são fixos; a IA só transcreve e organiza, e um humano confirma.
- **Barra proporcional de produção** (8 condições, documento 0368) substitui as
  13 condições do 0354 para o uso interno pela equipe da CVG.
- **Fases:** 0 reorientação; 1 caderno de plantão no WhatsApp com 2 plantonistas;
  2 rotinas e passagem de plantão; 3 leitura do HIS; 4 reconciliação e visão do
  gestor; 5 novas portas. A fase 1 tem ponto de parada: se os plantonistas não
  usarem em duas semanas, parar antes de construir o resto.
- Congelados, sem apagar: `platform` (Control Center, Test Lab, multi-tenant),
  `rag`, `apps/web`, `legacy/`, certificação de 16 gates. Reaproveitados:
  `channel-gateway`, `model-gateway`, `policy-engine`, núcleo do runtime,
  `persistence`, `apps/worker`, `observability`.

## Consequências

- Frentes abertas do programa anterior (UP91, AUD0592, PR-301, SPECs em revisão
  e certificação) ficam `SUPERSEDED`. Correções de segurança úteis à nova missão
  continuam: piso de risco do `policy-engine` (AP-005) e dependências com alerta
  HIGH.
- Auditorias do harness só depois do fim da fase 2; a avaliação seguinte vem do
  uso real pelos plantonistas.
- A fase 1 depende das decisões D1–D4 do usuário: canal de WhatsApp, provedor de
  IA e transcrição, pilotos e retenção.
- Escrita no HIS, uso por outra organização ou painel web exposto à internet
  reabrem a avaliação de pentest, PITR, IdP corporativo e demais itens do 0354.
