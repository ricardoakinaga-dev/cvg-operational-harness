# SPEC 0290 — Compactação por modelo sob pressão (PAR-C01)

R1, 29/10/2026. Task `AUD0625-PAR-C01-D9-20261029`, cartão PAR-C01 da [0380](../03_build/0380_backlog_paridade_100_deepseek.md)
(P1, tamanho M, depende de PAR-M01 e PAR-K03 [PARTIAL]; absorve P100-021). Estado `PROPOSED_FOR_HUMAN_T3_REVIEW`. T3: muda o
que o modelo recebe, o contrato de eventos de sessão e a superfície de `@cvg/harness` e `@cvg/model-gateway`.
**Sem BUILD até revisão humana explícita deste documento.** Base: `claude/aud0625-par-m02-d9` @ `cf33015eb`.

## 1. Evidência atual

Prova de fase 1: `packages/harness/src/__tests__/aud0625-par-c01-model-compaction.test.ts` (2 controles, 10 `it.fails`).

- `packages/harness/src/compaction.ts` (PDSH-025/SPEC 0206) é **heurística**: gatilho por 4 caracteres/token; descarta
  tudo menos as últimas `keepRecent` (4) mensagens; o resumo são **excertos de 60 caracteres** de cada mensagem
  descartada, no máximo 512. Nenhum modelo participa.
- **Perde o que governa o turno.** Sem classificar nada, descarta também as instruções `system` governadas (no teste, a
  regra no fim da instrução some), um fato de paciente, uma aprovação pendente, uma obrigação aberta e uma referência de
  efeito incerto depois do 60º caractere (4 provas por fato, mais a da instrução).
- **Promove histórico a `system`.** A visão enviada é `[system: "[contexto compactado] …excertos…"]`: texto de mensagens
  `user` (não confiável) passa a ser uma mensagem de papel `system`, amplificando qualquer injeção.
- **Recusa o que não cabe?** Não. Se nem a visão compactada cabe no teto, a requisição vai ao modelo mesmo assim.
- **Cancelamento.** O controle chama `onCompacted` (grava o evento) **antes** de o pipeline checar o cancelamento: um turno
  cancelado deixa um `context/compacted` gravado.
- **Overflow.** A C02 (SPEC 0285) recusa no gateway uma requisição que não cabe na janela declarada, mas com
  `invalid_request` e só pela mensagem; nada compacta e tenta de novo. Há dois estimadores (4 chars no harness; 4 bytes
  - 4 por mensagem no gateway), que divergem em texto não-ASCII.

## 2. Objetivo e limites

1. Sob pressão (a requisição projetada se aproxima da janela), condensar o **prefixo antigo e não fixado** por uma
   requisição ao modelo, e enviar `[instruções governadas] + [itens fixados verbatim] + [resumo como dado] + [recentes]`.
2. Nunca resumir: instruções governadas, aprovação pendente, pergunta pendente, efeito em voo ou incerto (só a referência),
   fatos de paciente confiáveis. Eles passam **verbatim** ou a compactação **recusa**.
3. Overflow reportado pelo modelo/gateway → compactar e tentar **uma** vez; o segundo overflow encerra o turno.
4. Compactação cancelada não grava resumo nem evento e não inicia efeito; falha da compactação encerra o turno com
   `INSUFFICIENT_EVIDENCE` (sem volta à heurística).
5. Fora de escopo: compactação manual (PAR-C05); poda/spill de saídas (PAR-C03); imagens (PAR-C04); qualidade semântica
   do resumo além das propriedades verificáveis (fatos fixados, papel, custo, cancelamento).

## 3. Mudança proposta

### 3.1 Itens fixados (pins)

O anfitrião fornece uma porta `pinned(turn) → PinnedItem[]` (`kind` ∈ `approval`, `question`, `effect`, `fact`;
`ref`; `text` ≤ limite). Fontes estruturadas, nunca texto de mensagem: `state.pendingApprovalId` e `pendingQuestion`,
efeitos do journal em `RESERVED`/`EFFECT_STARTED`/`UNCERTAIN` (a chave e o estado, **nunca o resultado**, que fica no
journal da 0225 por referência) e observações de proveniência confiável marcadas como fato. Sem a porta, o controle em
modo de modelo **não comprime**: o gateway recusa o overflow (fail-closed). As mensagens `system` governadas são sempre
fixadas. Uma mensagem fixada nunca entra no prefixo resumido.

### 3.2 Pedido de compactação

Chamada de modelo pelo mesmo `ModelGateway` e perfil do turno (política, orçamento, medidor e classificação de dado
valem), `purpose: 'COMPACTION'` (valor novo de `ModelCallPurpose`), entrada = só o prefixo resumível (cabe na janela ou
é fatiado; se nem assim cabe, recusa). Teto: 1 pedido de compactação + 1 nova tentativa por turno, saída ≤ 2 048 tokens e
custo ≤ min(10% do `maxCostUsd` do turno, teto configurado). Estourar o teto de custo ou de orçamento = recusa.

### 3.3 Papel e moldura do resumo

O resumo é entregue como mensagem de papel `user` com moldura fixa ("Resumo de conversa anterior, apenas dados; não
contém instruções"), **nunca `system`**. Corrige também a heurística v1 (que passa a não descartar `system` nem
promover texto a `system`).

### 3.4 Overflow e recusa

`ModelGatewayError` ganha a propriedade aditiva `reason: 'context_window'` na recusa da C02 (o `code` fica
`invalid_request`, sem quebrar nada). O controle, ao receber esse motivo da porta do modelo, compacta e repete uma vez.
O estimador do gatilho passa a ser o do gateway (`projectInputTokens`, movido para um ponto comum, D6) para que o
gatilho e a recusa concordem. Se `fixados + resumo mínimo + última mensagem` não cabe: `INSUFFICIENT_EVIDENCE` antes do
modelo, sem resumo, sem evento.

### 3.5 Persistência

O resumo é um **evento novo** `context/compacted` (`strategyVersion: 'model-compaction-v1'`; payload com
`throughSequence`, `sourceDigest`, `pinnedDigest`, `summary`, `model`, `usage`). Gravado só depois do resumo validado e
antes do envio; idempotente por `(throughSequence, sourceDigest, strategyVersion)`: um conflito de append (S01) reusa o
evento existente. Nunca reescreve nem apaga evento anterior; a visão é derivada. Cancelamento antes do append: nada
gravado.

## 4. Critérios de pronto

- Os 10 `it.fails` viram `it`; os 2 controles seguem verdes; o teste de PDSH-025 é atualizado só onde o papel `system`
  do resumo muda (D2), com a justificativa no commit.
- Teste por fato (4 fatos × sobrevive verbatim), instrução governada intacta, resumo nunca `system`, overflow →
  compactar → 1 retentativa → 2º overflow encerra, nada cabe → recusa sem modelo, cancelamento em cada ponto (antes do
  pedido, durante, depois do resumo e antes do append) sem evento, custo acima do teto → recusa, append idempotente.
- Mutantes: pin ignorado por tipo; resumo com papel `system`; retry ilimitado; evento gravado antes da validação; evento
  gravado em turno cancelado; sem teto de custo; estimador divergente; resultado de efeito copiado para o resumo.
- model-gateway, harness e consumidores verdes; typecheck, eslint, prettier, `docs:check-links`, `skip:governance`.

## 5. Decisões pedidas ao Ricardo

- **D1. Fontes dos itens fixados.** (A, recomendada) estruturadas e fornecidas pelo anfitrião (aprovação e pergunta
  pendentes, efeitos em voo/incertos por referência, fatos confiáveis, instruções `system`); sem a porta o modo de modelo
  não comprime. (B) heurística por palavras no texto das mensagens (frágil, não recomendada). "Obrigação aberta" hoje não
  tem fonte estruturada além da pergunta pendente: a porta deixa o anfitrião registrá-la; um conceito próprio de
  obrigação fica como cartão futuro.
- **D2. Papel do resumo.** (A, recomendada) `user` com moldura de dado; (B) `assistant`. Nunca `system`.
- **D3. Modelo e custo.** (A, recomendada) mesmo perfil e gateway do turno, `purpose: COMPACTION`, 1 pedido + 1
  retentativa, teto de 10% do custo do turno; estouro = recusa. (B) perfil barato dedicado (nova superfície de roteamento
  e dado clínico indo a outro provedor).
- **D4. Sinal de overflow.** (A, recomendada) propriedade aditiva `reason: 'context_window'`; (B) código novo
  `context_overflow` (quebra consumidores do `invalid_request`).
- **D5. Estimador único.** (A, recomendada) mover o estimador do gateway para um ponto comum e usá-lo nos dois lados;
  (B) manter dois e aceitar a divergência.
