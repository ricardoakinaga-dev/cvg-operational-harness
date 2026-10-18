Integra a candidata estável `candidate/core-20261017` na `main` pelo fluxo de pull request exigido pela proteção da branch. HEAD: `4eeb47e88799d55495f794e705dfc5da8a8fdfe0`.

- Reúne os planos 0374 (fases A/B e preparação da C) e 0375 (W1–W4), com evidências operacionais, roadmap 0379 e backlog 0380.
- Corrige o build da imagem de runtime e o lint; exclui os testes do emit `build:harness` para corrigir TS6059 em checkout limpo.
- Prepara o runner efêmero do CI com bubblewrap e user namespaces para executar os testes de sandbox.

Validação do HEAD: 11 checks aprovados, incluindo os cinco obrigatórios: `REM21 CI bar (Node 22)`, `codeql`, `secret-scan`, `supply-chain` e `image-scan`. Os workflows Verify, Security e Product - Assistente de Plantão concluíram com sucesso.

- [Verify e atestação](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/39160810053)
- [Security](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/39160810063)
- [Assistente de Plantão](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/39160810031)

Escopo completo: 12 commits, 391 arquivos alterados, incluindo documentação e evidências. A integração exige uma aprovação independente conforme a proteção da `main`. Deploy e aceite de produção seguem os gates próprios; C1–C9 no servidor hospitalar e reauditoria C10 permanecem etapas separadas do plano 0374.
