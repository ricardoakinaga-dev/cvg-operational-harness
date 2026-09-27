# PR-401 — modelo de RIPD para produto consumidor

- Estado: `TEMPLATE_PROPOSED / WAITING_DPO_REVIEW`. Este arquivo é um
  formulário vazio, não um RIPD concluído nem uma definição de base legal.
- Uso: o controlador documenta o limite de cada relatório segundo operações,
  finalidade e risco; operações similares podem integrar o mesmo RIPD quando
  o controlador justificar. Registrar produtos e versões abrangidos para
  rastreabilidade. Vincular as linhas do
  [inventário técnico da plataforma](09-personal-data-inventory.md) e
  acrescentar categorias próprias do produto. Não preencher com dados de
  titulares, segredos ou payloads reais no repositório.
- Fonte: [orientações da ANPD sobre RIPD](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/relatorio-de-impacto-a-protecao-de-dados-pessoais-ripd).
  A ANPD recomenda avaliar o relatório antes de iniciar tratamento que
  possa gerar alto risco e atribui sua elaboração ao controlador. O DPO e
  o jurídico devem avaliar a aplicação concreta e o conteúdo final.

## 1. Identificação e decisão de escopo

| Campo                                               | Preenchimento requerido                                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Produto, versão e ambiente                          | `PENDENTE`                                                                                      |
| Limite do relatório                                 | `PENDENTE` — operações agrupadas e justificativa do controlador                                 |
| Finalidade e operações                              | `PENDENTE`                                                                                      |
| Controlador, operador e papéis                      | `PENDENTE` — confirmar responsabilidades contratuais                                            |
| Dono técnico e dono de negócio                      | `PENDENTE`                                                                                      |
| DPO/encarregado e contato                           | `PENDENTE` — decisão D-10                                                                       |
| Data e próxima revisão                              | `PENDENTE`                                                                                      |
| Avaliação de alto risco                             | `PENDENTE` — justificar se RIPD é aplicável e quem decidiu                                      |
| Escopo do piloto                                    | `PENDENTE` — produto, tenant e SLA definidos por D-04/PR-103                                    |
| Metodologia do tratamento e segurança da informação | `PENDENTE` — coleta, uso, compartilhamento, guarda, descarte e medidas técnicas/organizacionais |

## 2. Fluxo e categorias de tratamento

Para cada operação, preencher uma linha e ligar ao ID do inventário. Separar
dados da plataforma dos dados próprios do produto e marcar se há dado
pessoal sensível ou de criança/adolescente. Descrever **categorias**, nunca
registrar valores reais neste modelo.

| ID         | Origem/coleta | Categorias e titulares | Finalidade e necessidade | Operações e sistema/destino | Compartilhamento/transferência | Hipótese legal proposta | Retenção, descarte e backup | Direitos do titular/contato |
| ---------- | ------------- | ---------------------- | ------------------------ | --------------------------- | ------------------------------ | ----------------------- | --------------------------- | --------------------------- |
| `PENDENTE` | `PENDENTE`    | `PENDENTE`             | `PENDENTE`               | `PENDENTE`                  | `PENDENTE`                     | `PENDENTE_DPO_JURIDICO` | `PENDENTE`                  | `PENDENTE`                  |

Anexar diagrama de fluxo da coleta até eliminação; localização de banco,
backup, logs, telemetria, canal, provider e conhecimento; volume estimado e
número de titulares; quem pode acessar por tenant/role; contratos e suboperadores.
Informar se decisões automatizadas afetam titulares e como existe revisão
humana. `secretRef`, token de operador, mensagem e prompt exigem análise de
necessidade e minimização antes de qualquer envio externo.

## 3. Risco ao titular e salvaguardas

Aplicar a metodologia aprovada pelo controlador. Não converter o score
técnico do software diretamente em risco jurídico.

| ID de risco | Cenário e titulares afetados | Probabilidade/impacto antes | Controle técnico/organizacional e evidência | Probabilidade/impacto residual | Dono, prazo e decisão |
| ----------- | ---------------------------- | --------------------------- | ------------------------------------------- | ------------------------------ | --------------------- |
| `PENDENTE`  | `PENDENTE`                   | `PENDENTE`                  | `PENDENTE`                                  | `PENDENTE`                     | `PENDENTE`            |

Considerar ao menos: acesso entre tenants, identidade de operador, vazamento
por log/telemetria/provider/tool/canal, fonte RAG maliciosa, aprovação de
efeito externo, retenção excedida, recuperação de backup, incidente e
exercício dos direitos do titular. Referenciar o
[modelo de ameaças](../10_phase10/PHASE10_THREAT_MODEL.md) e testes do
candidato **na mesma versão**; controles apenas propostos não reduzem risco
residual até serem implantados e verificados.

## 4. Evidência, revisão e decisão

- Evidência técnica: commit, digest de imagem, configuração, migrations,
  testes, pentest, restauração PITR, política de retenção e fluxo de direitos
  do titular: `PENDENTE`.
- Necessidade/proporcionalidade, hipótese legal por finalidade,
  compartilhamento e transferência internacional: `PENDENTE_DPO_JURIDICO`.
- Comentários e decisões do controlador, DPO, segurança, dono do produto e
  responsável técnico, com data e versão: `PENDENTE`.
- Riscos residuais aceitos, plano e prazo para os não aceitos: `PENDENTE`.
- Gatilho de revisão: mudança de finalidade, categoria de dados, provider,
  canal, região, retenção, produto, tenant piloto ou incidente.

Este modelo não autoriza dados reais nem substitui as condições de GO do
[plano de produção](../03_build/0354_production_executive_plan_2026-09-26.md).
