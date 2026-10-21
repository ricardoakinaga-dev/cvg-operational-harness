# Crítico independente R1 — AUD0621-PRODUCT-BUILD-20261020

Agente general-purpose novo, sem herdar contexto, somente leitura, sobre a árvore
não commitada da candidata `/mnt/dados/cvg-work/cvg-aud0621-product-20261020`
(base `6c9fc6517f`). Efeito colateral declarado pelo crítico: `tsc --noEmit` criou
`products/shift-assistant/tsconfig.tsbuildinfo` (ignorado pelo git); removido
pelo executor antes do reparo.

**VEREDITO: REJECT**

Rodou a suíte do produto com Node 22.23.2: 9 arquivos, 82 testes verdes;
typecheck do produto verde.

## Obrigatórios

1. F07 — orçamento de retry zera quando a falha alterna de estágio
   (`assistant.ts` `attempt = previous && previous.stage === stage ? ... : 1`) e o
   aviso "vou tentar de novo" sai a cada `attempt === 1`. Reproduzido: download
   falhando nas tentativas ímpares e Whisper sempre falhando → 31 downloads após
   30 ticks, mensagem pendente, 31 avisos. Contraria SPEC0179 §6 (sem loop
   ilimitado). Correção: contador por mensagem sem reset, aviso uma vez, teste
   alternando estágios.
2. F09 — dois homônimos sem ID na mesma nota recebem o mesmo ID lembrado
   (`#resolvePatientIds` completa cada um isoladamente; `bindPatient` só bloqueia
   quando a pendência cita o nome). Reproduzido: nota confirmada "Rex ID 101";
   nova nota com dois "Rex" sem ID → rascunho mostra "Rex · ID 101" duas vezes e
   `ok` confirma. Contraria SPEC0179 §4. Correção: nome repetido na nota não é
   completado pela memória e bloqueia a confirmação, com teste.
3. F25 — prova da imagem feita com bundle anterior (sha `a55b9f…`, 21:49) sem a
   guarda `notePending` do `#confirm`; relatórios não registram sha do bundle nem
   do Dockerfile. Correção: reconstruir da árvore final, rodar de novo os scripts
   e gravar os hashes.

## Corretos segundo o crítico

F08, F10, F11, F18, F21 (produto) e F24 corretos na fronteira do produto
(detalhes: rascunho até `ok`, revalidação de destinatário, reserva durável sem
yield, cauda isolada com cópia verificada, leituras limitadas com prazo até o fim
do corpo, pausa síncrona, readiness 503, stop limitado, CLINICAL fixo negado pelo
gateway antes do provider com zero chamadas, seam de teste inacessível a
`main.ts`). F25: receita e compose coerentes; documentação honesta sobre o que
falta no host. Testes antigos alterados refletem mudanças de contrato
justificadas.

## Opcionais / residuais apontados

- Comentário/doc dizem que "linha inválida" falha fechado, mas linha de tipo
  conhecido com schema inválido é aplicada (validação estrita fica para V2).
- Queda entre criar o sucessor e renomear o manifesto em `#isolateTail` deixa
  EEXIST permanente.
- Resultado tardio de envio após `adiar` se aplica à nova janela.
- Falsos 503: `inbox_stalled` por idade de mensagem com backlog saudável; tick
  acima de ~180 s; `job_deadline_exceeded` contando o tempo da resposta.
- Webhook: os 4 slots de leitura também barram a pausa; excesso de conexões
  derrubado em silêncio; timeout de corpo vira ECONNRESET em vez de 408.
- Não-gestor recebe resposta de controle durante a pausa.
- Exemplo nft filtra todos os membros da bridge por `iifname` (derrubaria o
  webhook canal→assistente); não provado no host.
- `.env` em `products/shift-assistant/deploy/` entra no estágio de build via
  `COPY products` (o `.dockerignore` da raiz só casa `.env` na raiz).
- `LLM_API_KEY` obrigatória com `LLM_LOCATION=external` mesmo sob NO_MODEL.
- `WHISPER_URL` local só garantido pela rede.
- Rollback: binário antigo ignora linhas `transaction` e sucessores.
- Rascunho só de anexo torna o `ok` simples ambíguo.
- Lacunas de teste: P10 via webhook, contador no teste de restart, dois
  schedulers em processos distintos, gzip, redirect, chunked de entrada, corpo
  gotejado.
- Itens da SPEC deixados abertos e corretamente declarados.
