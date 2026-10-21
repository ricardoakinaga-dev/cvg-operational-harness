"""Format a SPEC draft (.md.txt) with the main's prettier (3.8.3, root .prettierrc.json, markdown parser), from
outside the repository so that .prettierignore (which ignores the evidence tree) does not skip it.
usage: fmt.py <file>..."""
import subprocess, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *
for name in sys.argv[1:]:
    f = EV / name
    p = subprocess.run([NODE, str(CANDIDATE / 'node_modules/prettier/bin/prettier.cjs'), '--config', str(PROJECT / '.prettierrc.json'), '--parser', 'markdown', str(f)],
                       cwd=str(RUNTIME), capture_output=True, text=True, check=True)
    f.write_text(p.stdout)
    print(name, sha(f))
