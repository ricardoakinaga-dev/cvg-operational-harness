# UNBLOCK-CLAUDE-20261022 — resultado e continuidade

Status da unidade: verificação e preparação documental concluídas; **BUILD e
release não liberados**. Fonte publicada inspecionada: main `420b97b3`;
checkout compartilhado `3704e3f8` preservado. Evidências:
[pacote](../../04_audit/evidence/UNBLOCK-CLAUDE-20261022/inputs.json).

## O que foi resolvido ou corrigido

1. **Incidente do scan:** confirmadas as duas neutralizações e seu registro no
   PR22, sem alteração de `.gitleaks.toml`, `.gitleaksignore` ou manifesto de
   exceções em relação à main. Repetido gitleaks oficial8.28 no intervalo
   `420b97b3..176c1bdf`: exit0, zero achados. Não há prova aqui de segredo real;
   o registro original identifica a fixture `sub=synth`.
2. **Código de saída mascarado:** reprodução comprovou scanner=1/pipeline=0.
   Procedimento corrigido retém o status do processo antes de mostrar o log:
   detecção1, intervalo limpo0, histórico contaminado1, configuração quebrada1,
   binário ausente127 e argumentos ausentes64. Sem mudar regra ou instalar hook.
   [Procedimento reutilizável](../../04_audit/evidence/UNBLOCK-CLAUDE-20261022/scan-before-publish.sh),
   [prova reproduzível](../../04_audit/evidence/UNBLOCK-CLAUDE-20261022/verify-scanner-exit.py),
   [resultado](../../04_audit/evidence/UNBLOCK-CLAUDE-20261022/scanner-exit-proof.json).
3. **Relato dos43FAIL:** é o checkpoint `5e3b51bd` de18/10, não a situação
   atual dessas suítes. A correção `410e0111` usa corpus histórico verificado
   para fixtures, mantendo pins, checker, negativos e sem skip. As duas suítes
   atuais passaram novamente **93/93**, sem dist. Seus bytes e helper foram
   comparados com main420. Isso não fecha Q01/M1 nem qualifica a fundação.
4. **CodeQL do PR20:** localizado alerta33 `js/insufficient-password-hash`,
   `oidc-config.ts:229–248`. SHA-256 identifica versão da configuração; os
   campos calculados são issuer, clientId, policy MFA e matriz de autorização.
   `clientSecret` e chave do cookie ficam fora. Testes de configuração99 e
   autoridade34 passaram, incluindo invariância após troca desses segredos.
   [Triagem e justificativa prontas](../../04_audit/evidence/UNBLOCK-CLAUDE-20261022/codeql-triage.json).
   Usuário autorizou **“Encerrar #33 como falso positivo”**. Alteração realizada
   e confirmada por nova leitura: `state: dismissed`, `false positive`, em
   23/10 às02:34:47UTC. `CodeQL` agregado passou e PR20 ficou `CLEAN`, sem
   falhas. [Autorização](../../04_audit/evidence/UNBLOCK-CLAUDE-20261022/codeql33-human-authorization.json),
   [readback](../../04_audit/evidence/UNBLOCK-CLAUDE-20261022/codeql33-dismissal-readback.json).
   A primeira chamada422 por limite280caracteres não teve efeito; justificativa
   abreviada aceita na segunda. Nenhuma regra/query/policy foi alterada.
5. **Revisão Codex da SPEC0255 r3:** **REVISE**, dois obrigatórios. SK10c-new
   exige `SELECTED` para ferramenta fora do grant, contradizendo o contrato;
   preservar mensagens brutas do loader pode expor chave hostil com caminho e
   segredo. Invariantes mantidos, provas/saída precisam de ajuste. O
   [patch proposto](../../04_audit/evidence/UNBLOCK-CLAUDE-20261022/0255-proposed-corrections.patch)
   foi aplicado e conferido por hash apenas em cópia privada. A SPEC e a
   candidata do Claude permanecem intactas. O parecer é do Lead/Codex; scout
   foi insumo de leitura, não avaliador paralelo do programa.
6. **PAR-K05:** criada a
   [SPEC0256 r1](../../02_spec/0256_pare100_declarative_profiles_presets.md),
   com contrato, autoridade, herança, snapshots por sessão, erros seguros,
   oito cenários positivos/negativos e gates. É proposta técnica, com pontos
   ainda explícitos sobre port de sessão/K04, limites e exports. Não houve
   BUILD, aprovação humana ou fechamento do cartão.

Provas focais consolidadas: **226PASS,0FAIL,0SKIP** em Node22.23.2:
93 boundaries +133 OIDC. Fonte PR20 `c717ba24`, em snapshot privado; não é
certificação global. [Saída original](../../04_audit/evidence/UNBLOCK-CLAUDE-20261022/focused-vitest.json),
[vínculos de fonte](../../04_audit/evidence/UNBLOCK-CLAUDE-20261022/source-bindings.json).

## Uso do procedimento de scan

O log é privado e o intervalo deve ser o que será publicado. Antes de cada
publicação, congelar e conferir base/HEAD; não reutilizar resultado se mudar
qualquer commit. Exemplo, na candidata já revisada, com `BASE` e `HEAD`
explicitamente definidos e gitleaks8.28 no PATH:

```bash
scan_log=$(mktemp)
if bash docs/04_audit/evidence/UNBLOCK-CLAUDE-20261022/scan-before-publish.sh \
  "$scan_log" gitleaks git . --log-opts="$BASE..$HEAD" \
  --config=.gitleaks.toml --redact=100; then
  printf 'Scan aprovado para o intervalo informado.\n'
else
  scan_rc=$?
  printf 'Publicação bloqueada; scanner/log falhou: %s\n' "$scan_rc" >&2
  exit "$scan_rc"
fi
```

Este procedimento não faz push. O chamador deve condicionar a publicação ao
seu sucesso; encadear um push incondicional ou canalizar o próprio wrapper a
`tail` sem preservar status recria o erro. Não usar `--exit-code=0`, regra
desativada ou allowlist para fazer a prova passar. Neutralizar só o HEAD não
limpa commits antigos no intervalo; o controle histórico permanece vermelho.
Dois ensaios preliminares com fixture inadequada não detectaram JWT e não
recebem crédito; a rodada final tem controle positivo real exit1 e os demais
negativos. A falha preliminar e seus logs privados foram preservados.

## Bloqueios atuais e ordem executável

- **Q01/M1:** captura0238 já foi integrada pelo PR5; não pedir novamente aquela
  aprovação nem refazer J07. Persistem comparador semântico Read, RC10/parte
  externa deRC11 e jornada M1 com reusos integrados e qualificados. Recuperar a
  fundação aprovada em candidata isolada antes de integrar: `0029` já pertence
  ao escopo por caso na main, enquanto a fundação usa outra migration0029.
  Inventariar/renumerar e requalificar a cadeia sob seu gate; não copiar SQL
  antigo diretamente nem editar selos históricos.
- **K05:** PAR-K04 é pré-requisito canônico. Recuperar os ajustes aprovados de
  SPEC0222, conferir sua entrega atual e fechar o port de sessão na0256. Só
  então revisão técnica e humana T3 da0256 congelada. Não há aprovação de K05
  por associação à0222 ou0200.
- **0255:** autor Claude/CONT-D9EF recebe F01/F02 e patch. Após dois retrabalhos
  já consumidos, registrar replanejamento, sem zerar orçamento. Nova revisão,
  novo hash, crítico sem obrigatórios, revisão dos aceites pelo Codex e gate
  humano T3; também Q01/M1 e K05 entregues. O APPROVE antigo não cobre o patch.
- **CodeQL33:** resolvido com autorização específica do usuário, mesmo
  alerta/HEAD revalidados e readback confirmado. Sem nova ação pendente.
- **Release:** é frente distinta da0255. Na consulta registrada, PR19 verde;
  PR20 inicialmente tinha as cinco condições obrigatórias verdes, mas
  `CodeQL` agregado falhando por alerta33 (`UNSTABLE`); após triagem autorizada,
  o agregado ficouverde e oPR20 `CLEAN`. PR16/18/21/22 ainda na
  `REM21 CI bar`. Os cinco checks protegidos incluem `codeql` minúsculo, que
  passou; o agregado `CodeQL` é outro check. Não confundir execução da análise
  com ausência de achado. Nenhum merge ou publicação foi feito nesta rodada.
  A entrada do18 é necessária para o prazo300min, mas o workflow0253 ainda
  exige todas as próprias pré/pós-condições na main; não basta mergear18.

Consulta datada dos PRs:
[prs-latest.json](../../04_audit/evidence/UNBLOCK-CLAUDE-20261022/prs-latest.json).
O estado do GitHub pode evoluir; revalidar SHA/checks antes de qualquer merge.

## Entradas prontas para ledgers compartilhados

99/20/30 já estavam modificados por outro agente; preservados conforme regra5.
O dono desses arquivos pode aplicar estas entradas sem substituir histórico:

- **99:** `UNBLOCK-CLAUDE-20261022`, status `BLOCKED` no objetivo amplo;
  `last_completed_action`: gitleaks8.28 PR22 exit0 sem afrouxar regras;
  procedimento de status aprovado por controles positivos/negativos;
  226focaisPASS/zero skip;43FAIL históricos corrigidos, sem fecharQ01;
  revisão0255REVISE2obrigatórios com patch privado validado;0256r1proposta.
  `next_action`: encaminhar replanejamento0255 ao autor e recon K04/port de
  sessão0256; CodeQL33 encerrado com autorização, PR20CLEAN; CI/release separados.
- **20:** registrar os comandos/resultados nos artefatos vinculados acima;
  nenhuma aplicação/schema/lockfile/regra alterada; somente triagem remota33
  autorizada e confirmada, sem push/merge/release,
  PG/container/provider ou certify/E2E/SBOM/licenses executado. Agentes readonly
  encerrados; snapshots e logs próprios preservados.
- **30:** corrigir a causa do bloqueioQ01: retirar43FAIL como diagnóstico atual,
  preservando checkpoint histórico; Q01 continuaIN_PROGRESS. PAR-K05 continua
  TODO com SPEC0256 em revisão técnica; 0255 aguarda correções/replanejamento,
  gates e dependências. Não marcar estes cartões comoDONE.
