import ts from 'typescript'
import { resolve } from 'node:path'

const read = ts.readConfigFile('tsconfig.typecheck.json', ts.sys.readFile)
if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'))
const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, process.cwd())
const files = process.argv.slice(2).map((path) => resolve(path))
const program = ts.createProgram(files, { ...parsed.options, noEmit: true, incremental: false, composite: false })
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)]
if (diagnostics.length) {
  process.stdout.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (path) => path,
    getCurrentDirectory: ts.sys.getCurrentDirectory,
    getNewLine: () => '\n'
  }))
  process.exitCode = 1
} else {
  process.stdout.write(`Focused source typecheck: ${files.length} entry files, ${program.getSourceFiles().length} imported/type dependencies; zero diagnostics.\n`)
}
