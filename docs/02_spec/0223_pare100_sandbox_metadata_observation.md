# SPEC0223 — observação da preservação de sandbox na composição pública

## Escopo e autoridade

Task `P100-004/P100-024/SBX-METADATA-OBS-001`, 16/10/2026. T2 de
test-support local sob o pedido integral PARE100 e D-12 da
[constituição](../07_agents/AGENTS.md). Estado inicial
`BUILD_LOCAL_AUTHORIZED_TEST_SUPPORT_ONLY`: esta SPEC curta registra recon,
regras e critérios antes do código da prova. Não modifica contrato público,
segurança, policy, approval ou comportamento de produção. A correção de
produção pertence à [SPEC0222](0222_pare100_managed_capability_lifecycle.md),
que continua aguardando revisão humana. A decisão sobre essa SPEC não é
inferida da execução desta observação.

É uma observação CVG independente. Não satisfaz a obrigação de dois motores da
[SPEC0213](0213_pare100_keyless_differential.md), nem ML29 completo,
isolamento nativo, distribuição compilada, API gerenciada ou paridade integral.

## Recon e hipótese

No worktree isolado, `createOperationalHarness` aceita alternativamente
`tools` ou `capabilities`, oferece `sandbox` e usa o pipeline real. O
`CapabilityDescriptor` herda `ToolDescriptor.sandbox`; o normalizador atual de
`capability-boundary.ts` enumera campos e omite esse metadado. O pipeline usa
o modo do descritor para decidir se chama o gate. A hipótese a medir é que a
mesma intenção `WORKSPACE` chega ao gate pela rota direta e se perde pela rota
de capabilities. Leitura de fonte não é comprovação executável.

## Regras da prova

- Código de prova e launcher somente no diretório temporário próprio;
  documentação e evidências próprias são espelhadas no root e worktree.
  Imports estáticos da entrada pública fonte CVG e das fixtures de teste
  existentes; nenhum patch, monkeypatch, motor reimplementado ou alteração do
  normalizador. Hashes dos inputs e das fontes antes e depois da execução.
- Ferramenta única `synthetic.sandbox.metadata`, `LOW`, `sideEffect: NONE`,
  idempotente, sem approval, entrada/saída JSON fixa. Seu corpo apenas conta e
  devolve um eco em memória. Nenhum arquivo, shell, rede, subprocesso, grant,
  helper nativo ou serviço é chamado pelo corpo.
- Gate sintético sempre nega e registra seu pedido real. Orquestrador de teste
  solicita uma chamada fixa; policy, approval, audit, telemetry, modelo e
  journal usam portas sintéticas/em memória. Identificar essas substituições
  explicitamente: a prova observa composição e despacho reais, não a policy
  de produção nem o isolamento do sistema operacional.
- Comparar três casos com composição fresca e journal próprio em cada caso:
  ferramenta direta `WORKSPACE`, capability `WORKSPACE` e capability `NONE`.
  Sem executionId durável ou retomada; conservar resultado nativo completo,
  descritores antes/depois, fingerprint, pedidos ao gate, corpo, decisões,
  policy, approval, audit, telemetry e chamadas de modelo.
- Node22 instalado, ambiente permitido explícito, HOME/TMP/XDG privativos,
  cache TS desabilitado e tsconfig existente autenticado. Processo próprio
  com grupo próprio, limite de 5s/1MiB, captura dos dois streams e exit/join.
  Falha ou timeout conserva evidências; não instalar dependências, alterar
  lockfile, escrever cache no worktree ou usar ambiente/credenciais reais.

## Critérios rejeitáveis

1. `OBS-SBX-01`: controle direto `WORKSPACE` deve chamar o gate uma vez,
   executar zero corpos e retornar `UNSAFE_REQUEST`. Sem esse controle, a
   hipótese não foi isolada e a observação é inválida.
2. `OBS-SBX-02`: controle capability `NONE` deve completar um eco com zero
   chamadas ao gate e um corpo, sem modelo ou aprovação. Falha de validação,
   fingerprint, policy ou fixture torna a prova inconclusiva, não segura.
3. `OBS-SBX-03`: observar a rota capability `WORKSPACE` sem obrigar resultado
   verde. O invariante desejado é preservação do metadado, gate uma vez e
   corpo zero. Descritor perdido, gate zero e corpo um constituem testemunho
   vermelho do invariante, mesmo que o processo de medição termine com exit0.
4. `OBS-SBX-04`: rejeitar observação com caso ausente/duplicado, contadores ou
   resultado adulterados, gate não alcançado no controle, fonte alterada,
   stream perdido, exit/teardown desconhecido ou execução fora dos limites.
   Não converter mocks, texto de logs ou sucesso de processo em sandbox PASS.
5. `OBS-SBX-05`: preservar fonte e 465pins, quatro SPECs protegidas, 36critérios,
   2DONE_LOCAL/34abertos; paridade `NOT_MEASURED`. Tipo/lint/formato focados e
   revisão independente do observador antes de qualquer aceite da prova.

## Verificação e continuidade

Resultados iniciais `NOT_RUN`. Evidências serão publicadas em
`docs/04_audit/evidence/PARE100-EXEC-20261014/sandbox-metadata-observation-r1/`.
Gates integrados T2 (`typecheck`, `lint`, `npm test`, `test:postgres`, E2E em
Node22), cobertura e certificação continuam pendentes; a qualificação0220 e
as falhas globais já registradas não recebem exceção nem refresh por esta
prova. Não executar certify/E2E/SBOM/licenses ou mudar lockfile sem claim
específico. O resultado desta task não fecha cartões pais.

Próxima ação: implementar o observador privado, executar os três casos e
validar a evidência, preservando qualquer falha. A correção de produção só
pode começar após a revisão humana explícita de sua SPEC T3.

## R2 — integridade e ciclo de vida do observador

Task `P100-004/P100-024/SBX-METADATA-OBS-002`, registrada antes do novo código,
T2 exclusivamente test-support privado. R1 preservada: o revisor reproduziu a
falha de sandbox, mas retornou REVISE por duas falhas HIGH do validador e duas
MEDIUM do launcher. Houve exposição acidental a histórico e cache Node privado;
não se concede independência limpa ou aceite da prova pelo parecer antigo.

HOW R2: fonte do motor permanece byte a byte intacta. Antes do lançamento,
congelar authority JSON com membership/digests exatos das fontes, scripts de
prova, entrypoint/loader Node22, configuração e fixture nativa. O digest esperado
da authority vem do Lead fora do dado validado; nunca confiar em hash declarado
pelo próprio run. Depois do lançamento controlado, o Lead congela receipt com
membership/digests dos streams, processo, snapshots e observação bruta. O
validador exige ambos os digests esperados explicitamente, confere membership e
schemas, recompõe o fingerprint a partir dos descritores normalizados e vincula
todos os payloads causais ao input fixo autenticado. Receipt autentica captura
confiável desta execução, não execução de código arbitrário ou host malicioso.
Casos de dados não podem escolher código, portas, caminhos ou ambiente.

JSON ambíguo com chaves duplicadas, número não finito, boolean em contador,
evento/payload ausente ou extra, source map vazio ou substituído, origem do
processo/ambiente/limites adulterada e stderr oculto devem falhar fechados.
Conservar duração real dos eventos como dado nativo, validando tipos/faixas em
vez de zerar clocks para obter igualdade. Testes negativos do validador devem
alcançar checks semânticos além dos checksums, com alteração de cópias e receipt
de teste explicitamente distinto do receipt de captura aceito.

Launcher mantém deadline absoluto de execução, inclusive após EOF; tempo de
cleanup é medido separadamente. Todo caminho após spawn passa por finally que
encerra/recolhe apenas o grupo próprio e conserva streams parciais, exit/join e
erros explícitos, mesmo se captura ou snapshot falhar. Snapshot ausente/erro é
incompleto, nunca sucesso. Não ultrapassar 1MiB na retenção em memória; registrar
se houve bytes descartados. HOMEs por execução e caches TS/Node desabilitados.

Provar timeout após EOF, output cap, erro de captura e erro de hash posterior
com filhos sintéticos próprios de teste, sem motor real nesses controles e sem
efeito externo. Scripts fixos só escrevem stdout/stderr, fecham os próprios FDs
e esperam; nenhuma injeção de comando pelo fixture de observação. Esses controles
não são provas de contenção nativa. Tipo/lint/formato focados, duas reproduções
dos três casos e nova crítica independente após congelamento são necessários.
Gates T2 globais e pais004/024 permanecem abertos. Invariante de produção continua
FAIL até reparo e qualificação próprios; SPEC0222 humanaPENDING sem reenvio.
