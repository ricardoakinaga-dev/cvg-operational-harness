# SPEC0258 — WORKSPACE-MAP: distinguir arquivo regular de workspace

R1,23/10/2026. Task `PROD0624-U05-WORKSPACE-001`, paiHISO-005, recorteU05.
T3: semântica do resolvedor/prova. `PROPOSED_FOR_TECHNICAL_REVIEW`; sem BUILD
até revisão técnica e humana explícitas do mesmo SHA. Não reabreSPEC0246,
P-REINO/R/K0/NEW nem fechaHISO005/014 ou U05 por associação.

## Recon e invariante

Fonte9a56a9c9, `scripts/boundary-semantic-resolution.mjs:629–662` enumera os
filhos de globs e rejeita qualquer não-diretório. A main contém o arquivo
regular legacy/packages/README.md, que não é workspace. Sua presença invalida
todo o mapa usado para resolver links de workspaces válidos.

Prova discriminada emNode22, sem executar target: uma fixture com package
válido em packages/member e link npm admitido resolve; a mesma fixture com
READMEregular em legacy/packages retornaUNKNOWN_WORKSPACE_CONFIG. Fonte/log
em evidence/PROD0624-EXEC-20261023/u05-workspace-probe.json. O ensaio inicial
tentava link direto para legacy/packages, recusado por outro limite explícito
do perfil; foi marcadofixtureinválida e não recebe crédito de isolamento.

Invariante: arquivos regulares de documentação encontrados pelo glob não são
workspaces, mas continuam premissas físicas conferidas. Diretório suspeito,
link, tipo especial, manifesto ausente ou nome duplicado não são ignorados.

## Delta finito proposto

1. Preservar inventário ordenado e aquisição física existentes. Para cada
   entrada, obter tipo pelo mecanismo semfollow já governado pelo resolvedor.
2. Se for arquivo regular verdadeiro, registrá-lo como premissa de stat e
   ignorá-lo **antes** da validação do nome de package/workspace. Não abrir
   conteúdo, executar código ou inferir package a partir do nome do arquivo.
3. Links e tipos especiais continuamUNKNOWN; não usar isFile após seguir link.
   Não acrescentar fallback para links de apps/legacy/products: o limite
   existente de linksnpm para packages/\* permanece explícito.
4. Diretório: aplicar as mesmas validações atuais de nome, manifestoregular,
   identidade, unicidade e teto. Packageincompleto/inválido recusa o mapa todo.
5. Na revalidação, trocar READMEpor diretório/link ou mudar inventário/stat
   invalida o snapshot. Não reutilizar mapa só porque o caminho é igual.
6. Arquivo ignorado não é contado como workspace, mas aquisição/metadata e
   limites de diretórios/arquivos/bytes continuam cobrados pelo mecanismo
   canônico. Nenhum teto ou namespace é ampliado neste delta.

## Escopo e limites que permanecem

Somente workspaces() e testes focais de resolução/revalidação, com hashversion
do resolvedor atualizado apenas se o contrato atual o exigir. Sem mudanças em
engine de escopo lexical, fontes aceitas, recipecompilada ou allowlist de prova.

Perfilpositivo segue node22-linux-exact-metadata-v1 e critériosglobais de
PROVEN. Resolver este defeito não supera roottsconfig paths/plugins/extends/
references nem outraUNKNOWN. Nenhuma UNKNOWN viraPASS para gerar prova. O
perfil de censura de recusa continua relatório, não certificado positivo.

Preservar maxContexts256 e demais limites. Medir novamente ocupação/margem no
root após a mudança; se o teto impedir a prova, registrarINCOMPLETE e novo
pacote de decisão. Medição histórica241/256 não autoriza aumentar teto agora.

## Aceites e controles

| ID   | Prova requerida                                                                                                                     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- |
| WM01 | Fixturepositiva resolve o mesmo package com/sem READMEregular, mesmo target/digest e ownerworkspace                                 |
| WM02 | README com nome inválido para package continua sendo só arquivo; conteúdo não é executado/lido como manifesto                       |
| WM03 | Link com o nome README, link de diretório e tipoespecial continuam recusados, sem fallback/follow                                   |
| WM04 | Diretório semmanifesto/nomeinválido/duplicado ou manifestosuspeito continuaUNKNOWN                                                  |
| WM05 | Snapshotnãoaceita troca de tipo, inventário ou stat entre aquisição/revalidação; controlar timestamps e mesmo nome                  |
| WM06 | Limites e cobranças preservados; muitos arquivos não viram workspaces nem contornam o teto de metadata                              |
| WM07 | Importsdireto/transitivo/alias/dinâmico do produto continuam detectados/recusados conformeperfil                                    |
| WM08 | Inventário do root medido no mesmoSHA; normal/strict e origemdosdiagnósticos explícitos, sem alegar prova global seUNKNOWNpersistir |

Matar mutantes que ignoram qualquer não-diretório, seguemlink como regular,
pulam validação de diretórios, deduplicam nome conflitante ou não revalidam
entrada ignorada. Provar antes/depois com corpusfísico real; monkeypatch de
isDirectory sozinho não prova aquisição. Node22, focais e regressões do
resolvedor/engine/compiled, type/lint e gates aplicáveis da candidata própria.

## Gate e continuidade

Crítico fresco do contrato, freezeSHA e revisão humanaT3. Só depois claim de
código/recursos. A aprovação0252b1 cobre AnnexB já integrado; não cobre este
delta. Preservar decisões/deferimento0246 e pais. U06/U07 continuam dependentes
da prova/perfil e autoridades canônicas, não da mera presença deste documento.
