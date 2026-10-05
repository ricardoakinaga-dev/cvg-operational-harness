> Cópia de leitura: links internos apontam para o archive versionado. O relatório original byte-exato e os hashes estão no archive e manifesto. Veredito e texto técnico preservados.

# C1_LEXICAL_FRESH_STATIC_REVIEW_R1 — INVALID

Parecer independente **INVALID**, restrito à revisão funcional estática. Não concede ACCEPT/REJECT válido, qualificação nativa, adversarial ou de produção.

A primeira ferramenta leu somente authority.json e freeze.json; a segunda leu a constituição do próprio packet. O freeze inicial e final foi `907d8fbae2c6c9a00798bcc4e4d4508c8f208bd9e507020267fa73ea6a6fd4dc`, com 19.382 entradas e 41 novas trilhas de teste. Nenhum seal anterior foi observado; Root, coordenação, ledgers, skills, pareceres antigos e Builder autoverdict não foram consultados. SPECs C1 internas foram lidas como requisitos, sem seguir referências históricas.

## Incidente que invalida a revisão

O snapshot final detectou alteração de mtime de `source/node_modules/.vite-temp` durante o uso do Vitest. A causa provável é o bundling padrão da configuração através do symlink privado `output/node_modules` para dependências instaladas. Isso contraria writes apenas output e readonly de dependências, embora nenhum conteúdo de arquivo persistente tenha mudado. O incidente não foi restaurado nem houve tentativa de recuperar independência retroativamente. Evidência: [readonly-incident.json](c1-lexical-review-r1-invalid-evidence.tar.gz) (arquivo interno `readonly-incident.json`).

## Observações próprias, estritamente estáticas

1. **P1 — escopo de default de parâmetro:** `export function label(value=Function){function Function(){return "label"}return value}` retorna PASS/true e nenhum diagnóstico. O identificador no default é ligado à função do corpo. A função do corpo não está no ambiente de inicialização dos parâmetros; essa referência exige o global real e INCOMPLETE. Um controle neutro com `token`, sem qualquer API sensível, reproduz a identidade errada entre default, variável externa e função do corpo. Local: boundary-lexical.mjs:39–71. [Evidência de identidade](c1-lexical-review-r1-invalid-evidence.tar.gz) (arquivo interno `neutral-parameter-scope-proof.json`), [controle](c1-lexical-review-r1-invalid-evidence.tar.gz) (arquivo interno `parameter-scope-results.json`). Nenhum texto foi importado ou executado.
2. **P2 — scalar BigInt:** `const data={constructor:42n};export const value=data.constructor` recebe UNVERIFIED_DYNAMIC_CODE_EXECUTION/INCOMPLETE, embora a propriedade própria seja dado escalar literal em objeto imutável sem escape. A classificação escalar não inclui BigIntLiteral. Reproduzido também com objeto direto e alias constante. Local: boundary-code-execution.mjs:173–185. [Controles](c1-lexical-review-r1-invalid-evidence.tar.gz) (arquivo interno `independent-static-results.json`).

Estas observações requerem avaliação/correção e nova revisão válida; não são achados de execução nativa nem demonstração de bypass ofensivo.

## Controles e preservação

- 117/117 testes fornecidos passaram em cópia privada. Foram alterados exclusivamente o destino de evidências e dois imports relativos. A reversão dessas três substituições recupera byte a byte o original, preservando todas as assertivas e textos de fixtures. [Registro](c1-lexical-review-r1-invalid-evidence.tar.gz) (arquivo interno `test-adaptation.json`), [log](c1-lexical-review-r1-invalid-evidence.tar.gz) (arquivo interno `supplied-static-test.log`).
- 75 controles estáticos próprios: 71 expectativas satisfeitas e quatro divergências correspondentes aos dois problemas acima; sete assertivas próprias de identidade passaram. Foram preservados parâmetros, blocos, sibling scopes, catch, var hoisted, wrapper CommonJS, separação de namespaces de tipos/valores, globals reais, aliases/reatribuições conservadores, extends/decorators/computed/defaults executáveis, metadata/escape, reexports e arestas de tipos/vendor nos controles que passaram.
- Scanner instalado: INCOMPLETE, passed=false, exit=1, 3.082 fontes, 592 fontes core, 26 workspaces, 11.985 arestas, zero violações e 1.706 diagnósticos. O subprocesso fixo apenas resolveu caminhos; nenhuma fixture foi carregada. Zero violações não prova completude nem ausência de bypass. [Resultado completo](c1-lexical-review-r1-invalid-evidence.tar.gz) (arquivo interno `installed-scanner.json`).
- 371 testes originais mantêm os hashes da baseline; 41 adicionais presentes. Denominador de cobertura por leitura estática da configuração: 281/281, sem ausentes ou extras. Sete fixtures de máquina originais protegidas por hash. A suíte original product-boundary e a suíte com execuções nativas foram apenas protegidas por hash, sem execução. [Preservação](c1-lexical-review-r1-invalid-evidence.tar.gz) (arquivo interno `original-preservation.json`).
- 19.334 hashes de arquivos regulares e 48 destinos de links correspondem ao seal antes/depois; todos os inodes registrados permanecem iguais, sem links externos. Entretanto, a metadata da pasta de dependências acima mudou: **readonly integral não confirmado**. [Antes](c1-lexical-review-r1-invalid-evidence.tar.gz) (arquivo interno `integrity-before-summary.json`), [depois](c1-lexical-review-r1-invalid-evidence.tar.gz) (arquivo interno `integrity-after-summary.json`).

Todos os comandos tiveram workdir no próprio packet; sessões herdaram esse workdir. Runtime absoluto Node22 autorizado. Sem PG, Docker, provider, leitura de env, rede externa, subagentes, push, certify, produção ou execução de textos de teste. Hashing integral foi opaco, sem interpretação de documentos proibidos.

Próximo passo: corrigir identidade de defaults e prova escalar BigInt, emitir novo packet congelado e iniciar crítico novo com carregamento de configuração que escreva exclusivamente em output.
