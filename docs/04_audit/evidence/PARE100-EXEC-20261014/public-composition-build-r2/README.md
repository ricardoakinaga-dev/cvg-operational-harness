# Replay dos builds públicos SDK e API

Os dois builds existentes passaram em sequência, pelos exports reais e
sem aliases de fonte. SDK compilou quatro workspaces; API compilou 19,
com união de 20. Os 822 arquivos de dist existentes foram preservados
antes da execução; a quantidade final continuou 822.

Apenas cinco arquivos `tsconfig.public.tsbuildinfo` mudaram. JavaScript,
declarações e dados permaneceram byte a byte iguais, inclusive toda a
composição do worker compilada anteriormente. As 1042 fontes e as 81
entradas da candidata atual também ficaram intactas. Portanto, o smoke I0
anterior continua vinculado aos mesmos bytes executáveis; não foi
reexecutado sem necessidade.

Evidências: [comando composto](command.json), [SDK](packages-sdk.json),
[API](apps-api.json), [diff](emits-changes.json),
[verificação dos bytes](abi-replay-check.json) e
[manifesto](publication-manifest.json).

A compilação não executou módulos de app, provider, PostgreSQL, canal
ou ação real. Não ativou qualificações, alterou checker/pins/lockfile,
implementou código da SPEC0226 ou concedeu aprovação de contrato/release.
A última suíte global, 4406 PASS/44 FAIL/282 SKIP, precede os novos emits
e permanece um registro daquele ponto; os demais gates continuam abertos.
Os backups, HOME e caches ficaram privados; streams vazios omitidos estão
tipados no manifesto. Nenhum arquivo foi promovido para ROOT.
