# REM21-014 — DECISION RECORD

## Decisão

Criar uma configuração de browser proof separada e trusted, com Chromium,
Firefox e WebKit declarados, para não misturar a suíte histórica de simulação
com a qualificação do achado `A21-F16`. A autoridade da spec será a sessão
HttpOnly emitida pelo API a partir de token assinado sintético; campos editáveis
e headers de identidade ficam fora do caminho qualificado.

## Alternativas rejeitadas

- expandir diretamente a suíte histórica, que hoje depende de controles de
  simulação e snapshots somente Chromium;
- declarar Firefox/WebKit no nome do projeto sem instalar/executar os browsers;
- filtrar somente `serious`/`critical`, deixando a violação `moderate` fora da
  barra;
- usar um IdP ou segredo externo, pois isso exigiria G21-5, owner e autorização
  não disponíveis nesta rodada.

## Consequência

O proof fecha a lacuna local de matriz e UX trusted, mas não promove a barra
integral nem cria autorização produtiva. A certificação final, I1, freeze,
signoff e produção seguem `NO_GO`.
