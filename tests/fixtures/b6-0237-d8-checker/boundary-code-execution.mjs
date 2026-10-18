import { assignedValues } from './boundary-lexical.mjs'

// Dynamic evaluators and independent Node execution acquire modules outside the
// literal resolver grammar. Keep them unknown, including local alias escapes.
export function auditDynamicCodeExecution(options) {
  const {
    ts,
    source,
    lexical,
    runtimeNodes,
    typeOnly,
    literal,
    isLoader,
    isBuiltinGetter,
    isGlobal,
    isDeclarationName,
    loaderDiagnostic
  } = options
  const { identity, writeIdentity, global } = lexical
  const modules = new Set([
    'vm',
    'node:vm',
    'child_process',
    'node:child_process',
    'worker_threads',
    'node:worker_threads'
  ])
  const inertProperties = new Set([
    'constants',
    'isContext',
    'measureMemory',
    'isMainThread',
    'threadId',
    'parentPort',
    'workerData',
    'MessageChannel',
    'MessagePort',
    'BroadcastChannel',
    'SHARE_ENV',
    'getEnvironmentData',
    'setEnvironmentData',
    'markAsUntransferable',
    'isMarkedAsUntransferable',
    'receiveMessageOnPort'
  ])
  const reflection = new Set([
    'get',
    'construct',
    'getPrototypeOf',
    'getOwnPropertyDescriptor',
    'getOwnPropertyDescriptors'
  ])
  const capabilities = new Map([
    [global('eval'), 'executor'],
    [global('Function'), 'executor'],
    [global('Object'), 'reflection'],
    [global('Reflect'), 'reflection']
  ])
  const unwrap = (node) => {
    while (
      node &&
      (ts.isParenthesizedExpression(node) ||
        ts.isAsExpression(node) ||
        ts.isSatisfiesExpression(node) ||
        ts.isTypeAssertionExpression(node) ||
        ts.isNonNullExpression(node) ||
        ts.isAwaitExpression(node))
    )
      node = node.expression
    return node
  }
  const property = (node) =>
    ts.isPropertyAccessExpression(node)
      ? node.name.text
      : ts.isElementAccessExpression(node)
        ? literal(node.argumentExpression)
        : undefined
  const access = (node) =>
    node &&
    (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
  const assignment = (node) =>
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
  const written = (node) => {
    // Assignment-pattern leaves are writes even several AST levels below '='.
    while (
      node.parent &&
      ((ts.isPropertyAssignment(node.parent) &&
        node.parent.initializer === node) ||
        ts.isShorthandPropertyAssignment(node.parent) ||
        ts.isObjectLiteralExpression(node.parent) ||
        ts.isArrayLiteralExpression(node.parent) ||
        ts.isSpreadAssignment(node.parent) ||
        ts.isSpreadElement(node.parent) ||
        ((ts.isParenthesizedExpression(node.parent) ||
          ts.isAsExpression(node.parent) ||
          ts.isSatisfiesExpression(node.parent) ||
          ts.isTypeAssertionExpression(node.parent) ||
          ts.isNonNullExpression(node.parent)) &&
          node.parent.expression === node))
    )
      node = node.parent
    const parent = node.parent
    return (
      parent &&
      ((assignment(parent) && parent.left === node) ||
        ((ts.isPrefixUnaryExpression(parent) ||
          ts.isPostfixUnaryExpression(parent)) &&
          [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(
            parent.operator
          )) ||
        ts.isDeleteExpression(parent) ||
        ((ts.isForInStatement(parent) || ts.isForOfStatement(parent)) &&
          parent.initializer === node))
    )
  }
  const references = new Map()
  for (const node of runtimeNodes) {
    if (
      !ts.isIdentifier(node) ||
      isDeclarationName(node) ||
      (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)
    )
      continue
    const key = identity(node)
    if (!references.has(key)) references.set(key, [])
    references.get(key).push(node)
  }
  const stableInitializer = (node, object = false) => {
    const key = identity(node)
    const declarations = key?.declarations
    if (declarations?.length !== 1) return undefined
    const declaration = declarations[0]
    if (
      !ts.isVariableDeclaration(declaration) ||
      !declaration.initializer ||
      !(declaration.parent.flags & ts.NodeFlags.Const)
    )
      return undefined
    if (
      declaration.parent.parent.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      )
    )
      return undefined
    for (const ref of references.get(key) ?? []) {
      if (written(ref)) return undefined
      if (!object) continue
      let reference = ref
      while (
        reference.parent &&
        (ts.isParenthesizedExpression(reference.parent) ||
          ts.isAsExpression(reference.parent) ||
          ts.isTypeAssertionExpression(reference.parent) ||
          ts.isNonNullExpression(reference.parent) ||
          ts.isSatisfiesExpression(reference.parent))
      )
        reference = reference.parent
      const parent = reference.parent
      // No aliases, escapes, calls, mutation or destructuring writes may
      // invalidate a literal object's own scalar property proof.
      if (
        ts.isVariableDeclaration(parent) &&
        parent.initializer === reference &&
        ts.isObjectBindingPattern(parent.name) &&
        parent.name.elements.every(
          (item) =>
            !item.dotDotDotToken &&
            !item.initializer &&
            ts.isIdentifier(item.name) &&
            !ts.isComputedPropertyName(item.propertyName ?? item.name)
        )
      )
        continue
      let callable = parent
      while (
        callable?.parent &&
        (ts.isParenthesizedExpression(callable.parent) ||
          ts.isAsExpression(callable.parent) ||
          ts.isSatisfiesExpression(callable.parent) ||
          ts.isTypeAssertionExpression(callable.parent) ||
          ts.isNonNullExpression(callable.parent)) &&
        callable.parent.expression === callable
      )
        callable = callable.parent
      const invocation = callable?.parent
      if (
        !access(parent) ||
        parent.expression !== reference ||
        written(parent) ||
        ((ts.isCallExpression(invocation) || ts.isNewExpression(invocation)) &&
          invocation.expression === callable) ||
        (ts.isTaggedTemplateExpression(invocation) &&
          invocation.tag === callable)
      )
        return undefined
    }
    return declaration.initializer
  }
  const scalar = (expression, depth = 0) => {
    const node = unwrap(expression)
    if (!node || depth > 64) return false
    if (
      ts.isStringLiteralLike(node) ||
      ts.isNumericLiteral(node) ||
      ts.isBigIntLiteral(node) ||
      [
        ts.SyntaxKind.TrueKeyword,
        ts.SyntaxKind.FalseKeyword,
        ts.SyntaxKind.NullKeyword
      ].includes(node.kind)
    )
      return true
    if (ts.isIdentifier(node)) {
      const initializer = stableInitializer(node)
      return Boolean(initializer && scalar(initializer, depth + 1))
    }
    if (
      ts.isPrefixUnaryExpression(node) &&
      [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(
        node.operator
      )
    )
      return scalar(node.operand, depth + 1)
    if (ts.isConditionalExpression(node))
      return (
        scalar(node.whenTrue, depth + 1) && scalar(node.whenFalse, depth + 1)
      )
    if (!access(node)) return false
    const name = property(node)
    let base = unwrap(node.expression)
    if (ts.isIdentifier(base)) base = unwrap(stableInitializer(base, true))
    if (!base || !ts.isObjectLiteralExpression(base) || name === undefined)
      return false
    let selected
    for (const item of base.properties) {
      if (
        !ts.isPropertyAssignment(item) ||
        ts.isComputedPropertyName(item.name)
      )
        return false
      const key = ts.isIdentifier(item.name)
        ? item.name.text
        : literal(item.name)
      if (key === '__proto__') return false
      if (key === name) selected = item.initializer
    }
    return Boolean(selected && scalar(selected, depth + 1))
  }
  const join = (left, right) => {
    const rank = { reflection: 1, namespace: 2, executor: 3 }
    return (rank[left] ?? 0) >= (rank[right] ?? 0) ? left : right
  }
  const classify = (expression, depth = 0) => {
    const node = unwrap(expression)
    if (!node) return undefined
    if (depth > 128) return 'executor'
    if (ts.isIdentifier(node)) return capabilities.get(identity(node))
    if (
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)
    ) {
      const name = property(node),
        base = classify(node.expression, depth + 1)
      if (isGlobal(node.expression) && ['eval', 'Function'].includes(name))
        return 'executor'
      if (name === 'constructor') return scalar(node) ? undefined : 'executor'
      if (base === 'namespace')
        return inertProperties.has(name) ? undefined : 'executor'
      if (base === 'reflection' && (name === undefined || reflection.has(name)))
        return 'executor'
      if (base === 'executor' && !['name', 'length'].includes(name))
        return 'executor'
      if (
        name === undefined &&
        (ts.isArrowFunction(unwrap(node.expression)) ||
          ts.isFunctionExpression(unwrap(node.expression)) ||
          ts.isClassExpression(unwrap(node.expression)))
      )
        return 'executor'
    }
    if (ts.isCallExpression(node)) {
      if (
        (isLoader(node.expression) ||
          isBuiltinGetter(node.expression) ||
          node.expression.kind === ts.SyntaxKind.ImportKeyword) &&
        modules.has(literal(node.arguments[0]))
      )
        return 'namespace'
      if (classify(node.expression, depth + 1) === 'executor') return 'executor'
    }
    if (ts.isConditionalExpression(node))
      return join(
        classify(node.whenTrue, depth + 1),
        classify(node.whenFalse, depth + 1)
      )
    if (ts.isBinaryExpression(node)) {
      if (node.operatorToken.kind === ts.SyntaxKind.CommaToken)
        return classify(node.right, depth + 1)
      if (
        [
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.QuestionQuestionToken
        ].includes(node.operatorToken.kind)
      )
        return join(
          classify(node.left, depth + 1),
          classify(node.right, depth + 1)
        )
    }
    return undefined
  }
  const bind = (name, kind) => {
    if (!kind) return false
    const rank = { reflection: 1, namespace: 2, executor: 3 },
      old = capabilities.get(name)
    if (old && rank[old] >= rank[kind]) return false
    capabilities.set(name, kind)
    return true
  }
  for (const node of runtimeNodes) {
    if (typeOnly(node)) continue
    if (
      ts.isExportDeclaration(node) &&
      modules.has(literal(node.moduleSpecifier))
    ) {
      const names = node.exportClause
      if (
        !names ||
        !ts.isNamedExports(names) ||
        names.elements.some(
          (item) =>
            !item.isTypeOnly &&
            !inertProperties.has(item.propertyName?.text ?? item.name.text)
        )
      )
        loaderDiagnostic(node, 'UNVERIFIED_DYNAMIC_CODE_EXECUTION')
    }
    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      modules.has(literal(node.moduleReference.expression))
    )
      bind(identity(node.name), 'namespace')
    if (
      !ts.isImportDeclaration(node) ||
      !modules.has(literal(node.moduleSpecifier))
    )
      continue
    const clause = node.importClause
    if (clause?.name) bind(identity(clause.name), 'namespace')
    const bindings = clause?.namedBindings
    if (bindings && ts.isNamespaceImport(bindings))
      bind(identity(bindings.name), 'namespace')
    if (bindings && ts.isNamedImports(bindings))
      for (const item of bindings.elements) {
        if (item.isTypeOnly) continue
        const name = item.propertyName?.text ?? item.name.text
        bind(
          identity(item.name),
          name === 'default'
            ? 'namespace'
            : inertProperties.has(name)
              ? undefined
              : 'executor'
        )
      }
  }
  const visitBinding = (pattern, expression, visit) =>
    assignedValues(ts, pattern, expression, literal, (name, value) =>
      visit(writeIdentity(name), classify(value))
    )
  let changed = true
  while (changed) {
    changed = false
    const record = (name, kind) => {
      if (bind(name, kind)) changed = true
    }
    for (const [body, parameter] of lexical.initialTransfers)
      record(identity(body), classify(parameter))
    for (const node of runtimeNodes) {
      if (
        (ts.isVariableDeclaration(node) ||
          ts.isParameter(node) ||
          ts.isBindingElement(node)) &&
        node.initializer
      )
        visitBinding(node.name, node.initializer, record)
      if (ts.isBinaryExpression(node) && assignment(node))
        visitBinding(node.left, node.right, record)
    }
  }
  const knownFunction = (expression, depth = 0) => {
    const node = unwrap(expression)
    if (!node || depth > 64) return false
    if (
      access(node) &&
      isGlobal(node.expression) &&
      ['eval', 'Function'].includes(property(node))
    )
      return true
    if (!ts.isIdentifier(node)) return false
    if ([global('eval'), global('Function')].includes(identity(node)))
      return true
    const initializer = stableInitializer(node)
    return Boolean(initializer && knownFunction(initializer, depth + 1))
  }
  const scalarMetadata = (node) => {
    if (
      !access(node) ||
      !['name', 'length'].includes(property(node)) ||
      !knownFunction(node.expression)
    )
      return false
    // Any property write on an executor alias makes metadata uncertain.
    return !runtimeNodes.some(
      (item) =>
        written(item) &&
        ((ts.isIdentifier(item) &&
          [global('eval'), global('Function')].includes(identity(item))) ||
          (access(item) &&
            (classify(item.expression) === 'executor' ||
              (isGlobal(item.expression) &&
                [undefined, 'eval', 'Function'].includes(property(item))))))
    )
  }
  const reported = new Set()
  for (const node of runtimeNodes) {
    if (typeOnly(node) || isDeclarationName(node)) continue
    if (
      !(
        ts.isIdentifier(node) ||
        ts.isPropertyAccessExpression(node) ||
        ts.isElementAccessExpression(node) ||
        ts.isCallExpression(node)
      )
    )
      continue
    const kind = classify(node)
    if (!kind || kind === 'reflection') continue
    const parent = node.parent
    if (parent && ts.isPropertyAccessExpression(parent) && parent.name === node)
      continue
    if (
      parent &&
      access(parent) &&
      parent.expression === node &&
      scalarMetadata(parent)
    )
      continue
    let value = node
    while (
      value.parent &&
      (ts.isParenthesizedExpression(value.parent) ||
        ts.isAsExpression(value.parent) ||
        ts.isSatisfiesExpression(value.parent) ||
        ts.isNonNullExpression(value.parent) ||
        ts.isTypeAssertionExpression(value.parent) ||
        ts.isAwaitExpression(value.parent))
    )
      value = value.parent
    const owner = value.parent
    if (
      owner &&
      access(owner) &&
      owner.expression === value &&
      scalarMetadata(owner)
    )
      continue
    if (
      owner &&
      ts.isVariableDeclaration(owner) &&
      owner.initializer === value &&
      !owner.parent?.parent?.modifiers?.some(
        (m) => m.kind === ts.SyntaxKind.ExportKeyword
      )
    )
      continue
    if (
      owner &&
      ts.isBinaryExpression(owner) &&
      owner.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      owner.right === value &&
      ts.isIdentifier(owner.left)
    )
      continue
    if (
      kind === 'namespace' &&
      owner &&
      (ts.isPropertyAccessExpression(owner) ||
        ts.isElementAccessExpression(owner)) &&
      owner.expression === value
    )
      continue
    const diagnostic =
      owner &&
      (ts.isCallExpression(owner) || ts.isNewExpression(owner)) &&
      owner.expression === value
        ? owner
        : node
    const key = diagnostic.getStart(source)
    if (reported.has(key)) continue
    reported.add(key)
    loaderDiagnostic(diagnostic, 'UNVERIFIED_DYNAMIC_CODE_EXECUTION')
  }
  return { scalarMetadata }
}
