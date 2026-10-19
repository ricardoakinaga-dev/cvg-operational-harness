# Pré-requisitos de qualificação — SPEC curta privada

Task `C100-FND-QUALIFICATION-PREP-001`, trilhaD12/T2. A rodada anterior foi
PROGRESS: código diagnóstico99c9 aprovado, mas o run6e70a8a9 produziu evidência
NO_GO. A fonte e os203artefatos anteriores permanecem congelados. Esta unidade
trata a composição/preparação, sem resetar os orçamentos ou alterar a semântica
de diagnósticos já revisada.

## Recon e resultado requerido

A nova candidata parte do mesmo99c9 e seus11inputs iniciais são byteiguais.
Os três outputs `platform/dist/plugin-execution-core.js`,
`contracts/dist/canonical-json.js` e `shared/dist/index.js` estão ausentes.
`npm run build` executa typecheck e build web, sem emitir esse conjunto.
O `build:runtime` existente compila19workspaces reais via TypeScript6.0.3 e
monta contexto descartável. Não será alterado nem se copiarão emits antigos.

O teste de manifest detectou importTypeScript no workspace persistence sem
respectiva declaração. Root, lock e instalação já têmTypeScript6.0.3; a correção
é declarar `typescript:^6.0.3` em devDependencies desse workspace e no respectivo
registro do lock, mantendo resolução/integrity/versões de todos os pacotes.

## HOW fechado antes da alteração

1. Aplicar somente a declaração acima nos dois paths autorizados. Nenhum outro
   package/lock/metadata muda; dependências de runtime, exports e versões não
   mudam. O lock é emitido pelo npm com package-lock-only/offline/ignore-scripts/
   no-audit/no-fund, sem instalar dependências, acessar rede ou trocar resolução.
   Comparar a árvore JSON inteira e parar se houver outro delta. Não usar
   registry/cache real.
2. Executar build:runtime existente, Node22, na nova candidata e HOME/TMP/XDG/
   npmconfig/cache próprios. O script remove apenas seus dist na candidata e
   seu contexto sob TMP próprio; nenhum build no root, PARE ou99c9 congelada.
3. Executar os três testes originais que mostraram93assertions falhas: duas
   suítes de boundary0215/0216 e workspace dependency manifest. Preservar
   asserções/tabelas/pins/checker/fixtures; registrar cada PASS/FAIL real.
   Build bem-sucedido não implica pin válido. Drift residual é bloqueio
   upstream, não autorização para requalificar exceções de segurança.
4. Inspecionar resolução física de `@cvg/shared` pelo pacote/export existente,
   sem importar seu corpo. E2E e gates completos só depois do inventário de
   atribuições e novo claim de recursos; não repetir38minutos com as mesmas
   faltas já conhecidas. PG/conta/Claude/provider/app não são executados neste
   primeiro passo. Os gatesT2/certify completos permanecem obrigatórios antes
   de qualquer integração/encerramento do BUILD; ausência mantém bloqueio.
5. Scout independente mapeia os sete perfis pendentes e suíte de fence sem
   editar fonte. Identidade antiga impossível não será simulada. Alteração de
   recurso/guard não pertence a este scope; exige proposta/claim próprios e
   gateT3 se mudar segurança/contrato, sem inferir autorização desta tarefa.
6. Crítica independente do delta dos dois manifestos e composição medida antes
   de integrar; uma implementação, até um ajuste agrupado e duas reviews. O
   scout não autoaprova código. Sem descendentes ou promoção root nesta unidade.

## Critérios de pronto e proteção

- P1: exatamente dois campos devDependencies adicionados, nenhum outro dado
  JSON do package/lock, pacote/resolução/integrity alterado.
- P2: outputs faltantes vêm do comando existente, com exit/log e inventário de
  artefatos por hash; fonte/checker/pins/configs/seleção intactos.
- P3: três suítes originais executadas, sem filtro de casos/expected alternativo,
  resultados vinculados à fonte/artefatos reais; residual é FAIL, sem waiver.
- P4: inventário estático completo e diagnóstico explícito das atribuições;
  nenhum PG/profile falso, skip suprimido ou ID histórico apresentado como atual.
- P5: revisão independente atual sem obrigatório, gatesT2 gerais/certificação e
  recursos próprios atuais antes de qualquer integração. Esta fase de preparo
  sozinha não fechaP5, M1, PAR ou qualquer um dos117+17requisitos do programa.

Paths de fonte: `packages/persistence/package.json` e `package-lock.json`.
Todos os demais arquivos de fonte do99c9 são protegidos, inclusive o suporte
privado de processos, testes/payloads/SQL, config de test runner, skipcatalog,
compilador, scripts de build e checker. Tabelas de exceção antigas não serão
repinadas. Recursos/fontes alheios e decisões humanas anteriores imutáveis.

Saída documental e evidência em `foundation-qualification-preparation`; estado
atual em `state.json`. OriginalSPEC0238 continua pendente de resposta real,
sem reenvio.0221/0225 têm ajustesT1aprovados, não são BUILD desta unidade.
