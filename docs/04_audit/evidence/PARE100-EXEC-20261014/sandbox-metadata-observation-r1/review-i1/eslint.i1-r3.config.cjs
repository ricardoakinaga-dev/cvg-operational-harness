const { createRequire } = require('node:module');
const request = createRequire("/tmp/cvg-pare100-exec-20261014-6az3hlay/worktree/eslint.config.js");
const tseslint = request('typescript-eslint');
module.exports = tseslint.config(...tseslint.configs.recommended);
