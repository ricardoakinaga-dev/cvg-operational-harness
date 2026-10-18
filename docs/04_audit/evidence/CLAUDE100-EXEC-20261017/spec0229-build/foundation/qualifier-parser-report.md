# Parser SPEC0229 — IMPLEMENTED

Task C100-Q01-QUALIFIER-001. Candidata baseada em d80e9bb8. SPEC/autoridade verificadas pelos hashes exatos do brief.

Três fontes novas e congeladas na candidata:

- `tests/claude100/qualification/strict-json.mjs` — SHA-256 `4e077111127f7db13de3d9d9024c5508be2a835a287847063a511c88c55923a9`
- `tests/claude100/qualification/strict-json.test.ts` — SHA-256 `ab26a1b7cb5c3e5dc05d610e477ac9c886fcc47f20215103ffa2628ff17c98c0`
- `tests/claude100/qualification/strict-json.d.mts` — SHA-256 `e1e1161f1b0a6a1ef3e9e055a922cd14254750a54e5507b22da6e14a0af1cdb7`

Parser recursivo independente, sem JSON.parse/eval/reviver, normalização, kitQ03 ou lógica de qualificação. Usa a QualificationError fornecida pelo Lead, intacta, sempre INVALID_INPUT para JSON/caps/options inválidos. Objetos comuns com propriedades de dados próprias; rejeita explicitamente __proto__/constructor/prototype. Preserva Unicode sem normalização e -0 normativo. UTF-8 fatal; BOM inicial rejeitado.

Limites: 64 containers (raiz=1, escalar=0), 65536 bytes UTF-8 por string decodificada/chave e 4194304 bytes de entrada. Opções inteiras entre zero e o default, apenas propriedades próprias de dados e nomes conhecidos. Caps exatos/+1 e multibyte cobertos; duplicatas escapadas falham antes do segundo valor.

Verificação em Node v22.23.2: 237 testes PASS, zero falhas/skips/todo, incluindo 512 documentos determinísticos. Sonda direta: todos os 65536 code units UTF-16, 36 combinações de surrogates e 2016 combinações numéricas; 131360 aceitações e 67339 rejeições verificadas com a classe QualificationError exata. Typecheck focal, ESLint e Prettier PASS. Comandos, timestamps e logs no JSON companheiro. Primeiro red por módulo ausente e erro inicial de tipos da classe adversarial preservados; este último corrigido com anotações never sem mudar o comportamento.

O typecheck cobre o teste TS e a declaração. Há apenas self-review do builder; revisão independente e integração pertencem ao Lead. O loader inicial do Vitest criou bundles transitórios em node_modules/.vite-temp da candidata, vazio após execução; execução final usa --configLoader native e cache privado. Nenhum fonte alheio alterado.

Estado máximo IMPLEMENTED. Nenhum CQDONE/paridade/PASS_CURRENT; sem PG/E2E/certify/rede/instalação/commits/descendentes. Ledgers compartilhados readonly: Lead deve registrar o delta "parser sublane IMPLEMENTED", manter CQ01–CQ08/Q01 abertos e integrar/revisar os hashes. Fontes congeladas a partir deste retorno.
