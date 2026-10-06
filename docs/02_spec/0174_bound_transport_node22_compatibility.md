# SPEC 0174 — compatibilidade Node22 do transporte com endereço fixado

Task proposta UP91-024-TRANSPORT, subfatia de UP91-024 e UP91-004/039/041. Trilha de implementação **T3**: alteração da fronteira connect-bound de SSRF e do comportamento observável de Response. Estado `SPEC_REVIEW_PENDING / HUMAN_T3_PENDING / BUILD_NOT_AUTHORIZED`. A preparação deste documento é T1. Task T2 de testes0173 foi interrompida antes de criar seus dois arquivos, após defeitos reais encontrados por sondas.

## 1. Problema e evidência

Em Node22.23.2, os dois exports fetchWithResolvedAddress rejeitam GET200 contra hostname sintético .invalid com endereço fornecido127.0.0.1 antes de qualquer request ao servidor: TypeError Invalid IP address: undefined. O controle por URL com IP literal retorna200. A sonda independente da API Node observa options.all=true, e o callback atual retorna uma string em vez da lista exigida. Uma referência diagnóstica externa que honra all alcança o servidor com resposta200, sem modificar produto. A primeira referência reutilizou socket e não comprovou o modo legado; a revisão agent:false observa três lookup calls e valida os dois formatos. Todos os sockets foram encerrados.

Separadamente, com URL de IP literal (para isolar a falha de lookup), respostas204/205/304 chegam ao servidor, mas os transportes rejeitam ao executar new Response(Buffer.concat(chunks)). HEAD200 retorna texto vazio, porém body não nulo. O método fetch deve produzir body nulo para HEAD e os status finais sem body. As sondas são diretas do transporte, não prova de guard permitindo loopback nem homologação de um provider/canal real.

Provas originais: [transport-probe-v2](../04_audit/evidence/UP91-EXEC-20260930/transport-boundary-r4/transport-probe-v2.json), [controle causal Node](../04_audit/evidence/UP91-EXEC-20260930/transport-boundary-r4/lookup-contract-probe-v2.json), [baseline](../04_audit/evidence/UP91-EXEC-20260930/transport-boundary-r4/source-before.json). Os probes processaram seus diagnósticos com exit0; isso **não significa PASS de produto**. Ambas as famílias são falhas de compatibilidade reproduzidas. A configuração default dos adapters sem fetchImpl seleciona esses transportes; essa ligação é inspeção de fonte, não execução de provider real.

Fontes primárias: [Node22.23.2 socket.connect](https://nodejs.org/download/release/v22.23.2/docs/api/net.html#socketconnectoptions-connectlistener), [Node22.23.2 dns.lookup](https://nodejs.org/download/release/v22.23.2/docs/api/dns.html#dnslookuphostname-options-callback), [Fetch Response initialization](https://fetch.spec.whatwg.org/#initialize-a-response), [Fetch main fetch](https://fetch.spec.whatwg.org/#main-fetch). Node usa all=true com a seleção automática de família; o formato all exige lista de address/family. Fetch exige body nulo nos status pertinentes e em HEAD. Não copiamos um contrato futuro para o runtime atual.

## 2. Recon e fronteira de alteração

Implementações a alterar **somente após revisão humana explícita deste SHA-256**:

- packages/model-gateway/src/providers/ssrf-node.ts;
- packages/channel-gateway/src/adapters/ssrf-node.ts.

Testes novos autorizáveis no mesmo corte: os dois bound-transport.test.ts já previstos na SPEC0173. Fixtures/scripts/certificados apenas temporários próprios, gerados pelos testes; sem package novo, lockfile, configuração global de DNS/TLS, schema, guard, exports ou arquivos de outro agente. Não criar refatoração compartilhada entre os dois workspaces neste corte.

Antes de BUILD, confirmar HEAD/sha dos transportes e guard e claim livre; a baseline do pacote de revisão possui os hashes. Se houver drift desses inputs, revalidar a SPEC e a autoridade antes de alterar. Spec0174 não modifica0166/0167/0170 nem as aprova implicitamente. Autoridade para dependências0164 e claimsPR-L04 são independentes.

## 3. Contrato de correção

### 3.1 Lookup compatível e pinning preservado

1. Validar e selecionar somente o primeiro IP já aceito pelo guard, como atualmente. Normalizar brackets conforme algoritmo existente e manter family4/6 calculada por isIP. Ausência ou valor não literal continuam erro antes de socket.
2. No callback pinnedLookup, quando options.all===true, entregar callback(null, [{address, family}]); caso contrário entregar callback(null, address, family). Usar LookupFunction/LookupOptions existentes, sem any ou cast para desativar checks. O array contém exatamente o mesmo primeiro endereço aceito, nunca os demais candidates ou resposta de DNS novo.
3. Preservar agent:false, hostname original como autoridade HTTP e servername original para TLS. Host recebido do consumidor continua sobrescrito pela autoridade URL. Não adicionar fallback a globalfetch, resolver real, DNS em falha, novos redirects ou seleção de outro endereço. Não desabilitar autoSelectFamily globalmente nem usar autoSelectFamily:false para mascarar o defeito.
4. Guard SSRF permanece antes do transporte no caller. URL/policy, allowPrivateNetworks, protocolos, redirects por hop e trustedtenant não mudam. Teste direto com IP privado é fixture de transporte, não uma nova permissão em produto.

### 3.2 Response sem body

1. Passar o método efetivo da request ao leitor de resposta. DefaultGET e o comportamento existente dos demais métodos são preservados. A comparação de HEAD deve cobrir a forma efetivamente enviada por Node, incluindo init.method em caixa baixa; sem implementar novo dispatcher de métodos.
2. Para métodoHEAD ou status final204/205/304, construir Response com body=null, status/statusText/headers reais. Preservar distinção de304 (ok=false) e204/205 (ok=true); não converter status de erro em sucesso. Status informativos100/101/103 não são novas respostas finais suportadas por este corte.
3. Para demais respostas, preservar bytes concatenados, inclusive body de zero bytes de GET200. Não substituir todos os bodies vazios por null, não fabricar JSON e não alterar classificação de erros dos adapters.
4. Drenar/encerrar corretamente o stream HTTP antes de settlement; não deixar socket pendurado ao ignorar body. Rejeição de stream, abort e error continuam governados pelo single-settlement existente. Não alterar encodings suportados, content-length, retry, timeout, maxbody ou budgets nesta fatia.

## 4. Matriz de aceite observável

| Fronteira               | Teste obrigatório                                                                                                                          | Oráculo                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Callback Node22 default | Ambos transportes: hostname .invalid, primeiroIP fixture, GET200 e POSTbytes                                                               | Request chega uma vez ao servidor correto; Host/path/query/método/bytes preservados; sem DNSfallback                               |
| Formato de lookup       | Processos filhos isolados com defaults normal e --no-network-family-autoselection                                                          | Ambos formatos funcionam; não muda default do processo pai/produção; referências não substituem execução do transporte             |
| Pinning                 | ServidorA no primeiro endereço próprio; segundo endereço fornecido aponta a servidorB próprio no mesmoport onde possível, ambos loopback   | A recebe; B recebe zero; sem aceitar novo endereço no guard; IPv4 e IPv6 loopback por fixtures explícitas                          |
| Bodyless                | GET204/205/304 e HEAD/head200, em ambos transportes                                                                                        | Status/header corretos, body===null, text==='', ok correto; GET200vazio preserva body não nulo                                     |
| Encoding/header         | String UTF8, Uint8Array, ArrayBuffer, view com offset, URLSearchParams, Blob, undefined/null; Headers/tuplas/objeto                        | Bytes recebidos reais, comprimento quando aplicável, Host forjado sobrescrito                                                      |
| Negativos               | Endereço ausente/nãoIP, protocolo nãoHTTP(S), body não suportado                                                                           | Rejeita antes de request; contadores do fixture não aumentam                                                                       |
| Cancelamento/falhas     | Signal abortado antes, aborto com request pendente via evento, erro de conexão/stream                                                      | Rejeição observável e socket encerrado, sem sleeps como oracle, sem effects em provider                                            |
| TLS                     | HTTPS próprio com CA/cert SAN sintético confiado somente no filho por NODE_EXTRA_CA_CERTS; controles hostname divergente e CA não confiada | SNI/Host originais e validação TLS preservados; negativo rejeita; nunca NODE_TLS_REJECT_UNAUTHORIZED=0, sem instalar CA no sistema |
| Caller e guard          | Suites existentes SSRF/providers/channels e inspeção de ligação default                                                                    | Guard/flags continuam iguais, injectedfetch continua distinto do caminho Node; nenhuma autorização de provider real                |

Certificados de testes são efêmeros/sintéticos em diretório temporário próprio; chave não vai para repo/logs. Se usar OpenSSL para gerar a fixture, registrar a ferramenta/versão e exigir disponibilidade no gate, sem instalação ou skip silencioso. Caso ambiente IPv6/fixtureTLS necessário esteja indisponível, a evidência é BLOCKED, nunca PASS por remover a dimensão. Nenhum teste precisa de internet ou conta.

## 5. Sequência, rollback e pronto

1. Preparação T1: hashes, probes e esta SPEC; I1 fresh-context independente; revisão humana do hash exato antes de código.
2. Após autoridade: claim próprio dos dois transportes, taskBUILD registrada, patch mínimo e dois arquivos de regressões; repetir probes no produto corrigido e preservar negativos. Diagnóstico de referência continua separado do código do produto.
3. Node22: typecheck, lint, foco, unitários completos, PG obrigatório, E2E e cobertura/critical/mutation pertinentes no snapshot próprio; zero skips/retries de testes obrigatórios. Certificação ao final da rodada com código, com resultados reais e mesmabaseline/run. Parser0170, catálogo, dependências e formato alheio permanecem gates independentes; não prometer certificado global emitido se qualquer um falhar.
4. Crítica I1 de diff/fontes/oracles antes de integração. Pronto local somente quando matrix aplicável comprovada e contratos de guard/authority/TLS preservados. Não encerra UP91-004/024/039/041, original149 ou release apenas com testes locais.
5. Se falhar, manter candidato NO_GO e preservar delta/evidências. Descartar/reverter somente o delta próprio isolado se seguro; sem restore/reset/stash de trabalho alheio, mudança global de DNS/TLS ou downgrade de limite. Integração/commit/push/release continuam sob claims e autorizações próprios.

## 6. Decisão humana proposta

Aprovar BUILD **sintético delimitado** desta SPEC no SHA-256 apresentado no pacote após I1: corrigir somente assinatura de lookup e construção bodyless nos dois transportes, com os testes e fixtures definidos. Não aprova provider/canal real, tenant real, alterações no guard/policy, scripts de certificação0170, lockfile0164, push/deploy ou GO. Resposta ausente, aceite técnico, tempo decorrido ou continuação automática não constituem aprovação.
