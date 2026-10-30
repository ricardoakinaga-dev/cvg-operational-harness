# Revisão independente da SPEC 0283, fatia 2 (F13) — Claude DF, 29/10/2026

Alvo: `claude/aud0625-f13-07` @ `905eb2965`, de autoria da Claude 07, com o recibo [human-decisions-13](../USER-DECISIONS-20261028/human-decisions-13.json). Revisor não autor. É revisão, não aceite. Produção `NO_GO`.

## Veredito

**APPROVE**, sem achados.

## Conferido

- O `source-evidence.ts` é determinístico e sem modelo.
- Os blocos da fonte são separados pela âncora do paciente: nome em palavra inteira, ou ID quando há homônimo. A lista de unidades é fechada, e há rótulos de medida.
- Cada valor com unidade ou rótulo precisa ter na fonte o mesmo número, no bloco do mesmo paciente, com a mesma unidade e o mesmo rótulo. A escala é preservada (`1,0` ≠ `1`) e não há conversão.
- Os códigos de bloqueio entram em `blockingIssues`, e o `ok` é recusado até um `corrigir` limpo (0283-D, bloquear).
- Falsos positivos (numeral por extenso, fonte sem âncora) pedem `corrigir`. É fail-closed, aceito pela decisão D.
- Os dois fixtures que trocaram "2 vezes" por "duas vezes" não enfraquecem nenhuma asserção. "vezes" virou unidade da lista fechada.
- Testes com Node 22 numa cópia detached: produto com 15 arquivos e 185 passando. R6 a R8 viraram testes comuns.
- Mutações: a mutação própria "normalizar a escala" (`1,0` → `1`) morre. Da autora, 15 de 16 morrem; a S16 é equivalente e só muda a mensagem.
- C2/C3 continuam fora: dependem da D2 do produto.
