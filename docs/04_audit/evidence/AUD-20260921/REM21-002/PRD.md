# REM21-002 — PRD

## Problema

A certificação possui uma fonte institucional de achados, mas a decisão atual
aceita um JSON manual de findings/scores. Isso permite que uma execução produza
`CONDITIONAL_GO` enquanto a auditoria corrente registra P0/P1 abertos.

## Resultado esperado

Para cada execução, a Phase 10 deve produzir um snapshot determinístico dos
achados a partir do relatório A21, com proveniência e vínculo ao candidato/run.
Os scores e a decisão devem ser derivados desse snapshot. Qualquer divergência
de origem, frescor, integridade, cardinalidade ou vínculo deve falhar fechado.

## Usuários e autoridade

- **Certifier:** consome a fonte institucional e produz o snapshot.
- **Verifier:** rederiva e compara o snapshot antes de aceitar a certificação.
- **Auditor/humano:** inspeciona evidência; não edita arrays para alterar a
  decisão.

Não há usuário externo, canal, IdP ou fluxo clínico/financeiro neste task.

## Regras de produto

1. A fonte atual é `docs/04_audit/0566_comprehensive_repository_audit_2026-09-21.md`.
2. A identidade canônica é `A21-F01`…`A21-F26`; IDs repetidos, omitidos ou fora
   da sequência invalidam o snapshot.
3. A prioridade explícita governa: `P0`, `P1`; a seção média mapeia para `P2` e
   a seção baixa para `P3`. O contrato de resultado preserva P0/P1/P2 e mantém
   P3 no metadado computado sem permitir que um P3 esconda P0/P1.
4. Findings não fecham por edição manual. Sem uma closure entry validada contra
   candidato/run/fonte/evidência, o status é aberto.
5. Scores são funções dos totais e fechamentos computados; nenhum score vindo de
   arquivo manual pode substituir a função.
6. O resultado corrente contendo os 11 P0 e 1 P1 da A21 deve ser `NO_GO`.

## Não objetivos

- fechar achados A21;
- validar integrações externas ou produção;
- requalificar AUD20-008;
- resolver REM21-003 em diante;
- apagar histórico documental.

## Critérios de sucesso

- `npm`/Node 22 executa testes unitários do parser/governance;
- execução negativa detecta source hash, candidate/run, score e edição manual;
- o verifier rejeita snapshot antigo ou divergente;
- o resultado derivado para a fonte A21 contém P0/P1 abertos e `NO_GO`;
- evidência local reproduz os comandos e hashes sem dados sensíveis.
