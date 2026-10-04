# Emenda local — OpenAI exclusivamente sintético — GREEN 04/10/2026

Estado: proposta concreta para revisão humana T3; execução externa exige também pacote T4 congelado. Não altera os bytes aprovados das SPECs 0179 e 0180.

## Autoridade e finalidade

Ricardo escolheu OpenAI, informou que preencherá `.env` e autorizou “Inferência com casos exclusivamente sintéticos”. A implementação permanece no consumidor `products/shift-assistant`, sem colocar regra clínica ou dependência do produto no harness.

## Contrato

1. O caminho padrão do organizador e qualquer entrada desconhecida continuam NO_MODEL. Não há grant CLINICAL geral, detecção heurística de dado sintético ou liberação por variável de ambiente isolada.
2. Um adaptador separado para teste sintético aceita exclusivamente textos de fixtures locais congeladas, conferidos por SHA-256 e identidade do corpus. A allowlist é construída de fixtures sintéticas auditadas, nunca de mensagens recebidas. Divergência, ausência de corpus, origem desconhecida ou texto fora da allowlist devem impedir a chamada ao provider.
3. O launcher sintético usa somente loopback, persistência descartável própria e simuladores locais de WhatsApp/áudio. Nenhum canal real ou destinatário real. O console deve identificar o modo sintético e oferecer somente fixtures fixas; nenhum campo livre é enviado ao provider.
4. OpenAI via adapter público existente, HTTPS `https://api.openai.com/v1`, modelo padrão `gpt-4.1-mini-2025-04-14`, configurável em `.env`. Chave em OPENAI_API_KEY, carregada em memória, nunca logs/evidência/browser/Git. Timeout, limite de tamanho e SSRF mantidos. Sem ferramentas, gravação de prontuário ou ação clínica.
5. Cada requisição usa apenas o texto sintético aprovado e o prompt de organização. Resposta estruturada é validada pelo schema do consumidor; nenhuma resposta do modelo se torna diagnóstico, confirmação ou recomendação automática. IDs, números e citações permanecem sujeitos aos validadores aprovados nas SPECs.
6. Testes externos reais são opt-in, no máximo20 chamadas de organização, até2048 tokens de saída por chamada, sem retry automático em erro de auth/cota ou erro determinístico. Registrar apenas identificadores de fixture, hashes de entrada/saída, status/categorias de erro e uso de tokens; não salvar secrets nem headers de autorização.
7. Primeiro preparar BUILD, regressões negativas/positivas, bundle congelado, manifesto de corpus e packet de execução T4 com SHA-256. A decisão do usuário sobre este texto autoriza BUILD local. Após os gates locais obrigatórios e conferência de chave presente, a execução externa é aprovada pelo pacote T4 concreto, congelado e hash-bound. Se bytes/escopo/corpus mudarem, gerar novo packet e obter decisão aplicável.
8. NO_MODEL permanece em produção, dados reais e qualquer entrada fora da allowlist. A aprovação desta emenda não autoriza push, piloto, produção, provider de WhatsApp real ou dados reais. Aprovação técnica local não equivale a qualificação humana/clínica.

## Critérios de pronto

Preservar todos os testes originais e zero skips; novos testes discriminantes de texto não permitido, fixture alterada, chave ausente, cancelamento, timeout, erro auth/rate-limit/5xx, JSON/schema inválido, IDs/números e evidência. Regressões comprovam zero chamadas em modo padrão e entradas desconhecidas. Revisão independente fresh-context do artefato exato e dependências físicas próprias; suíte completa, PostgreSQL, E2E, neutralidade e gate fail-closed. Testes OpenAI reais somente com a chave inserida pelo usuário e pacote aprovado. Qualquer FAIL continua registrado.

Fontes: [D-12](../../../../07_agents/AGENTS.md); [modelo OpenAI](https://developers.openai.com/api/docs/models/gpt-4.1-mini); [configuração de API](https://developers.openai.com/api/docs/quickstart).
