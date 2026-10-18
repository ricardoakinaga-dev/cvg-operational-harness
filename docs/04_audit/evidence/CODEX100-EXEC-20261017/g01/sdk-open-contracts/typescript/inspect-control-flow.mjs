// Parse text only. Never import/resolve/evaluate a target module.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const spec = JSON.parse(fs.readFileSync(0, 'utf8'));
for (const f of spec.parser_files) {
  const actual = crypto.createHash('sha256').update(fs.readFileSync(f.resolved_path)).digest('hex');
  if (actual !== f.sha256) throw Error(`Parser hash mismatch: ${f.resolved_path}`);
}
const ts = req(spec.parser_module);
const sites = [];
const calls = [];
for (const source of spec.sources) {
  if (!/\.[jt]s$/.test(source.path)) continue;
  const sf = ts.createSourceFile(source.path, source.text, ts.ScriptTarget.Latest, true,
    source.path.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS);
  if (sf.parseDiagnostics.length) throw Error(`Parse diagnostics: ${source.path}`);
  const add = (node, kind, expression = node) => {
    const begin = expression.getStart(sf), end = expression.end;
    sites.push({ path: source.path, kind,
      start_line: sf.getLineAndCharacterOfPosition(begin).line + 1,
      end_line: sf.getLineAndCharacterOfPosition(end - 1).line + 1,
      start_byte: Buffer.byteLength(source.text.slice(0, begin)),
      end_byte_exclusive: Buffer.byteLength(source.text.slice(0, end)),
      text: source.text.slice(begin, end) });
  };
  const walk = n => {
    if (ts.isCallExpression(n) || ts.isNewExpression(n)) {
      const start = n.getStart(sf);
      calls.push({path:source.path, callee:n.expression.getText(sf),
        start_line:sf.getLineAndCharacterOfPosition(start).line+1,
        end_line:sf.getLineAndCharacterOfPosition(n.end-1).line+1,
        start_byte:Buffer.byteLength(source.text.slice(0,start)),
        end_byte_exclusive:Buffer.byteLength(source.text.slice(0,n.end)),
        text:n.getText(sf)});
    }
    if (ts.isIfStatement(n)) add(n, 'if', n.expression);
    if (ts.isSwitchStatement(n)) add(n, 'switch', n.expression);
    if (ts.isCaseClause(n)) add(n, 'case', n.expression);
    if (ts.isDefaultClause(n)) add(n, 'default', { getStart: () => n.getStart(sf), end: n.getStart(sf) + 7 });
    if (ts.isConditionalExpression(n)) add(n, 'conditional', n.condition);
    if (ts.isBinaryExpression(n) && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.QuestionQuestionEqualsToken].includes(n.operatorToken.kind)) add(n, ts.tokenToString(n.operatorToken.kind), n);
    if (ts.isForOfStatement(n) || ts.isForStatement(n)) add(n, 'loop-header', { getStart: () => n.getStart(sf), end: n.statement.getStart(sf) });
    if (ts.isCatchClause(n)) add(n, 'catch', { getStart: () => n.getStart(sf), end: n.block.getStart(sf) });
    if (ts.isTryStatement(n) && n.finallyBlock) add(n, 'finally-block', { getStart: () => n.finallyBlock.getStart(sf), end: n.finallyBlock.getStart(sf) + 1 });
    ts.forEachChild(n, walk);
  };
  walk(sf);
}
process.stdout.write(JSON.stringify({parser_version:ts.version, diagnostics:[], sites, calls}));
