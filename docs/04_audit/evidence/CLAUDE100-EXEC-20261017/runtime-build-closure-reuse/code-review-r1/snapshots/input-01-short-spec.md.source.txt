# Reuso do fecho do runtime builder

Task `C100-FND-BUILD-CLOSURE-REUSE-001`, D12/T2. O checkpoint anterior é
PROGRESS:56nativos e12E2EPASS, mas P5 permaneceu bloqueado. Nenhuma falha
anterior, pin ou gate é reclassificado por esta tarefa.

## Recon e autoridade

O builder da candidata5e3b tem19workspaces e omite sandbox, dependência já
publicada de channel-gateway. O primeiro compile falhou; pré-build de sandbox
permitiu compilar, mas o contexto ainda ficou sem sandbox/dist.

A raiz commitada7ecc5b53944dcbc50fc26a95cfaec05bb1c62eb5 já contém o fix
PDSH-016: inclui sandbox no conjunto compilado/copiado. Esta tarefa reutiliza
esse arquivo inteiro, SHA-256
`937792b348686c07da8dcc4ef2c2ad89f1970fcbc90240fa15e05755bc1ea034`,
sem produzir outro fix, mudar contrato público ou tocar o checkout compartilhado.

## HOW e proteção

1. Candidata nova/cold a partir de5e3b; deps fisicamente copiadas. Antes de
   compilar, confirmar ausência dos20dist/contextos/buildinfos do builder.
2. Substituir somente scripts/build-runtime.mjs pelos bytes do commitroot
   pinado; comparar diff e hash exatos. Nenhum manifesto/lock/migration/teste,
   semântica/compiler/flag/pin/checker/skipcatalog ou runtime de aplicação muda.
3. Executar o comando build:runtime existente em Node22 com HOME/TMP/XDG/npm
   próprios. Contexto novo sob TMP permitido pelo guard, sem pré-build/seed ou
   cópia de outputs anteriores. Registrar processo/exit/outputs e hashes.
4. Inspeção somente de dados: interpretar o array literal do builder por AST,
   ler os manifestos reais e provar fecho de todas as dependências que são
   workspaces. Conferir manifestos copiados e paths literais de entrada/exports
   físicos sob o contexto. Não importar o builder para ler o array (executaria
   main), nem executar os corpos dos módulos-alvo. Registrar dependências
   externas separadamente; não afirmar instalação npm/image smoke/deploy.
5. Rodar os3testes existentes de runtime-image-contract, tipagem/lint completos
   e formatação do path alterado. Crítico fresco verifica fonte/inputs/outputs
   antes de qualquer integração. Não usar esses testes sintéticos como prova de
   imagemDocker executada ou de produção.
6. T2 geral/certificação atuais e sua revisão continuam condições de integração.
   Enquanto43falhas dos contratos antigos e bindings de recursos persistirem,
   registrar dívidaP0 e bloquear encerramento; nenhum waiver/repin/skip para verde.

## Aceite observável

- BR1: único delta é o builder byteigual ao commitroot pinado, fonte restante
  intacta e nenhum lock/instalação alterado.
- BR2: cold build único sem bootstrap conclui;20workspaces reais emitidos;
  sandbox/dist existe no contexto e o fecho de dependências/entradas literais
  não tem ausência. Manifestos copiados iguais aos da candidata.
- BR3:3testesoriginais/typecheck/lint/formato atuais semfalha; evidências reais,
  sourcehead/hashes e limites de medição explícitos.
- BR4: revisão independente sem obrigatório; código1implementação, até1correção
  agrupada, no máximo2reviews. Se surgir gap fora do scope, parar/reconciliar
  HOW; não editar fontes alheias ou ampliar bar silenciosamente.
- BR5: fullT2 e certificado/verificador atuais antes de integrar/encerrarBUILD.
  Este preparo não fecha BR5 nem117resultados/17controles/M1/PAR/release.

Uma laneT1 disjunta reconcilia autoridade e ordem0029→0030 do journal aprovado,
sem conceder autorização ou iniciar essa implementação. Gate0238 permanece
pendente da resposta real; nenhum pedido humano resolvido será repetido.
