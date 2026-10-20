import sys, subprocess
from pathlib import Path
subprocess.run([sys.executable, "-I", "-B", str(Path(__file__).with_name("mutation_patch.py")), "M2", sys.argv[1]], check=True)
