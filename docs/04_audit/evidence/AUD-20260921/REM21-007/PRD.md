# REM21-007 — PRD — proteção de chaves e budgets

## Problema

O rate limiter distribuído expõe a chave operacional no armazenamento e perde
o vínculo do budget quando o mecanismo de cardinalidade remove um bucket ainda
ativo. O controle precisa proteger privacidade sem permitir que rotação,
reinício, churn ou eviction indevida restaurem uma cota.

## Resultado desejado

Instâncias configuradas com o mesmo keyring compartilham uma identidade HMAC
opaca, atualizam o mesmo budget durante a rotação e somente liberam espaço
quando a janela expirou. Falta de capacidade é fail-closed e observável apenas
como rate limit, sem ecoar a chave.

## Requisitos de produto

- `PR-01`: normalizar e validar a chave na borda, sem armazenar sua forma bruta.
- `PR-02`: derivar `budget_key` por HMAC-SHA-256 e manter `key_version` e
  `key_digest` versionados.
- `PR-03`: permitir uma chave ativa e anteriores controladas; trocar a chave
  ativa não pode resetar o mesmo budget lógico.
- `PR-04`: manter `count` e `reset_at` atômicos entre instâncias PostgreSQL.
- `PR-05`: remover somente buckets expirados; jamais remover um bucket com
  `reset_at > now()` para abrir espaço.
- `PR-06`: quando todos os buckets estiverem ativos, negar novos subjects sem
  desalojar os existentes.
- `PR-07`: exigir configuração explícita de keyring fora do perfil de teste;
  fixtures controladas podem usar somente material sintético.
- `PR-08`: preservar a compatibilidade do envelope HTTP `429` e o fail-closed
  já existente para falhas do store.

## Critérios de aceite

| ID    | Critério verificável                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-01 | Linhas PostgreSQL e valores SQL não contêm a chave sintética em claro; `budget_key`/`key_digest` são hex HMAC de 64 caracteres.                  |
| AC-02 | Dois limiters com keyrings rotacionados, mas mesmo `budgetSecret`, observam o mesmo `count` e `reset_at`; a versão ativa é atualizada sem reset. |
| AC-03 | Churn com `maxBuckets=2` não permite que um terceiro key remova os dois budgets ativos; o terceiro recebe falha de capacidade.                   |
| AC-04 | Após `reset_at`, o bucket pode iniciar nova janela; antes disso, uma operação no mesmo subject continua limitada.                                |
| AC-05 | Instâncias distribuídas usam a mesma linha lógica e a concorrência não cria budgets paralelos para o mesmo key.                                  |
| AC-06 | Migração forward-only remove a coluna plaintext e o preflight exige as colunas/constraints novas.                                                |
| AC-07 | Configuração ausente/inválida falha fora de `NODE_ENV=test`; nenhum segredo real é introduzido.                                                  |
| AC-08 | Suíte focada, typecheck, lint, formato, links e regressão proporcional passam em Node 22.                                                        |

## Fora de escopo

IdP, produção, segredo real, alteração de política de produto, sincronização
externa de keyring, observabilidade externa, reconfiguração de RLS ou qualquer
consulta/efeito clínico, financeiro ou de prontuário.

## Riscos e mitigação

- troca acidental do `budgetSecret` equivale a uma nova identidade: a
  configuração valida o campo separadamente e a SPEC documenta que essa troca
  exige migração planejada;
- o advisory lock serializa a decisão de capacidade, mas continua limitado a
  uma operação curta e sem payload bruto;
- a migration limpa somente estado efêmero do limiter ao remover o schema
  plaintext; não há perda de dado de negócio.

## Gate

`PRD_COMPLETE / SPEC_APPROVED_CONTROLLED_BUILD`.
