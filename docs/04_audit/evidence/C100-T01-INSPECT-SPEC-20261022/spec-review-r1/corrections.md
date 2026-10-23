# Correções da SPEC0255 r1 → r2

- Revisão de origem: [review.md](review.md) e [review.json](review.json), REVISE sobre a r1 (`2bb4e541…`).
- SPEC corrigida: [r2](../../../../02_spec/0255_c100_skill_plugin_offline_inspection.md). O sha256 está em [spec-r2.json](../spec-r2.json).
- Decisão do usuário e defaults do lead: [decisions-20261022.json](../decisions-20261022.json).
- Sonda das primitivas da r2, Node v22.23.2: [script](../r2-mechanics-probe.mjs.txt) e [saída](../r2-mechanics-probe-output.json).
- A sonda do crítico foi copiada byte a byte do scratchpad para preservação: [script](critic-probe.mjs.txt) e [saída](critic-probe-output.json).
- Na r2, os mutantes se chamam `MU…`, para não confundir com os obrigatórios `M1–M7`.

## Obrigatórios

| Item | O que mudou | Onde na r2 |
| --- | --- | --- |
| **M1** — ABA passa pela releitura dev/ino | Modelo de ameaça declarado (escritor concorrente não confiável; falha fechado) e plataforma Linux com `/proc`. Cada diretório é fixado por fd `O_RDONLY\|O_DIRECTORY\|O_NOFOLLOW`, e cada filho é aberto por `/proc/self/fd/<dfd>/<nome>`, que emula `openat`. O root é conferido por `readlink` do fd (substitui o `realpath`). A assinatura bigint completa (`dev`, `ino`, `mode`, `nlink`, `size`, `mtimeNs`, `ctimeNs`) é comparada antes, durante e depois, como em `boundary-installed-identity.mjs:227-283`, em arquivo, diretório e root. O risco residual é escrito (timestamp grosso afeta só conteúdo de dentro). A prova do ABA está no SK05b(iii); MU04 e MU05 morrem por ela | §3, §4 (I3), §8.2, §8.5–8.7, §12 (SK05b), §16 |
| **M2** — listagem sem teto | `opendirSync` com `readSync` até cap + 1. Se estourar, nada daquele diretório é processado. Vale para o root e para os subdiretórios. A seleção não lista: busca pelo nome. Prova no SK06, com `trace`; mutantes MU06 e MU07 | §7.3, §8.3, §7.10, §12 (SK06) |
| **M3** — caps, JSON inválido e agregação | (a) Cada limite tem um código e um efeito: `FRONTMATTER_TOO_LARGE` e `DESCRIPTION_TOO_LONG` são `INVALID` e foram para o SK03; os demais são `CAP_EXCEEDED` ou `DEADLINE_EXCEEDED` e vão para o SK06. (b) `MANIFEST_SYNTAX_INVALID` sem mensagem nem posição, com prova no SK03 e mutante MU30. (c) Agregação escrita para item, root e relatório. A relação com a seleção é a P20 mais o I13 | §7.3, §7.5, §7.8, §7.9 (condição 1), §7.10, §9, §12 |
| **M4** — gramática e decodificação | `TextDecoder` fatal com `ignoreBOM: true` e recusa explícita do BOM, para `skill.json`, `SKILL.md` e referências. Conjunto proibido fechado: `\p{Cc}`, `\p{Cf}`, `\p{Zl}`, `\p{Zp}` e não-caracteres (inclui bidi, zero-width, U+0085, U+2028 e U+2029), aplicado também à descrição do `skill.json`. Regra exata de abertura, fechamento, cabeçalho vazio, limite de 32 linhas e valor terminado em `:`. Chave duplicada comparada depois de decodificar o escape (`id`). Projeção sempre em uma linha. Mutantes MU26–MU30 | §7.5, §8.10, §12 (SK03) |
| **M5** — provas e mutantes | M01 dividido em MU01a (arquivo sem `O_NOFOLLOW`, SK05b(i)), MU01b (`stat` no lugar de `lstat`, SK05 com `trace`) e MU01c (diretório sem `O_NOFOLLOW`, SK05b(ii)). O mesmo foi feito com MU02a/b e MU03a/b. SK08b passou a usar duas skills pequenas e válidas e `trace` (MU11). SK10c foi separado em `base` (regressão verde) e `new` (vermelho na base, mata MU14b). Testes novos: redação fail-closed (SK15), conhecimento (SK16), conflito (SK17), formato não habilitado (SK18) e erro de FS (SK19). Negativos no `dist` para A05, A07, A10 e A11 (SK13) | §12, §12.1 |
| **M6** — ciclo P1/P2 | Aplicada a decisão do usuário: a 0255-A é a primeira SPEC da PAR-T07; o `itemDigest` é o hash canônico de skill (`cvg-skill-hash-v1`); o lead escreve e o Codex revisa os aceites; não há avaliador paralelo. Mapa T07 → 0255-A; coluna "base" ou "proposta à T07" em cada aceite; gate com a revisão do Codex e a PAR-K05; a C06 sai do gate da 0255-A e fica para a 0255-C | cabeçalho, §1.5, §2.9, §5, §13, §14, §17.1 |
| **M7** — loader | Tabela de antes e depois escrita, caso a caso. `skillPath` passa a relativo ao root. Caps fixos do loader declarados. O loader aceita root não canônico, resolvendo uma vez (entrada confiável do host); a inspeção exige root canônico. Symlink no root dá "entrada inacessível" (pdsh-031). A mensagem de JSON não copia o V8. As regras extras da inspeção não valem para o loader | §7.12, §12 (SK14), §16 |

## Opcionais

| Item | Tratamento | Onde |
| --- | --- | --- |
| O1 | `bytes` só para arquivo regular; `type` no `fileEntry` | §4 (I6), §7.6, §8.9, SK01 |
| O2 | I9 e A11 reescritos como "nos padrões do redator do host"; identificadores passam pelo redator (`SECRET_PATTERN_IN_IDENTIFIER`, P18); charset do `field` definido; mensagem de `SkillInspectionError` só com código e campo; limitação `ghp_…` declarada no SK11 | §4, §7.1, §7.5, §7.11, §13, §17.3 |
| O3 | Retirada a afirmação de que o relatório inteiro cabe no `canonicalizeJson`; teto de `maxEntriesPerRoot` caiu para 256, o que mantém o `inputDigest` em cerca de 12,3 mil nós | §7.3, §7.6 |
| O4 | A 0255-B projeta sobre o inventário da PAR-H04 e não constrói outro | §10 |
| O5 | Autoridade da seleção declarada como do chamador; a 0255-C só com digests do catálogo da T07; corpo devolvido do mesmo buffer do hash (MU24, SK07b) | §3 (G3), §7.10, P11 |
| O6 | Grant por `agentExposesTool` mais a exclusão explícita do curinga; consulta de digest só por `Object.hasOwn` (id `constructor`) | §7.9 (condições 4 e 5), SK10, MU33 |
| O7 | Precedente citado passa a ser `boundary-installed-identity.mjs`; cópia privada no harness registrada como achado de consolidação | §1.3, §8.6, §16 |
| O8 | Checagem de plataforma e constantes (`PLATFORM_UNSUPPORTED`), antes de qualquer acesso ao root | §3, §7.1, §7.2, SK20, MU37 |
| O9 | Ordem de precedência da classificação e um código de recusa por entrada; diretório oculto não é percorrido; `SKILL.md` com bit de execução é recusado | §7.4 |
| O10 | Estimador com vazio = 0; corpo presente e vazio é `BODY` com 0 token (MU32) | §7.7, SK08 |
| O11 | Escalar ambíguo de YAML recusado (`FRONTMATTER_AMBIGUOUS_SCALAR`, P19) | §7.5, SK03 |
| O12 | A colisão da 0029 saiu do gate e virou risco e observação ao integrador; os nove reusos da Q01 foram listados | §14, §16 |
| O13 | Funções síncronas declaradas fora do caminho de requisição da API (I12) | §4, §16 |
| O14 | Contagem do recon corrigida (2.147 linhas em 1.367 arquivos, contagem do crítico) | [recon §1.3](../recon.md) |

## Pontos de divergência ou de escolha diferente

1. **M5(a), segundo caso.** O crítico propôs matar o "diretório-symlink" por "marcador ausente". Na r2 isso não basta. O `open` do diretório com `O_NOFOLLOW` (§8.5) também recusa, e uma camada mascara a outra: com `stat` no lugar de `lstat`, o marcador continua ausente. Por isso o MU01b morre pelo `trace` (nenhum `open` em entrada recusada pelo `lstat`). O caso do marcador ficou para o MU01c, em corrida (SK05b(ii)), onde os códigos se distinguem.
2. **M3(c), escolha de desenho (P20).** O crítico pediu só a regra de agregação. A r2 foi além. Admitir **um item** não exige mais a cobertura do relatório inteira: bastam a cobertura do item, os roots abertos e sem mudança, e a unicidade por busca de nome. O relatório só sai `ADMITTED` com cobertura `COMPLETE`. O motivo: com o M2, a seleção não lista, e a r1 exigia a cobertura do relatório só para detectar duplicata. A busca por nome detecta a duplicata de forma exata. Isso alinha a admissão com a seleção (I13). Peço ao crítico que confira esse ponto com cuidado, porque ele relaxa uma condição da r1.
3. **M7(c).** A r2 **não** exige root canônico no loader, ao contrário da inspeção. O root do loader é entrada confiável do host. Os testes usam `tmpdir()`, e endurecer isso não protege nada dentro do root. O loader resolve o root uma vez e, dali em diante, não segue nada.
4. **M3(b), observação.** Na saída da sonda do crítico (seção D), a mensagem do V8 daquele caso **não** trazia trecho do conteúdo (`containsSourceExcerpt: false`). O trecho aparece em outro tipo de erro ("Unexpected token …"), como o texto da revisão diz. A regra da r2 cobre os dois casos: nunca copiar a mensagem.

Não há divergência de mérito com os obrigatórios. Todos foram aceitos.
