"""DIAGNOSTIC ONLY (never promoted): private engine copy that dumps, at the end of the non-census analysis, the
semantic resolution edges (importer -> resolved file), the starts and the analyzed files to CVG_DIAG_GRAPH
(forwarded to the worker). Limits, rules and outputs are unchanged. usage: diag_patch.py <tools>/scripts"""
import sys
from pathlib import Path
p = Path(sys.argv[1]) / 'boundary-semantic-engine.mjs'
s = p.read_text()
old = """    .sort((a, b) => sort(a.key, b.key))
  out.proofs.sort((a, b) => sort(a.id, b.id))
  return out
}"""
assert s.count(old) == 1
s = s.replace(old, """    .sort((a, b) => sort(a.key, b.key))
  out.proofs.sort((a, b) => sort(a.id, b.id))
  // DIAGNOSTIC COPY ONLY: dump the semantic graph of the non-census pass.
  if (process.env.CVG_DIAG_GRAPH && !census)
    fs.writeFileSync(
      process.env.CVG_DIAG_GRAPH,
      JSON.stringify({
        root,
        starts: input?.starts ?? [],
        files: [...astFiles.keys()].sort(),
        edges: Object.fromEntries(
          [...resolutionEdges].map(([k, v]) => [k, [...v].sort()])
        ),
        reachedPackages: [...reachedPackages.keys()].sort()
      })
    )
  return out
}""")
old = """          LC_ALL: 'C',
          TZ: 'UTC'
        },
        cwd: path.dirname(SELF),"""
assert s.count(old) == 1
s = s.replace(old, """          LC_ALL: 'C',
          TZ: 'UTC',
          ...(process.env.CVG_DIAG_GRAPH
            ? { CVG_DIAG_GRAPH: process.env.CVG_DIAG_GRAPH }
            : {})
        },
        cwd: path.dirname(SELF),""")
p.write_text(s)
print('ok')
