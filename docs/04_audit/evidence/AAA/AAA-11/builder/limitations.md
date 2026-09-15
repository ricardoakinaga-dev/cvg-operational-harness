# AAA-11 builder — limitations

1. **RED por mutação, não por artefato pré-fix.** O working tree é compartilhado e o
   runtime AAA-09/10 ainda não está commitado; o arquivo exato pré-AAA-11 não foi
   preservado por esta lane. O RED foi produzido neutralizando-se a aplicação nova
   (`assertBudget` sempre indefinido, `stopReason` sempre indefinido, `finish` sem
   fechar filhos pendentes) no mesmo arquivo, restaurado em seguida com hash
   conferido (`ea1c8ccd…`). O RED demonstra sensibilidade dos testes à classe F05
   (orçamento/deadline/cancelamento que não interrompem trabalho), não uma execução
   contra o binário histórico.

2. **Deadline é cooperativo.** O runtime checa `deadline`/cancelamento antes de cada
   etapa e imediatamente após cada `await` (modelo, ferramenta, outbox, journal,
   recuperação). Uma dependência que ignora `AbortSignal` não é morta à força: seu
   resultado tardio é descartado e não autoriza ferramenta/outbox; após a ferramenta
   o estado vira `UNCERTAIN` honesto. Não há preempção de thread/processo.

3. **Outbox negada após efeito.** Se o orçamento/deadline/cancelamento nega a etapa
   `outbox.enqueue` depois de a ferramenta ter executado, o resultado é `denied` com
   `reason` do limite, `effectConfirmed=true` e `outboxPending=true` (nunca um
   `denied` que sugira ausência de efeito). A reentrega depende do replay com a mesma
   `operationKey`; esta lane não altera o consumer da outbox (fora do escopo).

4. **Outbox conta como etapa orçada.** Por contrato (§9), `outbox.enqueue` consome um
   `step`; `maxSteps=1` em turno de execução permite a ferramenta e nega a outbox
   (teste dedicado). T-09 usa o turno de solicitação, onde `maxSteps=1` nega a
   ferramenta e nenhuma outbox é criada.

5. **Somente fixtures sintéticas.** Nenhum provider, canal, IdP, PostgreSQL ou dado
   real foi usado. O gateway de modelo já aceitava `signal`; nenhum arquivo de
   `packages/model-gateway` foi alterado. `approval-engine`, `persistence`,
   `channel-gateway`, `index.ts`, `package.json` e arquivos compartilhados de
   tracking não foram tocados.

6. **Semântica de journal/proposta AAA-09/10 preservada.** As únicas adições são
   `failEffect`/`markUncertain`/release já previstos na matriz de crash (§6/§7)
   quando um stop interrompe a fronteira correspondente; nenhum novo estado ou
   transição foi inventado.

7. **Suíte global sem regressão, mas baseline móvel.** `npm test` = 195 arquivos
   passed | 4 skipped; 1148 testes passed | 56 skipped; zero falhas. O baseline do
   worktree antes desta lane era 194/1132; o delta (+1 arquivo/+16 testes) é
   integralmente desta lane. Outras lanes alteraram arquivos no mesmo período.

8. **Sem commit/push/deploy/instalação.** Nenhuma ação externa, custo real,
   credencial ou produção foi exercitada. Gate de produto não concedido; revisão
   independente obrigatória.
