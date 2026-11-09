# 0406 — Qualificação local da composição U13/K04

Task `GBRAIN-LOOP-U13-K04-COMMON-LOCAL-R1`, trilha T2, Node22, scope core.
Fase BUILD/AUDIT da carteira0397/0398/0399, sem encerrar suas24unidades/42critérios.

## Recon e autoridade

A [governança D12](../07_agents/AGENTS.md) exige task/SPECcurta e gates T2.
A fonte corrigida cfb954b48ada1861354a03e084b50f1c237b12a9 foi revisada e aceita
no escopo dos componentes pelo holderCI: [revisão](../04_audit/evidence/CLOSE-CI-LOCAL-20261023/zod-audit-high/lead-review-verification.json)
e [publicação](../04_audit/evidence/CLOSE-CI-LOCAL-20261023/zod-audit-high/publication.json),
GBrain48252/49502, seis blobs exatos,sem obrigatórios. Seu PR28 ainda executaCI;
mergeAllowedNow=false permanece respeitado. Os componentes K04 e U13 conservam
seus reviews e budgets existentes; nenhum corpo novo será escrito.

O [ACK50133](../04_audit/evidence/IDLE-CLOSURE-20261023/k04-u13-union-recon/ack-to-u13/ACK.md)
designa U13 como único qualificador e pede fonte corrigida revisada/aceita/publicada.
A [entrega terminal55992/59043](../04_audit/evidence/GBRAIN-LOOP-20261023/u13/fixture-lifecycle/common-source-admission-r1/k04-terminal-handoff-55992/verification.json)
encerrou a condição de execução/cleanup do holder IDLE. Os jobs próprios antigos
também terminaram e foram coletados. Os resultados anteriores não são transferidos.

### Correção explícita do sequenciamento documental

O preparoT1 anterior acrescentou esperar mergePR28 antes de testar localmente.
Essa condição era uma escolha do plano do agente, não uma exigência D12T2 ou
uma decisão humana hash-bound. Esta task a substitui SOMENTE para qualificação
LOCAL de cfb congelada, já revisada/aceita/publicada no escopo dos componentes.
Nenhuma trilha é rebaixada. Continuam obrigatórios os checks reais para merge,
main nova,proveniência GitHub,produção e qualquer decisãoT3/T4 aplicável.

O runner nativo suporta LOCAL_UNSEALED quando GITHUB_ACTIONS não é true.
Usar esse modo verdadeiro; não forjar IDs,seals,steps ou identidadeGitHub.
Resultados locais não são CI remota aprovada e não fecham U02/U15 ou release.
A CI40029064396 deCLOSE segue intacta. Nenhum push/merge será feito por esta task.

## Escopo e invariantes

Nova worktree detached própria em
/home/ricardo/cvg-u13-k04-common-20261023/candidate, baseada em cfb, com patch36
SHA d0a892379649bae2b92219b9cdd70232321eee05e3ef5d1f1647d18f8346850a.
Duas composições privadas já produziram árvoreba5484879f98d0a9ae107c88feca8019ebe8f0ac.
Preservar36blobs/modes,6blobsCI e22pins exatamente; nenhuma edição de corpo,
API,schema,policy,lock,piso,teste,timeout,fsync ou catálogo por esta task.

TMP privado0700curto em /home/ricardo/cvg-u13-common-tmp, ext4NVMe persistente.
O diagnóstico53348 mediu512adds reais em12,175s/0,519s,mas não reproduziu os
cinco timeouts. A causa histórica continuaUNKNOWN;nenhumaassertion é removida.
Fonte,deps,cache e outputs próprios também ficam em NVMe. Recursos de pares,
main/index compartilhado,ledgers99/20/30 e todas as fontes antigas são readonly.

## HOW

1. Conferir PR28HEADcfb, revisão/publicação e recibos; registrar task/SPEC/hash e
   claim antes de criar worktree. Qualquer fonte retirada/supersedida exige recon.
2. Criar worktree detached e aplicar apenas patch36. Verificar árvore,36+6blobs,
   22pins,originais,HEAD/index compartilhado. Emitir identidade nativa/run/freeze
   reais. Nenhuma previsão antiga vale como identidade.
3. Recursos exclusivos: Node22.23.2;scanner8.28SHA5fd1… privado; npmciignore-scripts,
   cache e npmrc próprios,lock7bd935… byteigual. Sem instalar dependência de host,
   sysctl,apt,credencial pessoal,modelo,provider ou canal real.
4. PG descartável próprio com imagemcached3c5…,loopback32802,DBcvg_u13_common_test,
   labelGBRAIN-LOOP-U13-K04-COMMON-R1,tmpfs512MiB,1GiB/1CPU/128pids,semvolumehost.
   EsperarSQLTCP da instância final. API35301/web45301 só apósbindIPv4/IPv6livres.
   Todos os dados são sintéticos;flagsPG obrigatórias preservadas.
5. Executar catálogo nativo da fonte atual:35gates externos em ordem do workflow,
   incluindo certify e seus16comandos internos. Runtime/init e finalize reais,
   GITHUB_ACTIONS ausente,proveniênciaLOCAL_UNSEALED declarada. Instalação,
   readiness,format,type,lint,build,unit,coverage,critical,mutation,PG/proofs,
   observability,phases,chaos,evals,load,restore,docs,E2E/browsers,skip,image,
   SBOM,licenses,security,certification-verify,diff eartifacts não são omitidos.
   Se a base/catálogo mudar,recongelar e reextrair;semreuso0261nãoaprovado.
6. Manter100% das quatro métricas por arquivo dos quatro grupos neutros e
   agregado90/85/90/90;15s por teste e demais overrides originais. Limites nativos
   preservados:3600s por gate,9000s parentcertify;wrapperglobal18000s. Nenhuma
   retentativa automática. Primeira falha interrompe sequência como o workflow;
   finalize sempre registra falhas/NOT_RUN. Não modificar fonte durante execução.
7. Conferir artefatos,raws e seusprodutores atuais/run/candidate/executionId,
   hashes,freshness,denominadores e drift.0404invalidaoutputs antes dos gates;
   histórico/NOT_RUN nunca é PASS. Preservar resultados negativos integralmente.
8. Depois de terminal real e coleta,limpar só recursos próprios porPID/startticks,
   ID/label/imagem/zero-clientes;confirmar portas e ausência de filhos próprios.
   Registrar resultados nestaSPEC e deltas nos ledgers próprios/GBrain.

## Gate e pronto

`IMPLEMENTATION_READY_LOCAL_T2`: claim e task registrados, fontes aceitas no
escopo acima, composição mecânica conferida e estaSPEC/hash congelados ANTES do
BUILD. Lead autoriza só materialização e verificações locais descritas.

Concluir esta task apenas com todos os gatesT2/catálogo local atuaisPASS,
metadados/produtores íntegros e cleanup próprio. Qualquer falha fica aberta para
adjudicação/replano;não repetir atéverde. LOCAL_UNSEALED não vira trustedCI.
Nenhum reset de NativeBinding2/2,receiverCodeR2 ou fixtureR1 é concedido.
F09,K04ownerfull,U13operacional/T4,24unidades/42critérios e produção permanecem
sujeitos às provas e gates próprios; nenhum aceite global é criado aqui.
