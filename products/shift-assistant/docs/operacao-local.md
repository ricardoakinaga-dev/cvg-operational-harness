# Operação local do consumidor

Estado: procedimento da extração T2, para ambientes sintéticos. O piloto requer
correções, provas e decisão do candidato conforme o [backlog próprio](backlog.md).

## Build e verificação

Na raiz, usando Node22 e dependências do lockfile:

```bash
npm run test:shift-assistant
npm run build:shift-assistant
npm run demo:shift-assistant
```

O build compila shared/model-gateway por exports públicos antes de empacotar o
entrypoint. A demo cria sua própria pasta temporária e simuladores de canal/modelo;
não usa o sandbox persistente. Para executar somente este processo: `npm start`
dentro de `products/shift-assistant`, após build e configuração.

## Configuração e dados separados

Use `deploy/.env.example` como referência e mantenha os valores privados fora do
controle de versão. O compose está em `deploy/compose.yaml`; contexto de build é
o monorepo. Escolha explicitamente um projeto Compose e portas livres para o
ambiente de teste. Cada projeto deve usar seu volume próprio; não apontar para
volumes/processos existentes para testar essa extração.

No workspace, uma inspeção local sem subir serviços:

```bash
docker compose -p cvg-shift-synthetic -f deploy/compose.yaml config --no-interpolate
```

Após criar a configuração sintética e conferir os recursos, use o mesmo `-p`
para construir, subir e parar somente esse ambiente. A porta default é3400;
o sandbox existente3400/3401 não pode ser reiniciado por esta rodada.

Journal e mídia em `/data` são documentos do consumidor. Build/move não migram,
apagam ou reutilizam dados. A configuração da extração mantém tick60s; o scheduler
de1–5s com prova de entrega pontual é proposta T3, ainda sem BUILD.

## Interrupção e recuperação

Parada: enviar SIGTERM ao processo/contêiner específico e acompanhar sua saída.
Pausa pelo comando gerencial atual é limitada pela fila de rede; a pausa independente
e a saúde detalhada serão qualificadas em PISO006. Falha/incerteza de envio deve
ser investigada antes de repetir; não confirmar rascunho por efeito do restart.

Conservar journal/mídia originais e inventário hash-bound antes de diagnóstico.
Recuperação automática de cauda truncada, migraçãoV2, outbox durável, backup/restore
e alerta recebido estão especificados em0179 e pendentes de implementação/prova.
Não executar o procedimento proposto como se já existisse no binário atual.

## Aceites distintos

Build/imagem/demo comprovam o artefato estrutural. PISO007 ainda exige imagem sem
shell e controle efetivo de egress. PISO008 exige restore/alerta executados.
PISO009 exige guia validado e áudios; PISO010 exige candidato aprovado e duas semanas
de acompanhamento. Esses resultados não são herdados da certificação do harness.
