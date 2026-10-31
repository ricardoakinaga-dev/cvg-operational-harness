# Nota 0288b — protocolo do helper `cvg-landlock-exec` (correção de texto da SPEC 0288 §4)

Data: 29/10/2026. Autor: Claude DF. Estado: **TECHNICAL_NOTE**. Esta nota não muda nenhuma decisão do recibo `human-decisions-20`. A [SPEC 0288](0288_par_x02_landlock_ruleset_and_honest_containment.md) tem hash vinculado e não foi editada. A revisão independente do Codex (GBrain 20658, P3b) pediu este registro.

## O que muda em relação ao texto da §4

- **Regras.** A SPEC falava em "JSON com teto de bytes". O BUILD usa um formato de linhas, mais simples de analisar em C com segurança: `"<máscara hexadecimal> <caminho absoluto>\n"` por regra, com no máximo 256 regras e 64 KiB. Toda linha termina em `\n`. O caminho é absoluto, sem `/./` nem `/../` e sem terminar em `/.` ou `/..`. A máscara precisa estar contida nos direitos tratados pelo ABI e não pode ser zero. Um caminho que não seja diretório é mascarado para os direitos de arquivo.
- **Status.** Um objeto JSON por linha, escrito no fd privado:
  - sucesso: `{"applied":true,"abi":N,"handledFs":…,"handledNet":…,"scoped":…}`;
  - falha: `{"applied":false,"error":"<código>","errno":E}`, saída 125, sem `execve`;
  - probe: `{"abi":N}`.
- **Canal de status.** Ele precisa estar aberto, aceitar escrita e ser diferente do fd de regras. Se não estiver, o helper sai com 125 antes de ler as regras. Se a escrita final do status falhar (inclusive ENOSPC), o helper sai com 125 e **não** executa o payload: sem prova de aplicação, nada roda.

Nada disso muda o contrato do §5 (capacidades, gate e lançamento) nem as decisões D-A a D-D.
