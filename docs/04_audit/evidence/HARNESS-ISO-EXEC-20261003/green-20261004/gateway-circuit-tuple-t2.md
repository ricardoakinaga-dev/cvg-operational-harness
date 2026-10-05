# Gateway — isolamento de circuitos por tupla (T2)

Task GATEWAY_CIRCUIT_TUPLE_R1, continuidade local autorizada. Revisão válida R9 reproduziu no SDK congelado e recompilado uma colisão: provider/model alpha/beta:gamma e alpha:beta/gamma compartilham alpha:beta:gamma. Um circuito aberto bloqueia o segundo provider saudável.

Scope: gateway.ts e teste próprio, scratch isolado. Serializar componentes sem ambiguidade, preservando chaves diagnósticas dos pares existentes sem delimitador/escape. Escapar percent antes de dois-pontos garante inversão única e não muda keys comuns. Não alterar schema, APIs, enum, observers, estados/limites/probe/cancel/retry ou assertivas originais.

Pronto: novos pares com colon/percent não interferem em OPEN/HALF_OPEN/CLOSED, regressões originais verdes, readonly/hashes preservados, typecheck/lint e SDK realmente recompilado em nova revisão independente. Somente sintético/local; NO_MODEL/T4/condições de promoção mantidos.
