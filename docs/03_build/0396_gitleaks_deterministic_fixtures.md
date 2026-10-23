# GITLEAKS-STABLE-20261023 — estabilizar as fixtures dos controles nativos

Task separada, prioridade P1. Trilha T2: correção de dados de teste, sem mudar
detector, regra, exceção, threshold, política ou comportamento de aplicação.
Estado: `IMPLEMENTED_REVIEWED_FOCAL_PASS`, integração pendente;
fonte main `9a56a9c9`, 23/10/2026.

## Recon e SPEC curta

`tests/gitleaks-reviewed-boundaries.integration.mjs` gera substitutos hexadecimais
aleatórios para os 32 pares atuais de exceções exatas (29 no checkout histórico).
A distribuição garante entropia
superior a3,97, mas não garante que o token passe pelas demais heurísticas do
detector. A configuração padrão8.28 do `generic-api-key` também tem stopwords;
uma permutação pode conter `dead` e ser ignorada legitimamente. A coordenação
registrou falhas nos pares3/14 dos PR22/24; não há sementes desses incidentes,
portanto não é possível atribuir seus bytes exatos sem inventar evidência.

Hipótese confirmada com gitleaks8.28: construídas duas fixtures com mesma distribuição de
caracteres e entropia, uma incluindo stopword, e comparar no gitleaks8.28 real.
Ambas têm entropia3,97095059; a que contém `dead` retorna0/zeroachados e a outra
retorna1/`generic-api-key`. Registro em `stopword-repro.json`, sem imprimir tokens.

## Correção proposta

- Substituir o shuffle criptográfico por corpus determinístico de40hex,
  representado por segmentos para não publicar um literal que pareça segredo.
  Identificar a fixture no diagnóstico por versão e índice, sem imprimir token.
- Evitar stopwords conhecidas por construção; não modificar a lista upstream.
- Diferenciar os casos de substituição, Sourcegraph moderno/legado e GitHub
  por rotações determinísticas. Garantir que o substituto não seja nenhum
  literal aprovado. Colisão deve falhar, nunca entrar em loop de nova geração.
- Provar comprimento, charset e entropia dos40hex e do prefixo36hex usado no
  PAT sintético; todo template continua passando pelo detector nativo esperado.
- Manter os32pares atuais, controles defaults/configuração real, seis limites,
  detectores de outro provedor, pin8.28, limites de processo/tempo, isolamento
  de ambiente, limpeza e proteção contra drift. Sem skip ou retry automático.

## Caminhos e recursos

Escrita de código somente na candidata própria
`/mnt/dados/cvg-work/cvg-gitleaks-stable-20261023/candidate`, no teste citado.
Um helper builtin-only só se necessário. Código de aplicação, regras e
manifestos são readonly. Pacote de evidências próprio
`docs/04_audit/evidence/GITLEAKS-STABLE-20261023/` e handoff próprio; ledgers
compartilhados já modificados são preservados conforme regra5.

## Aceite e provas

1. Repro local distingue controle com stopword de fixture realmente detectável.
2. Duas execuções do teste produzem os mesmos identificadores de fixture e
   32/32pares aprovados, zero skip; todos os negativos continuam exigindo o
   detector e caminho corretos, não apenas qualquer achado.
3. Alterar o grant de exceção para aceitar substituto deve reprovar o controle
   na cópia privada, sem mudar regras publicadas.
4. Typecheck, lint e testes de policy/regressão pertinentes verdes; registrar
   separadamente o que não foi executado. Integração só após gatesT2/CI no SHA
   real: nenhuma certificação ou suíte global herdada de outro PR.
5. Revisão do diff e scanner da alteração, sem segredo real nem nova exceção.

## Frente operacional distinta: GHCR

Pedido do usuário: conceder Write somente ao repositório
`ricardoakinaga-dev/cvg-operational-harness` no pacote homônimo via
`Manage Actions access`. Browser indisponível no inventário e IAB indisponível;
usuário escolheu conectar sessão autenticada. Não alterar credencial,
visibilidade do pacote, proteção de branch ou outros acessos. Confirmar na UI
o repositório e papel efetivamente salvos. Publicação/release é gate separado.

## Verificação local e continuidade

- Dois runs nativos:32/32pares,34testesPASS,0FAIL,0SKIP por run; corpus
  `hex-interleaved-v1` reproduzível pelo ordinal do par/finalidade.
- Controle negativo em cópia privada: allowlist global que ignora tudo é
  rejeitada nos32pares, exit1. Nenhuma configuração publicada foi alterada.
- Policy:82PASS. Typecheck e lint exit0. A primeira tipagem, antes de instalar
  a closure correta do lockfile, falhou por ausência de openid-client; preservada
  e corrigida com npmci próprio, sem alterar o lockfile.
- Crítico fresco readonly: `APPROVE_SCOPED_FIX`, zero obrigatórios. App, regras,
  manifesto, helper e lockfile byteidênticos à main9a56.
- Npmtest completo, PostgreSQL, E2E e certify não executados nesta unidade.
  Focais não substituem os gatesT2: integração aguarda CI do candidato real.
- Provas: [verification.json](../04_audit/evidence/GITLEAKS-STABLE-20261023/verification.json),
  [repro da stopword](../04_audit/evidence/GITLEAKS-STABLE-20261023/stopword-repro.json),
  [revisão](../04_audit/evidence/GITLEAKS-STABLE-20261023/critical-review.json).
  A lista de stopwords é parte da
  [regra padrão fixada em8.28](https://github.com/gitleaks/gitleaks/blob/v8.28.0/config/gitleaks.toml#L567).

Próxima ação: publicação por PR separado após autorização de push; manter o
cartão aberto até integrar com checks verdes. AcessoGHCRWrite aguarda navegador
autenticado acessível ao Codex; tentativasIAB/Chrome retornaram indisponível.
