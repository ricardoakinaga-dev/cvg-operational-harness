# REM21-004 — PRD

## Problema

Uma resolução DNS segura não basta se o cliente HTTP resolve novamente o
hostname ao abrir o socket. Um atacante que controla ou altera a resposta DNS
pode fazer o request conectar a outro endereço depois da validação. Nos
adaptadores de canal e providers HTTP, esse risco é agravado pelo uso de API
keys e pela aceitação anterior de HTTP público.

## Resultado esperado

Toda saída EvolutionAPI/Chatwoot e dos providers HTTP deve passar por uma
política composta:
protocolo e host permitidos, resolução por salto, rejeição de qualquer
endereço privado por padrão e conexão ao endereço já validado. O hostname
original deve ser mantido apenas para roteamento HTTP e identidade TLS.

## Regras de produto

1. HTTPS é obrigatório para integrações externas.
2. HTTP só pode ser habilitado para um hostname loopback, resolvido apenas para
   endereços loopback, e com `allowPrivateNetworks: true`, exclusivamente para
   homologação local.
3. Cada redirect recebe o mesmo guard e um novo binding de endereço.
4. Um resultado DNS com qualquer endereço privado é rejeitado; não há
   fallback silencioso para outro resolvedor.
5. `fetchImpl` injetado continua disponível apenas como seam sintético de
   testes; o caminho default Node não usa resolução implícita do hostname.
6. Nenhum request de provider real, canal real, paciente, agenda ou produção
   faz parte desta task.

## Não objetivos

- trocar o cliente HTTP de todo o monorepo;
- alterar APIs públicas de providers não HTTP;
- permitir HTTP em hostname público;
- criar allowlist de IPs fornecida pelo usuário;
- executar integração externa, deploy ou certificação final.

## Critérios de sucesso

- teste do guard comprova que o bound transport recebe os endereços validados;
- teste de redirect comprova nova resolução/binding por hop;
- EvolutionAPI e Chatwoot rejeitam base URL HTTP pública;
- providers HTTP rejeitam HTTP fora do loopback explicitamente autorizado;
- loopback HTTP explícito funciona apenas com opt-in e transporte local;
- rebinding para endereço privado não chama transporte;
- regressões, lint e typecheck Node 22 passam.
