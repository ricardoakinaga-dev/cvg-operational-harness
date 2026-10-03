# Assistente de Plantão

Consumidor privado do Operational Harness, com entrypoint, configuração, dados,
testes e deploy próprios. O harness não importa nem inicia este programa.
Contratos vigentes: [SPEC 0177](../../docs/02_spec/0177_assistente_plantao_fase1_caderno.md),
[D1–D4](../../docs/architecture/adrs/ADR-009-assistente-de-plantao.md) e
[barra 0368](../../docs/03_build/0368_barra_proporcional_assistente_de_plantao.md).

Documentação própria: [índice](docs/README.md), [contrato](docs/spec.md),
[backlog PISO](docs/backlog.md), [operação local](docs/operacao-local.md) e
[guia preparado para homologação](docs/guia-plantonista.md).

Da raiz do monorepo:

```bash
npm run test:shift-assistant
npm run demo:shift-assistant
npm run chat:shift-assistant
npm run build:shift-assistant
```

Do workspace: `npm test`, `npm run demo`, `npm run chat`, `npm run build`.
`npm start` usa o bundle construído e exige configuração completa. Demos usam
somente serviços e dados sintéticos; não iniciam o sandbox persistente existente.

Deploy: `docker compose -f products/shift-assistant/deploy/compose.yaml up -d --build`,
após configurar o `.env` privado. O move não qualifica automaticamente a imagem
ou rede para uso real: F01–F14 e a barra aplicável continuam sujeitos às provas
do backlog de transição. Dados/volumes existentes não são migrados por builds.
