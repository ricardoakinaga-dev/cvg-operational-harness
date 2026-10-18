# Censo de arquivos e candidatos modulares TUI

Unidade T1 do [contrato pai](../contract.json). O [leitor](reader.py) conserva os
1.131 arquivos Rust rastreados em `tui/src`, três fontes adicionais de targets e
1.466 paths auxiliares do pacote, incluindo assets, snapshots e fixtures.
Nome de teste é hint, nunca exclusão. O [inventário](inventory.json) contém
identidades Git, SHA-256, declarações e trechos UTF-8; os resultados do leitor
estão na [verificação](verification.json).

As 1.282 declarações de módulo incluem 1.130 candidatos de arquivo e 152 módulos
inline. Há 13.722 imports lexicais e 11 candidatos de include. Os imports retêm
a declaração e profundidade lexical; resolução de aliases, globs, tipos e módulos
não é inferida. Includes dinâmicos ou ausentes mantêm disposição aberta.

Partindo dos targets candidatos do inventário anterior, a propagação de caminhos
de declaração classifica 698 arquivos como candidatos não exclusivos de teste,
432 como candidatos de teste e um como auxiliar ou não resolvido. Não são
contagens de arquivos compilados ou produtivos. Somente `cfg(test)` literal
projeta contexto exclusivo de teste; `not(test)`, condições compostas e
`cfg_attr` ficam simbólicos. Caminhos explícitos conservam alternativas físicas;
ownership modular e semântica de path inline dependem do compilador.

Reprodução somente leitura, na raiz:

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/tui-interactions/scope/reader.py --check
```

O helper histórico de auditoria é autenticado e permanece intacto. Uma extensão
local do lexer trata strings com backslash-newline, caracteres Unicode, raw
strings byte/C e identificadores raw. A primeira falha do lexer histórico está
preservada no pacote pai. O controle lexical verifica atomicidade desses
literais. Duas gerações determinísticas, oito mutações de artefato e seis probes
de cfg verificam retenção e classificação, sem avaliar cfg ou executar Rust.

Os joins de fontes de comandos, eventos e views usam este censo como contexto
de declaração. O arquivo externo `config/src/tui_keymap.rs` recebe disposição
própria na integração. O manifesto estrito é validado pelo integrador pai.
Ausência de erro lexical ou um path resolvido não prova alcance em runtime,
semântica de macros, integração visual ou resultado útil. Zero recibos
funcionais; G01 e a meta integral permanecem abertos.
