# Crítico independente R2 — AUD0621-PRODUCT-BUILD-20261020

Agente general-purpose novo, sem herdar contexto, somente leitura, sobre a árvore
final (pós-reparo único agrupado da R1) da candidata
`/mnt/dados/cvg-work/cvg-aud0621-product-20261020`, base `6c9fc6517f`. Rodou a
suíte do produto (9 arquivos, 86 testes verdes, Node 22.23.2) e sondas próprias
no scratchpad importando o `src` da candidata, sem alterá-la.

**VEREDITO: APPROVE** — nenhum obrigatório.

- Os três obrigatórios da R1 estão corrigidos e têm testes que reprovam se o
  defeito voltar (mutantes R1a/R1b mortos).
- F07: orçamento por mensagem confirmado também com restart a cada rodada e
  estágios alternando (5 downloads, revisão, 0 pendentes).
- F09: homônimos na mesma nota, com e sem ID, com acento/caixa diferentes,
  bloqueiam; leito divergente não completa pelo nome.
- F25: sha do bundle (`65e4f451…`) igual ao `programSha256` do contrato; sha do
  Dockerfile e do `Dockerfile.dockerignore` iguais ao cabeçalho do log; mesmo
  `imageId` no contrato, na prova de egress e no autoteste.
- Sem regressão nem violação de segurança em F07–F11, F18, F21 (produto), F24,
  F25.

## Opcionais / residuais (não aplicados após a R2; registrados)

1. `ledger-delta.md` desatualizado (tentativas "por estágio", 24 de 27 mutantes);
   orçamento por mensagem é mais restrito que a SPEC0179 §6 ("por estágio") e deve
   constar como desvio deliberado. — Corrigido no ledger-delta (evidência).
2. Comentário em `assistant.ts` acima de `RETRY_DELAYS_MS` ainda fala em "failure
   of a stage"; estágio `'reply'` de `ProcessingStage` não é usado.
3. Folga do `inbox_stalled`: o intervalo do scheduler é somado também a mensagens
   novas (tick 60 s → alarme após 300 s, SPEC 8.3 pede >240 s; tick 3600 s →
   ~64 min). Sugestão: somar o intervalo só quando a elegibilidade vem de
   `nextAttemptAt`.
4. Lacunas de teste: `inbox_stalled` e `job_deadline_exceeded` sem teste; o teste
   de restart não prova a preservação do contador; reuso do sucessor vazio em
   `#isolateTail` sem teste (sonda do crítico mostra que funciona).
5. Imagem provada com o estágio de build substituído por `--build-context`; falta
   build pela receita completa em CI/host.
6. Exemplo nft: a regra `:3400` aceita qualquer membro da bridge; o drop de IPv6
   atinge todos os membros (compose desativa IPv6); não provado no host.
7. Pendências já apontadas na R1: `WHISPER_URL` não restrito a destino local no
   código (só a rede interna impede); 4xx de download (inclusive 408/429) tratado
   como permanente; timeout de corpo do webhook vira ECONNRESET; crash-loop em
   `#isolateTail` copia o segmento a cada tentativa; `ok` simples logo após a nota
   pode confirmar rascunho ainda não visto (token/recibo de preview no PISO-001).
8. Honestidade: `operacao-local.md` e comentários do store corretos.
