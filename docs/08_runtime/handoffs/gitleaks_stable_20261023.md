# GITLEAKS-STABLE-20261023 — implementação e bloqueio operacional

## Resultado

Corrigida a geração de fixtures em candidata própria baseada na main9a56a9c9.
O gerador `hex-interleaved-v1` é determinístico por par/finalidade, mantém a
entropia e evita pares de letras que poderiam formar stopwords como `dead`.
Colisão com literal aprovado falha explicitamente; não há regeneração/retry.
Nenhum detector, regra, exceção, helper ou lockfile foi alterado.

Repro nativa: duas fixtures com mesma contagem de caracteres/entropia3,97095
produzem0achados com stopword e1achado sem ela. Os bytes das falhas anteriores
não foram registrados; não atribuir a elas uma sequência específica inventada.

Dois runs completos do teste nativo passaram:32pares atuais,34testes,
zeroFAIL/skip. Controle privado que ignora tudo reprovou nos32pares. Policy82
PASS; tipagem/lintPASS com dependências do lock correto. Revisão independente
readonlyAPPROVE_SCOPED_FIX/zeroobrigatórios. Npmtest completo, PG, E2E/certify
continuamNOT_RUN; só aCI do candidato real pode qualificar integração.

[Cartão/SPEC curta](../../03_build/0396_gitleaks_deterministic_fixtures.md),
[provas](../../04_audit/evidence/GITLEAKS-STABLE-20261023/verification.json).
Candidata: `/mnt/dados/cvg-work/cvg-gitleaks-stable-20261023/candidate`.
Código: `tests/gitleaks-reviewed-boundaries.integration.mjs`, somente nela.
Root3704 e candidatas dos outros agentes preservados; nada publicado até aqui.

## GHCR

Objetivo autorizado pelo pedido atual: papelWrite somente para o repositório
`ricardoakinaga-dev/cvg-operational-harness` no pacote homônimo, na seção
Manage Actions access, mantendo visibilidade privada e os demais acessos.

[Abrir configurações do pacote](https://github.com/users/ricardoakinaga-dev/packages/container/cvg-operational-harness/settings).
Local: Manage Actions access → Add repository, caso ausente → selecionar o
repositório → papelWrite → salvar → conferir linha e papel salvos.
É o acesso do pacote ao workflow; só vincular a origem do pacote ao repositório
não concede necessariamente esse papel. Referência:
[documentação GitHub](https://docs.github.com/en/packages/managing-github-packages-using-github-actions-workflows/publishing-and-installing-a-package-with-github-actions).

Bloqueio observado: inventárioCUA retornou `apps:[], browsers:[]`; tentativas
de criar abaIAB eChrome deram `Browser is not available`. O usuário escolheu
conectar navegador autenticado, mas as consultas seguintes continuaram vazias.
Sem sessão disponível não foi possível aplicar nem verificarWrite. Nenhuma
credencial lida/criada, visibilidade alterada, merge ou publicação realizada.

## Estado dos PRs

Consulta registrada em `prs-latest.json`:22 em35a0bad4 e24 em4cfd9dbb, ambos
com REM21CIbar em andamento e sem falhas reportadas. Não contar essaCI como
prova da correção determinística ainda local. Os PRs podem evoluir: revalidar
SHA/checks antes de integrar; nenhum merge foi feito nesta unidade.

## Deltas prontos para99/20/30

Esses ledgers estavam modificados por outro agente; preservados pela regra5.

- **99:** taskGITLEAKS-STABLE-20261023 implementada/revisada/focaisPASS,
  integração eGHCRbloqueados por publicação/CI própria e sessão indisponível.
  `last_completed_action`: fixturesv1, repro stopword,2runs32pares,
  controle32rejeições,82policy,type/lintPASS,reviewAPPROVEsemobrigatórios.
  `next_action`: obter autorização de push do candidato revisado e conectar
  navegador autenticado para salvar/conferirWrite no pacote.
- **20:** registrar provas do pacoteGITLEAKS-STABLE-20261023. Dependências
  instaladas só na candidata, lockintacto; falha inicial por dependência
  ausente preservada. Nenhum gateglobal/PG/container/serviço nem merge/release.
  Revisor encerrado, candidata própria preservada.
- **30:** adicionar cartão0396P1, `IMPLEMENTED_REVIEWED_FOCAL_PASS`, sem
  fechar até integrar e qualificar; separar permissãoGHCR do defeito de teste.
