// Own module admitted as an SDK entry only in DIAG-DP-NODE (by its own sha): the same bare imports as the published dist.
import { promises as fsp } from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { statSync } from "fs";
import readline from "readline";
import { createRequire } from "module";

export function builtins() {
  return { fs_promises: typeof fsp.readFile, os: typeof os.tmpdir, path: typeof path.join, spawn: typeof spawn, statSync: typeof statSync,
    readline: typeof readline.createInterface, createRequire: typeof createRequire };
}
