# F01 — revisão independente da fatia temporal

**Estado:** correção local condicional; F01 integral `FAIL/REVISE`; produção
`NO_GO`. Fonte: SPEC 0160 A1–A3 e barra AUD0590-EXEC v1.

| Rodada | Crítico fresh-context | Veredito | Achado que alterou o BUILD |
| --- | --- | --- | --- |
| I1 | Hume (`01a0eaed-5856-70f1-857d-c7a9f0864929`) | `REJECT` | Expiração exclusiva correta, mas a reserva PostgreSQL não revalidava `ts/T` no SQL atômico. |
| I2 | Parfit (`01a0eaf5-90ed-76b0-bc99-a79d2c329143`) | `REJECT` | SQL passou a revalidar a janela, porém faltavam high-water/NTP e decisão SQL na borda de milissegundo. |
| I3 | Mencius (`01a0eaf9-a89a-7462-ad58-4308a41f4a42`) | `CONDITIONAL PASS` local; F01 `FAIL/REVISE` | Teste agora exerce o `INSERT` real com relógio sintético no último e primeiro milissegundos, mais smoke real. Encontrou risco de `commit` após a expiração, falta de isolamento do predicado da janela no negativo e falta de fronteira `UPDATE`. |

O teste usa uma função `clock_timestamp()` sombreada **somente** no schema
PostgreSQL descartável, com `search_path` explícito; o smoke anterior usa
o relógio PostgreSQL real. A diferença permite provar a expressão de decisão
sem depender de agendamento submilissegundo do host. O negativo do primeiro
milissegundo testa expiração e janela conjuntamente, como observado em I3.

O `commit` tardio precisa ser resolvido junto ao inbox/fence da SPEC 0160 B2:
uma reserva adquirida validamente pode chegar à confirmação depois da
expiração da assinatura. A implementação local atual ainda usa
`expires_at > CURRENT_TIMESTAMP` para `commit` e pode falhar. O patch de
fronteira não deve ser promovido como F01 completo antes da integração da
inbox, reconciliação B3, marcador/health da SPEC 0162 e testes HTTP/SQL no
mesmo candidato.

Uma suíte global subsequente detectou que a mudança de validação de expiry
quebrava chamadas diretas ao store; a condição foi restaurada para chamadas
sem janela assinada, enquanto o caminho HMAC continua delegando o instante
decisório ao PostgreSQL. Regressão focal de dois arquivos: 28/28 PASS.
Após a correção, `npm test` no root passou em **327/327 arquivos e
2.407/2.407 testes** com PostgreSQL sintético; `test:postgres` passou em
35/35 arquivos e 262/262 testes; typecheck e lint dos arquivos tocados
também passaram. O [manifesto](manifest-v1.json) vincula hashes de fonte e
logs. Esses testes provam regressão da fatia local,
não o fechamento de F01 nem um certificado do candidato integrado.
