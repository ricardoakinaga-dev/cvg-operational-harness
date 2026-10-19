# Recuperação de resultado após passo concluído — HOW proposto

Estado: PROPOSED_TECHNICAL_REVIEW. Sem edição adicional de runtime ou
mudança da expectativa do teste vermelho por este documento. Autoridade:
0225 §7/J11 já aprovados; esta proposta não amplia o WHAT nem presume
aprovação de código por parte do scout.

## Problema e aplicabilidade

A prova nativa de perda de save preserva CONFIRMED/version1 e output completo,
mas o próximo processo encontra TOOL/SUCCEEDED e o checkpoint pendente sem
observação. A recusa incondicional conserva segurança, mas não realiza a
reconstrução já exigida. O teste0224 em memória exige handoff e será preservado
literalmente: contexto-v1 não qualifica o armazenamento do journal.

A revisão deve decidir se a distinção técnica abaixo é suficiente. Não usar
nome de classe, campo HTTP/modelo, string no output, GUC, application_name ou
inspeção do campo privado resultStorageMode para inferir qualificação.

## Protocolo interno proposto, sem API pública nova

O mapper PostgreSQL, somente depois de readiness no cliente real, rowversion1,
stateCONFIRMED, resultSQLNULL/errorNULL e decode íntegro, marca o objeto retornado
com um Symbol versionado não enumerável/não configurável/não gravável. Proposta
de chave compartilhada explícita: Symbol.for('cvg.journal.validated-result.v1').
A marca não aparece no resultado da ferramenta, JSONB, JSON serializado,
EffectJournalRecord TypeScript ou barrel público. Não é persistida nem aceita
como parâmetro de nenhuma operação. Mapas legacy0, estados não confirmados e
InMemory não a recebem. Campos textuais iguais à chave não têm significado.

A marca não ativa SQL, schema, credencial, fence ou modo: o opt-in existente
continua capturado no construtor; cada get continua validando readiness e
payload reais. Dependências programáticas instaladas e injetadas pelo owner
continuam confiáveis, conforme a exclusão explícita de código instalado hostil
na0225. A crítica deve contestar a proposta se essa fronteira não bastar;
nenhuma tag proveniente do modelo/output pode substituir leitura/validação.

O wrapper nativo do tool guarda, em símbolo privado próprio do módulo, um
callback somente de leitura que fecha sobre tool original, journal e
compositionFingerprint. Esse callback usa journal.get e confere marca por
own data descriptor, tenant/operationKey, CONFIRMED, result como propriedade
própria, tentativa não vazia e proposalHash calculado pela função já existente
com input/tool/version/provider/fingerprint. Nenhum reserve/execute/confirm/
fail/markUncertain é chamado. O helper interno não é exportado no barrel.
Não criar opção/porta pública, import inverso do harness para persistence,
package subpath export, dependência nova ou assinatura nova de EffectJournal.

## Reconstrução sem reabrir o passo

No ramo de pendingStep com SUCCEEDED e observação ausente, resolver a ferramenta
pelo registry nativo e pelo pendingDecision do checkpoint confiável. Exigir
stepId esperado, tenant/execution/stepNumber/status correspondentes e exatamente
uma observationRef válida, não ambígua. Não gerar outra referência nem reescrever
o passo, settlement, attempt ou journal. Falha de leitura/qualificação/proposta/
identidade mantém a recusa antiga e não chama modelo/corpo.

Para o output qualificado, usar completeToolPayload/assertCompleteToolObservation
existentes e reconstruir a observação com a observationRef do passo, metadata
nativa da ferramenta/operação e timestamp durável do passo (campo real a
confirmar na implementação). Não afirmar recuperar timestamp perdido. Bytes,
valor/tipo/SHA do output são os do journal; a origem permanece TOOL/UNTRUSTED.
Output fora do contexto vira UNAVAILABLE e não permite próximo modelo.

Acrescentar a observação à memória do run, completar somente o estado pendente
do checkpoint e preservar a contabilidade já confirmada. Gravar por CAS nativo
antes de qualquer nova decisão/modelo ou despacho. O store continua impondo
as duas barreiras0029/outer/fence quando bound; leitura de journal por si só
não concede entrada no modelo. Perda de CAS, lease, pause/cancel/deadline ou
falha de checkpoint conserva parada e corpo0 na retomada; não escalar para
adotar tentativa ou alterar passo concluído.

## Verificação discriminante

1. Teste estrito J11 save-failure existente permanece vermelho antes da correção
   e deve passar com dois processos: output real no frame, corpo total1,
   journal/passo/ref imutáveis, primeiro modelo1 e segundo1, receipts distintos
   e usage igual às chamadas. Ampliar o oracle para snapshots do passo/ref.
2. Negativos focais: marca ausente/textual/getter/alterável, modo0, legacy0,
   resultado ausente versus null, estado não confirmado, tenant/operationKey/
   proposal errados, ref ausente/ambígua ou stepId incorreto, erro get e falha CAS.
   Nenhum corpo/modelo novo, sem fallback ou coerção. Um controle íntegro passa.
3. Regressão congelada0224 mantém seu handoff exato. Símbolo no output é inválido
   para codec, não uma via de qualificação. Três crashpoints66 e contexto10
   permanecem; ampliar saved-result indisponível não permite modelo.
4. J13 prova guards bound reais; sem prova bound, não declarar recuperação bound
   qualificada. Typecheck no tsconfig.typecheck.json, lint e demais gates atuais
   continuam obrigatórios; testes de componente não concedem134crédito.

## Escopo e riscos da decisão técnica

Paths adicionais propostos, ainda NÃO reclamados para edição: effect-journal.ts,
iterative-runtime.ts e novo teste focal do harness. Adapter já reclamado muda
apenas marca interna após validação. index.ts, contratos, manifests/exports,
migrations0016/0029/0030 e teste0224 congelado permanecem intactos. Claim/preimagens
serão registrados somente após revisão técnica aceitar este HOW.

Riscos a julgar: protocolo Symbol.for compartilhado entre pacotes, compatibilidade
de consumidores que inspecionem símbolos, prova de provenance/attempt já existente,
ref única restaurável e fonte de timestamp, sobrevivência do callback privado às
cópias nativas, guards bound e preservação da causa original. Rejeitar qualquer
implementação que use apenas a marca como autoridade, reescreva o passo/receipt,
chame ferramenta ou escale escopo. Se não houver solução compatível com as
assinaturas/autoridade existentes, registrar o conflito e preparar uma decisão
concreta; não inferir nova aprovação nem repetir automaticamente a aprovação0225.
