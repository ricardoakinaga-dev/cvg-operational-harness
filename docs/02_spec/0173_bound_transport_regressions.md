# SPEC 0173 — regressões de transporte Node com endereço fixado

Task UP91-004-R4, derivada de UP91-004/PR-007 e da superfície de egress de UP91-024/039/041. Trilha T2, **somente testes**, sob D-12. Nenhuma mudança de transporte, política de SSRF, contrato público, provider/canal real ou autorização T3/T4.

## Recon e baseline

Coverage da rodada3: model-gateway/providers/ssrf-node.ts possui 48,23% de branches (44 descobertos); channel-gateway/adapters/ssrf-node.ts possui 40% (51 descobertos). São fronteiras Node que mantêm Host/TLS SNI e conectam ao primeiro endereço já aceito pelo guard. O relatório global tinha 11.739/13.364 branches (87,84%), abaixo da margem PR-007 de88%; esta SPEC não promete atingir o piso nem altera o denominador/limites.

## Regras

1. Importar apenas a função exportada fetchWithResolvedAddress; exercitar sockets HTTP reais contra servidor sintético próprio, somente127.0.0.1/porta efêmera. Sem mock de node:http, do transporte ou dos helpers privados; sem cast para alcançar privados.
2. O loopback é fixture direta do transporte, não prova de endereço permitido pelo guard SSRF. Não desabilitar guard, TLS, policy ou aprovação, nem usar ambiente NODE_TLS_REJECT_UNAUTHORIZED. Não chamar provider ou canal real.
3. Verificar hostname sintético .invalid e Host preservado apesar do endereço conectado e headerHost forjado; caminho/query, método e bytes recebidos. Cobrir formatos de body suportados com bytes observáveis e comprimentos coerentes, incluindo views com offset. Verificar respostas de erro/headers repetidos sem inventar garantias de redirects ou limites não implementados.
4. Rejeições de endereço ausente/não literal, protocolo não suportado e body inválido devem ocorrer sem request observado no fixture. Aborto antes da conexão e durante request pendente deve rejeitar com causa apropriada e terminar o socket; erro de conexão deve chegar ao consumidor. Não depender de sleeps, internet/DNS real ou timeout como oracle.
5. Cleanup pertence à fixture: fechar todos os sockets/servidores próprios em finally/afterEach; remover listeners próprios. Nada de servidor global ou porta fixa alheia. Não modificar implementações, manifests, lockfile, contratos, guards ou testes existentes.
6. Se surgir divergência de comportamento, preservar falha e registrar lacuna. Não mudar expectativa ou produto para satisfazer cobertura. Correção de segurança exige SPEC T3 revisada antes de BUILD.

## Implementação e dependências

Dois novos arquivos de testes em providers/**tests**/bound-transport.test.ts e adapters/**tests**/bound-transport.test.ts. Suite parametrizada equivalente por fronteira, sem novo pacote/dependência. Task registrada e claim antes do BUILD. Node22 e snapshot próprio; PostgreSQL55592 sintético existente. Não tocar caminhos PR-L04 ou artefatos compartilhados. Dependência de entrada: baseline UP91-001 concluída. Não presume a conclusão dos parents.

## Critério de pronto e provas

Casos significativos positivos/negativos observados pela função exportada e fixture HTTP, foco sem skip/flaky e cleanup comprovado. Typecheck/lint/format adequados, unitários/PG/E2E obrigatórios no snapshot; cobertura real sem rebaixar pisos, certificação ao fim da rodada com código. Crítica I1 fresh-context separada do Builder, hashes pré/pós dos transportes/guards e dos testes. Qualificação reprovada continua reprovada: parser0170, catálogo, dependências e formato alheio não são consertados por esta SPEC. Parent004/full149/release permanecem abertos até provas pertinentes.

Estado inicial: task/SPEC/claim registrados; BUILD de testes autorizado por D-12 T2; resultado ainda não executado. Evidência em ../04_audit/evidence/UP91-EXEC-20260930/transport-boundary-r4/.

## Checkpoint de interrupção —0038

Antes de criar os dois arquivos de testes, sondas do Lead reproduziram falhas connect-bound/bodyless. Builder interrompido e fechado, testes ausentes. A validação diagnóstica retornou exit1, 2PASS/10FAIL; não são contagens de Vitest. Provas em [baseline-conformance](../04_audit/evidence/UP91-EXEC-20260930/transport-boundary-r4/baseline-conformance.json) e [adapters públicos sintéticos](../04_audit/evidence/UP91-EXEC-20260930/transport-boundary-r4/public-adapter-probe-v3.json). Correção proposta em [SPEC0174 T3](0174_bound_transport_node22_compatibility.md); BUILD não autorizado sem revisão humana no hash exato. O estado inicial acima permanece fotografia anterior à sonda.
