# REM21-008 — DISCOVERY — barra integral no CI em Node 22

## Contexto e gate

- task: `REM21-008` / achados `A21-F08` e `A21-F21`;
- autorização: `G21-1`, somente local, sintética e descartável;
- ambiente de validação: Node `v22.23.2`; produção permanece `NO_GO`;
- dependências locais: `REM21-002`–`REM21-007`, todas verificadas localmente;
- proibição: nenhum segredo, provider, canal, serviço externo ou dado real.

## Reprodução do achado

O workflow `.github/workflows/verify.yml` já instala Node 22 e executa uma
parte importante da suíte, mas a barra está incompleta ou indireta:

- `npm run verify` esconde dentro de um comando composto a cobertura global,
  mas não chama `coverage:critical`, `mutation:guard` nem `skip:governance`;
- não há passos explícitos no workflow para load, restore, links/documentação,
  `certify`/`certification:verify` ou build/smoke da imagem;
- não há `node-version-file`/arquivo de versão única, manifesto por run nem
  upload de artefatos; o uso de cache não tem uma identidade documental própria;
- os gates adicionais do workflow de segurança são jobs separados e não
  compõem um resultado único da barra operacional;
- os contratos existentes cobrem apenas uma amostra dos passos, então a
  ausência dos gates não é detectada por teste negativo.

## Invariantes descobertos

1. Todo gate obrigatório deve ser um passo explícito e bloqueante do workflow,
   com comando determinístico e exit code observado.
2. O runtime de todos os gates deve ser o mesmo Node 22 declarado por
   `.nvmrc`, `package.json`, workflow e imagem; nenhum Node 24 implícito pode
   qualificar a barra.
3. Cada execução deve possuir `CI_RUN_ID`, `CI_CANDIDATE_ID` e diretório de
   artefatos próprio; cache de npm não pode entrar na identidade do candidato.
4. Um self-test deve rejeitar workflow sem qualquer gate obrigatório, sem
   Node 22 ou sem upload de artefato por run; o teste não pode aceitar apenas
   a presença textual de um agregador opaco.
5. Falha, ausência, skip obrigatório ou artefato ausente deve bloquear a
   decisão; a tarefa não autoriza transformar ausência de infraestrutura em
   aprovação.

## Decisão de descoberta

Adicionar um contrato local de barra que enumere os gates e valide o workflow
contra esse catálogo. Fixar a versão exata usada no repositório em `.nvmrc`,
usar `node-version-file` no GitHub Actions, executar os gates de qualidade,
PostgreSQL, resiliência, documentação, imagem e certificação explicitamente,
e publicar logs/relatórios por `github.run_id`/candidate. O catálogo pode
reutilizar scripts existentes; REM21-012, REM21-013 e REM21-016 continuam
responsáveis por aprofundar skip, mutation e imagem, respectivamente.

## Gate

`DISCOVERY_COMPLETE / PRD_SPEC_AUTHORIZED_CONTROLLED_BUILD`.
