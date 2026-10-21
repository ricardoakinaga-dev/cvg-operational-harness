"""Extra fixtures (evidence only, not in the test) for the R1 review optionals: R1-P3-01 (Annex B.3.3 block function
in sloppy CJS, pre-existing in v6, outside SPEC0247) and R1-P3-04 (require.resolve called and not called; ESM with an
undecided if). Writes fixtures-0247-extra.json. usage: catalog_extra.py"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *

P = {'products/x.js': 'module.exports = 1\n'}
F = [
 {'id': 'AnnexB-block-export', 'group': 'P3-01', 'files': {'package.json': '{}', 'entry.js': "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
   'm.js': 'function f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n', **P}, 'origins': [],
  'why': 'R1-P3-01 (fixture do crítico): em CJS sloppy, a f do bloco reatribui a f do wrapper (Annex B.3.3); em runtime m é a f interna e carrega products/x.js'},
 {'id': 'AnnexB-if-export', 'group': 'P3-01', 'files': {'package.json': '{}', 'entry.js': "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
   'm.js': 'function f() { return 1 }\nif (true) { function f(s) { return require(s) } }\nmodule.exports = f\n', **P}, 'origins': [],
  'why': 'R1-P3-01: mesma forma com if (true) { … }'},
 {'id': 'AnnexB-top-call', 'group': 'P3-01', 'files': {'package.json': '{}', 'entry.js': "require('./m.js')\nmodule.exports = 1\n",
   'm.js': "function f() { return 1 }\n{ function f(s) { return require(s) } }\nf('./products/x.js')\nmodule.exports = 1\n", **P}, 'origins': [],
  'why': 'R1-P3-01: sem export; chamada de f no topo depois do bloco'},
 {'id': 'AnnexB-strict-control', 'group': 'P3-01', 'files': {'package.json': '{}', 'entry.js': "const m = require('./m.js')\nm('./products/x.js')\nmodule.exports = 1\n",
   'm.js': "'use strict'\nfunction f() { return 1 }\n{ function f(s) { return require(s) } }\nmodule.exports = f\n", **P}, 'origins': [],
  'why': 'R1-P3-01, controle: em strict a f do bloco fica no bloco; em runtime m é a f externa'},
 {'id': 'REQUIRE-resolve-called', 'group': 'P3-04', 'files': {'package.json': '{}', 'entry.js': "require('./m.js')\nmodule.exports = 1\n",
   'm.js': "const p = require.resolve('./n.js')\nmodule.exports = 1\n", 'n.js': 'module.exports = 1\n'}, 'origins': [],
  'why': 'R1-P3-04 (a): require.resolve chamado não é alça (sem UNKNOWN_CJS_EXPORTS); a leitura de require.resolve já dá raiz na v6'},
 {'id': 'REQUIRE-resolve-not-called', 'group': 'P3-04', 'files': {'package.json': '{}', 'entry.js': "require('./m.js')\nmodule.exports = 1\n",
   'm.js': 'const r = require.resolve\nmodule.exports = 1\n'}, 'origins': [],
  'why': 'R1-P3-04 (a), contraste: require.resolve não chamado é LOADER_REFERENCE'},
 {'id': 'ESM-undecided-if', 'group': 'P3-04', 'files': {'package.json': '{"type":"module"}', 'entry.js': "import { v } from './m.js'\nexport const w = v\n",
   'm.js': 'if ({}) {\n  const a = 1\n} else {\n  const b = 2\n}\nexport const v = 1\n'}, 'origins': [],
  'why': 'R1-P3-04 (b): ESM com if indecidido; a junção não roda em ESM e o resultado é igual ao da base'},
]
save('fixtures-0247-extra.json', {'task': TASK, 'generatedAt': now(), 'purpose': 'evidência dos opcionais R1-P3-01 e R1-P3-04; fora do teste', 'count': len(F), 'fixtures': F})
print(len(F))
