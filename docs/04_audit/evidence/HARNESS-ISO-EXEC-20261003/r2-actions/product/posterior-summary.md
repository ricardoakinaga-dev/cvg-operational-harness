# Produto — R2-P4: REJECT

Crítico fresh-context: **13 PASS / 1 FAIL (PV10)**, 14 critérios executados. Identidade (PV07/PV09), asserções originais (PV13) e SIGKILL real do organizador foram aceitos. [Decisão](posterior-decision.json), [parecer integral byte-preservado](posterior-report.txt) e [manifest de evidências](posterior-manifest.json).

PV10: falha permanente `invalid_request` finaliza como `processed`, após uma tentativa, e mantém esse estado no reopen; SPEC 0179 §6 exige `review_required`. Fonte conservada, zero tarefas derivadas; o defeito é o estado terminal. [Prova mínima](pv10-minimal-proof.json) e [reexecução I0/integridade](lead-integrity-and-replay.json): esperado exit 1, observado exit 1; 1498 arquivos e144 inputs conferidos, zero divergências. Não é crítica adicional.

254 testes/8 arquivos/zero skips na cópia do crítico, 40 da fundação e 37 cenários originais; 27 sondas novas, 25 PASS/2 FAIL em PV10. Esses números se sobrepõem, não somar à suíte do harness. [Disposições originais 37](original37-dispositions.json) verificam semântica e exceções V2/NO_MODEL aprovadas. O crítico usou só a projeção selada, sem acesso a ledgers/coordenação/histórico/relatórios Builder. Bundle exato `0ddd6bbb3b9a0fbae9c26aa949947ec0947bfacd409928cbb972e6f4410691d0` executado default nos dois providers simulados, zero chamadas ao endpoint fake de modelo.

BUILD permanece **privado / NOT_PROMOTED**. R2-D2 consumiu sua única crítica posterior. R2-D3 não satisfeita; sem `products/` retrabalhado ou deleções promovidas. [Delta de implementação](implementation-delta.patch) sobre os91 fontes históricos preservados; seis arquivos, replay MATCH. [Freeze92 fontes](source-freeze.json). Logs/volumes brutos somente no cache durável; nenhum ZIP duplicado.
