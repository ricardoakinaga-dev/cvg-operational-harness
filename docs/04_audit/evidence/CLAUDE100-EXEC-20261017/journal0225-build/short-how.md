# SPEC0225 — HOW da candidata local

Task `C100-FND-JOURNAL-0225-BUILD-001`. Estado **PREPARING / CODE_BLOCKED**.
Autoridade:0225 original04b92ba4 com ajustes humanos16/10, cópia ajustada
f26ccead/R2 aceita. A reconciliação de entrada local ainda está em revisão
independente; este HOW não a substitui. A unidade inteira continuaT3.

## Resultado e fonte

Preservar resultado JSON estrito, inclusive NUL, no journal PostgreSQL nativo
por codec opt-in1, sem alterar a API lógica nem as barreiras tenant/fence.
Não habilitar hosts ou produto. Primeiro recurso novo exclusivamente sintético.
Encerramento exige J01–J13/J16 e todos os gates atuais; J14/drillJ15 adiados
somente como autorizado. Checkpoint/capture8MiB e contexto32KiB permanecem.

Base proposta: checkpoint2f0cc11f, composto de5e3b mais builder root20 exato.
Criar candidata nova journal0225-candidate somente depois de aceite de entrada,
verificar branch/base/limpeza e ausência0030/0031. Congelar0029 e loader antes
da edição. Registrar dependências físicas e ferramentas sem instalar pacotes.
Não transferir certificados ou os resultados nativos/E2E da base.

## Superfície proposta e direção de dependências

- `packages/persistence/src/operational-effect-result-codec.ts`: codec interno
  com canonicalizador existente decontracts; não exportar no barrel público.
- `packages/persistence/src/operational-effect-result-guard.ts`: renderização
  finita e quotada do guard migration-owned para schema/principal confiáveis;
  expansão sem binding nega1. Nenhum nome vindo de ferramenta/GUC.
- `packages/persistence/src/operational-effect-result-readiness.ts`: inspeção
  de schema/role/ACL/guard no mesmo client antes de usar modo1. Revalidar a
  identidade por conexão; não reutilizar readiness entre tenants/schemas/roles.
- `packages/persistence/src/operational-execution-postgres.ts`: opção explícita
  `resultStorage:{version:1}`, congelada na construção, projeções bounded e
  transições nativas. Default legado preservado, sem adotar linhas0 no opt-in.
- `packages/persistence/migrations/0030_complete_tool_result_journal.sql` e
  `packages/persistence/src/postgres-migrations.ts`: duas colunas, checks/guard,
 0030 registrada depois de0029, sem editar SQL/checksums antigos/backfill.
- Novos testes `packages/persistence/src/__tests__/complete-effect-result-*.test.ts`,
  fixture própria `__tests__/fixtures/journal-result-process.ts` e composição
  sintética. Não editar suporteTH06, testes/pins antigos ou o checker.

Manifestos/lock, contratos decontracts/harness, drivers, consumidor/SDK, hosts e
composição published principal ficam intactos. O caso bound usará a opção com
fence na porta de journal sintética, preservando a composição nativa; não
ativar implicitamente o constructor do store published.

## Invariantes de implementação

1. Codec: canonicalizador estrito existente com maxBytes1048576,
   maxDepth64/root1 e maxNodes1000000. Envelope somenteencoding/decodedBytes/
   decodedSha256/data; base64 ASCII1398104 e envelope expandido1398616.
   UTF-8 fatal/semBOM, SHA/length/base64 exatos, scan lexical antes deJSON.parse,
   recanonicalização idêntica. Rejeitar duplicatas/trailing/não canônico.
   Nenhuma normalização/coerção, getter/toJSON, truncamento ou decode recursivo.
2. Schema:0 preserva JSONB legado/payloadNULL;1 mantém resultNULL e payload
   somente noCONFIRMED, errorNULL. Versão imutável inclusive retry; estado,
   payload e timestamp confirmam atomicamente. Expansão inicial nega1.
   SQL constraints não substituem validação de conteúdo do adapter.
3. Ativação: guardSECURITY INVOKER com session_user/current_user exatos e
   schema literal, instalado pelo owner separado; comparação/hash do binding
   e recibo de readiness. Sem table nova de authority, GUC ou SECURITY DEFINER.
   LOGIN runtime dedicado, zero memberships, semsuper/bypass/ownership/DDL,
   grants diretos mínimos. Revogações/encerramento só no recurso sintético.
   Negativos antigos têmUSAGE para obter42501 sobre a tabela correta.
4. Queries: detectar legado/expandido/ativado antes da projeção; suprimir
   payload oversized emSQL antes do parserJSONB e retornaroverflow explícito
   emget/reserve/transition/RETURNING. Default recusa1; opt-in sem readiness
   falha antes de claim/modelo/corpo. Opt-in get0 pode inspecionar; reserva e
   transição0 recusam inclusive órfão/FAILED/proposal igual, sem alteração.
5. Transições: conservar transação, parent/outer/fence/locks e rechecks nativos.
   Encode bounded não dispensa recheck de lease/prazo antes da escrita.
   Reconfirmar mesma tentativa exige bytes/hash idênticos; diferença conflita.
   CONFIRMED não demove nem é sobrescrito; perda deack exige re-read/reconciliação,
   não retry seguro. Nenhuma falha de cleanup/markUncertain mascara a primária.
6. Isolamento: nenhum output/configHTTP/variável não validada ativa o modo.
   Fixarprincipal/schema/binário na composição; não ligar modo em execução.
   IDs/erros/demais campos continuam com validação anterior; NUL fora do output
   do journal não é resolvido por este trabalho.

## Ordem e prova

Primeiro implementar codec e seus controles de domínio/corrupção, depois
migration/guard/readiness e integração no adapter. A publicação de funcionalidade
depende da porta conectada; teste de codec sozinho não fecha0225 ou cartão.

Congelar uma matriz executável J01–J13/J16 antes de rodarPG. Reproduzir o
controle NUL vermelho anterior em recurso novo, com queries e counters reais;
preservá-lo. Provar a mudança pela mesma fronteira, restart em PID novo,
SIGKILL nos dois crashpoints distintos, checksums duráveis/frames/receipts e
model/body counters; não substituir por mocks. J13 requer triggers0029 e
fences reais, não um positivo unbound. J12 mantém fronteiras output1MiB e
ToolResult8MiB separadas. J03 discrimina limite de nós no componente porque o
cap de bytes domina a porta pública. Cada guarda deJ07 tem negativo isolado.

PG, nomes/portas, memória/pids, HOME/TMP/config/cache, credenciais sintéticas e
cleanup terão claim concreto após inventário e antes de provisionar. Nunca
reutilizar containerPARE ou identidade antiga. Eventual binding privado de
fixture deve manter todos os checks de path/hash/CWD/UID/mode/argv e identidade
Docker reais; não acrescentar roots/argv arbitrários ao detector existente.

Uma implementação, até um retrabalho agrupado após crítica e duas reviews
nesta unidade; desvios de HOW/contrato devem ser reconciliados antes de código.
Revisão independente após fonte congelada. Tipagem/lint/unit/PG/E2E/certificação
e verificador atuais antes de encerrar rodada/integrar. Manter43reds legados e
suas causasP0, sem repin/checker/skip; se continuarem, encerramento impedido.
Sem promoção shared/main, funcional credit, release/provider/dado real/push.
