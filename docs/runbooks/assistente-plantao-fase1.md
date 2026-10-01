# Assistente de Plantão — instalação e operação do piloto (fase 1)

Contrato: [SPEC 0177](../02_spec/0177_assistente_plantao_fase1_caderno.md).
Barra de produção: [0368](../03_build/0368_barra_proporcional_assistente_de_plantao.md).
Código: `apps/worker/src/shift-assistant/`.

## O que precisa estar rodando

1. **WhatsApp:** WAHA ou Evolution API com um **número dedicado** da equipe
   (não usar número pessoal nem o número de atendimento ao tutor).
2. **Whisper local** com API compatível com OpenAI
   (`POST /v1/audio/transcriptions`), por exemplo `faster-whisper-server` ou
   `whisper.cpp` em modo servidor. Fica na mesma rede do assistente.
3. **Modelo externo** com API compatível com OpenAI (`/chat/completions`) e
   contrato de tratamento de dados assinado. Só HTTPS.
4. **Disco persistente** para `SHIFT_DATA_DIR`, incluído no backup do servidor.

## Configuração

| Variável                                                   | Exemplo                                       | Observação                                                   |
| ---------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| `SHIFT_PROVIDER`                                           | `waha` ou `evolution`                         | Canal escolhido (D1)                                         |
| `SHIFT_MEMBERS`                                            | `5511900000001=Dra Ana;5511900000009=Gestor*` | Só estes números falam com o assistente; `*` marca o gestor  |
| `SHIFT_WEBHOOK_SECRET`                                     | 24+ caracteres aleatórios                     | Enviado pelo WAHA/Evolution no header `x-cvg-webhook-secret` |
| `SHIFT_DATA_DIR`                                           | `/var/lib/cvg-shift`                          | Registro de eventos e mídias; documentos (D4)                |
| `SHIFT_PORT`, `SHIFT_HOST`                                 | `3400`, `0.0.0.0`                             |                                                              |
| `SHIFT_TICK_SECONDS`                                       | `60`                                          | Frequência de verificação de lembretes                       |
| `WAHA_URL`, `WAHA_API_KEY`, `WAHA_SESSION`                 | `http://waha:3000`, chave, `default`          | Quando `SHIFT_PROVIDER=waha`                                 |
| `EVOLUTION_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` | `http://evolution:8080`, chave, `cvg`         | Quando `SHIFT_PROVIDER=evolution`                            |
| `WHISPER_URL`, `WHISPER_MODEL`                             | `http://whisper:8000`, `large-v3`             | Transcrição local (D2)                                       |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`                 | `https://.../v1`, chave, modelo               | Organização do texto (D2)                                    |

Sem qualquer variável obrigatória, o processo **não sobe** e diz qual falta,
sem mostrar valores.

## Ver funcionando sem configurar nada

```bash
npx tsx apps/worker/src/shift-assistant/sandbox/demo.ts
```

Roda o assistente real, com a mesma montagem de produção, contra serviços de
faz-de-conta em loopback (WhatsApp, Whisper e modelo) e mostra no terminal uma
conversa de plantão com dados fictícios: áudio, texto para colar no HIS,
pendências, lembrete, `feito` e `adiar`.

## Testar conversando, no terminal

```bash
npx tsx apps/worker/src/shift-assistant/sandbox/chat.ts
```

Você digita como se estivesse no WhatsApp e vê as respostas do assistente.
Comandos do teste: `/audio <o que você falaria>` simula um áudio,
`/avancar 2h` avança o relógio e dispara lembretes, `/gestor <mensagem>` fala
como gestor, `/sair` encerra. Sem configuração, o modelo é um simulador
simples que entende o modelo de paciente novo e frases como "Thor do leito 3
...". Para testar com o modelo real, defina `LLM_BASE_URL`, `LLM_API_KEY` e
`LLM_MODEL` antes de rodar. Use só dados fictícios nos testes.

## Como mandar um paciente novo

Mande `novo paciente` e o assistente responde com este modelo, que pode ser
falado num áudio ou copiado e preenchido:

```text
Novo paciente: <nome>, <espécie>, leito <número>, tutor <nome do tutor>.
Motivo: <por que internou>.
Evolução: <como está agora>.
Pedi <exames>.
Vou <o que ainda vai fazer> às <hora>.
```

A resposta traz o texto pronto para colar no HIS (tutor, motivo da internação,
evolução, exames para lançar na comanda) e cria as pendências com horário. O
assistente **não cadastra** o paciente no HIS: o cadastro e o prontuário
oficiais continuam sendo feitos lá. Se a mensagem não disser de qual paciente
se trata, o assistente pergunta.

## Subir com Docker (recomendado)

```bash
cp deploy/shift-assistant/.env.example deploy/shift-assistant/.env  # preencher
docker compose -f deploy/shift-assistant/compose.yaml up -d --build
curl http://127.0.0.1:3400/health
```

A imagem tem só o Node e um arquivo JavaScript; roda sem root, com disco
somente leitura e sem capacidades extras. O volume `shift-data` guarda o
registro de eventos e as mídias (documentos, D4) e deve entrar no backup.

O `compose.yaml` publica a porta só em `127.0.0.1`. Se o WAHA ou a Evolution
rodarem em outro container, coloque os dois na mesma rede Docker e use o nome do
serviço na URL do webhook; se rodarem em outra máquina, publique a porta na
interface da rede interna, nunca na internet.

## Subir sem Docker

```bash
npx tsx apps/worker/src/shift-assistant/main.ts   # com as variáveis acima no ambiente
```

## Ligar o WhatsApp ao assistente

- **WAHA:** webhook da sessão para `http://<assistente>:3400/webhooks/waha`,
  evento `message`, header customizado `x-cvg-webhook-secret: <segredo>`.
- **Evolution:** webhook da instância para
  `http://<assistente>:3400/webhooks/evolution`, evento `MESSAGES_UPSERT`,
  header `x-cvg-webhook-secret: <segredo>`. Com `webhook_base64` ligado, áudios
  chegam no próprio webhook; sem ele, o assistente baixa pelo id da mensagem.
- Se o provedor não aceitar header customizado, use `?secret=<segredo>` na URL.

Só mensagens diretas são tratadas; grupos são ignorados nesta fase.

## Uso pela equipe

Mande `ajuda` para o número do assistente. Resumo: áudio, texto ou foto viram
nota; `pendências`, `feito N`, `adiar N 30`, `ok`, `corrigir <texto>`. O
registro oficial continua sendo no HIS.

## Operação

- **Desligar (barra item 8):** o gestor manda `pausar assistente`. Mensagens
  continuam guardadas e nenhum lembrete sai. `retomar assistente` processa o que
  chegou durante a pausa.
- **Queda e reinício:** mensagens recebidas e não processadas são processadas
  automaticamente ao subir de novo.
- **Retenção (D4):** nada é apagado por prazo. Arquivos de `SHIFT_DATA_DIR` só
  saem do servidor depois de confirmados no backup.
- **Logs:** sem conteúdo de mensagem; só eventos, tipos e resultados.

## Medir o piloto (AP-016)

Por turno: quantas notas cada plantonista mandou, quantas pendências foram
criadas e quantas fecharam com `feito`. Os dados estão em
`SHIFT_DATA_DIR/events.jsonl` (`note_created`, `task_created`, `task_done`).
Em duas semanas, decidir seguir, ajustar ou parar.
