# Resposta documental a I12 — SPEC 0162

- **Parecer de origem:** [I12](I12-review.md), nova revisão I7 pedida pelo usuário, `REVISE` no SHA-256 `c33410876ef204faa655e41c663630bed127a9d9df274c50fd9427f86a07e53e` (1 P1, 1 P2, sem P0).
- **Escopo:** SPEC e evidência somente. Sem código, SQL executável, migration 0028, testes comportamentais, banco, push, deploy, canal real ou dados reais.
- **Candidato revisado:** SHA-256 `6e3d4eed7c5381710a8b0c75376e11d7068ca731183019da7c74de21cde1f1ad`.
- **Estado:** os dois achados foram tratados na SPEC revisada. Aguardam crítica independente I13 e nova aprovação humana T3 para o hash candidato. A aprovação anterior não se transfere.

## P1 — fronteira de validade na reserva atômica

A SPEC agora define `sampled_at` e o receipt SAMPLE apenas como prova prévia de saúde/frescor A2. A única entrada de serving para reserve, takeover ou lookup é `authorize_and_reserve_or_lookup(request_envelope, sample_attest)`. Depois dos receipts externos, a chamada captura `decision_at := clock_timestamp()` numa CTE materializada da mesma instrução SQL que atualiza o high-water e decide a reserva/lookup. Nenhum SELECT ou round-trip anterior pode fornecer o instante final.

A janela 0160 A.1 e o timestamp assinado são revalidados contra `decision_at` em microssegundos inteiros. O marker recebe exatamente esse instante; decisão, marker e eventual reserva/lookup permanecem na mesma transação. Se a assinatura tiver expirado durante os receipts, só o marker e o resultado de expiração podem ser confirmados: sem lease, comando, mensagem, outbox ou 2xx. O 401 só é emitido depois do COMMIT e do receipt COMMIT witnessado. `decision_at < sampled_at`, A2 fora do orçamento residual, timeout ou receipt incerto falham fechados; incerteza após COMMIT segue `UNKNOWN_COMMIT` e reconciliação por `operation_id`.

A2 é recalculada com bracket monotônico da chamada final, idade/offset projetados e orçamento residual compartilhado, sem reiniciar o limite. O receipt pós-COMMIT vincula `decision_at`, outcome, `operation_id` e readback exato do marker; nenhum comando ou sucesso HTTP ocorre antes dele. A SPEC acrescenta casos para último microssegundo válido, primeiro inválido, atraso de receipts além da expiração, e recusa sem reserva/efeitos inbound.

## P2 — bootstrap de instalação legada 0027

A enumeração de estados agora inclui explicitamente o fluxo `LEGACY_*`, separado do genesis. Instalação que já serviu não pode alegar `GENESIS` nem “ingress nunca abriu”. O upgrade exige fechamento testemunhado do gate, inventário/fence de todos os boots antigos, drain de handlers/transações/leases e preservação das linhas/estados 0027; pendências seguem B3 ou handoff.

Com histórico externo completo, reconcilia-se a cadeia e o maior high-water antes do bootstrap. Sem histórico completo, o caminho automático exige A2 comprovadamente saudável até o drain, revogação efetiva das chaves HMAC antigas, boots antigos cercados, namespace de dedupe estável e retenção suficiente para redeliveries. A janela silenciosa exige que o limite inferior UTC atual exceda o limite superior da última admissão possível por `2*T + 1 segundo`, incluindo as incertezas A2 dos dois extremos. Qualquer incerteza reinicia ou impede a janela; sem prova suficiente, ingress fica fechado e há handoff para recovery aprovada.

Só após esses controles a SPEC permite anexar `LEGACY_UPGRADE_BASELINE`, inicializar/readback contra o baseline testemunhado e abrir ingress com B3/handoff resolvido e todos os binários guard-aware. Os testes exigidos incluem recusas para drain/fence incompleto, A2 legado incerto, chave antiga ativa, janela interrompida ou retenção/dedupe insuficiente.

## Verificação e gate

Foi executada validação documental de whitespace e formatação nos arquivos sob este claim; os resultados e hashes ficam em `I12-proof.json`. Não foram executados testes comportamentais, SQL, migration ou BUILD. A migration 0028 permanece pausada até I13 aceitar exatamente o hash candidato e o usuário aprovar novamente esse hash para BUILD T3 sintético.
