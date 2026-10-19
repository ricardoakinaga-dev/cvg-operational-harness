const tseslint = require("/tmp/cvg-pare100-exec-20261014-6az3hlay/worktree/node_modules/typescript-eslint");
module.exports = tseslint.config(...tseslint.configs.recommended.map(c => ({...c, basePath: "/tmp/cvg-pare100-exec-20261014-6az3hlay/sandbox-metadata-observation-r1"})));
