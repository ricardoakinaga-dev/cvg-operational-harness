// Binding only: no module resolution, libraries, emit, or evaluated source.
// The dependency walker independently retains the complete parsed AST.
export function createBoundaryLexical(
  ts,
  source,
  commonJs = false,
  reportUnavailable
) {
  const options = { noResolve: true, noLib: true, noEmit: true, allowJs: true }
  const host = {
    getSourceFile: (name) => (name === source.fileName ? source : undefined),
    getDefaultLibFileName: () => '',
    writeFile: () => {},
    getCurrentDirectory: () => '',
    getDirectories: () => [],
    fileExists: (name) => name === source.fileName,
    readFile: () => undefined,
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n'
  }
  const checker = ts
    .createProgram([source.fileName], options, host)
    .getTypeChecker()
  // Only stack exhaustion from a necessary checker query is unavailable
  // analysis. Other failures retain their original error behavior.
  const query = (operation, node, run) => {
    try {
      return run()
    } catch (error) {
      if (
        !(error instanceof RangeError) ||
        error.message !== 'Maximum call stack size exceeded'
      )
        throw error
      const diagnostic = {
        reason: 'UNAVAILABLE_LEXICAL_BINDING_ANALYSIS',
        file: source.fileName,
        operation,
        identifier: node.text,
        position: node.getStart(source),
        error: error.message
      }
      if (!reportUnavailable)
        throw new Error(
          `boundary_lexical_analysis_incomplete:${source.fileName}:${operation}:${diagnostic.position}`,
          { cause: error }
        )
      reportUnavailable(diagnostic)
      // Keep indeterminate bindings separate from both globals and resolved
      // symbols. The callback makes their file explicitly INCOMPLETE.
      return { unavailable: diagnostic }
    }
  }
  const globals = new Map()
  const global = (name) => {
    if (!globals.has(name)) globals.set(name, { global: name })
    return globals.get(name)
  }
  // JavaScript creates distinct parameter and body var environments when
  // parameters contain expressions. TypeScript's binder can merge those
  // cells or resolve a body function reference to the parameter instead.
  const environments = []
  const initialTransfers = []
  const within = (node, ancestor) => {
    for (let current = node; current; current = current.parent)
      if (current === ancestor) return true
    return false
  }
  const bindingNames = (pattern, visit) => {
    if (ts.isIdentifier(pattern)) visit(pattern)
    else if (
      ts.isObjectBindingPattern(pattern) ||
      ts.isArrayBindingPattern(pattern)
    )
      for (const element of pattern.elements)
        if (ts.isBindingElement(element)) bindingNames(element.name, visit)
  }
  const collect = (node) => {
    if (ts.isFunctionLike(node) && node.body) {
      let expressions = false
      const parameterExpressions = (item) => {
        // ContainsExpression belongs to the emitted binding grammar. Types
        // (including their computed names) do not create runtime environments.
        if (item.initializer) expressions = true
        const pattern = item.name
        if (
          ts.isObjectBindingPattern(pattern) ||
          ts.isArrayBindingPattern(pattern)
        )
          for (const element of pattern.elements) {
            if (!ts.isBindingElement(element)) continue
            if (
              element.propertyName &&
              ts.isComputedPropertyName(element.propertyName)
            )
              expressions = true
            parameterExpressions(element)
          }
      }
      for (const parameter of node.parameters) parameterExpressions(parameter)
      {
        const params = new Map(),
          parameterKeys = new Map(),
          bodies = new Map()
        for (const parameter of node.parameters)
          bindingNames(parameter.name, (name) => params.set(name.text, name))
        const bodyDeclarations = (item) => {
          if (ts.isFunctionDeclaration(item)) {
            if (item.parent === node.body && item.name) {
              const existing = bodies.get(item.name.text)
              bodies.set(item.name.text, {
                name: item.name,
                declarations: [...(existing?.declarations ?? []), item],
                function: true,
                initialFunction: item
              })
            }
            return
          }
          if (ts.isFunctionLike(item) || ts.isClassLike(item)) return
          if (
            ts.isVariableDeclaration(item) &&
            ts.isVariableDeclarationList(item.parent) &&
            !(item.parent.flags & ts.NodeFlags.BlockScoped)
          )
            bindingNames(item.name, (name) => {
              const existing = bodies.get(name.text)
              // The binder owns a destructured name through its BindingElement,
              // not through the enclosing VariableDeclaration.
              const declaration = name.parent
              if (existing) existing.declarations.push(declaration)
              else
                bodies.set(name.text, {
                  name,
                  declarations: [declaration],
                  function: false
                })
            })
          ts.forEachChild(item, bodyDeclarations)
        }
        bodyDeclarations(node.body)
        for (const [name, body] of bodies) {
          // Simple parameters and body vars/functions share a cell. Correct
          // function initialization even when the checker retains two symbols.
          if (!expressions && (!params.has(name) || !body.function)) {
            bodies.delete(name)
            continue
          }
          body.key = {
            declarations: [
              ...(!expressions && params.has(name)
                ? [params.get(name).parent]
                : []),
              ...body.declarations
            ],
            bodyEnvironment: node,
            initialFunction: body.initialFunction
          }
          if (expressions && params.has(name) && !body.function)
            initialTransfers.push([body.name, params.get(name)])
        }
        for (const [name, parameter] of params)
          parameterKeys.set(
            name,
            !expressions && bodies.has(name)
              ? bodies.get(name).key
              : {
                  declarations: [parameter.parent],
                  parameterEnvironment: node
                }
          )
        environments.push({ fn: node, params, parameterKeys, bodies })
      }
    }
    ts.forEachChild(node, collect)
  }
  collect(source)
  const cache = new WeakMap()
  const identity = (node) => {
    if (!node || !ts.isIdentifier(node)) return undefined
    if (cache.has(node)) return cache.get(node)
    const parent = node.parent
    // A member's spelling is not a lexical binding. The walker classifies
    // the complete access separately; asking for this token's symbol infers
    // receiver types and can recurse through installed implementation code.
    if (
      parent &&
      (((ts.isPropertyAccessExpression(parent) || ts.isMetaProperty(parent)) &&
        parent.name === node) ||
        (ts.isBindingElement(parent) && parent.propertyName === node))
    ) {
      cache.set(node, undefined)
      return undefined
    }
    let symbol
    if (
      parent &&
      ts.isShorthandPropertyAssignment(parent) &&
      parent.name === node
    )
      symbol = query('getShorthandAssignmentValueSymbol', node, () =>
        checker.getShorthandAssignmentValueSymbol(parent)
      )
    else if (
      parent &&
      ts.isExportSpecifier(parent) &&
      !parent.parent.parent.moduleSpecifier
    )
      symbol = query('getExportSpecifierLocalTargetSymbol', node, () =>
        checker.getExportSpecifierLocalTargetSymbol(parent)
      )
    else
      symbol = query('getSymbolAtLocation', node, () =>
        checker.getSymbolAtLocation(node)
      )
    if (symbol?.unavailable) {
      cache.set(node, symbol)
      return symbol
    }
    // Non-simple parameters execute in an environment outside the body. The
    // TypeScript binder may attach a reference here to a body declaration even
    // though JavaScript resolves the outer binding. Preserve parameter/closure
    // bindings, and look outward only when every runtime declaration is hidden
    // in this function's body.
    for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
      if (!ts.isParameter(ancestor) || !ts.isFunctionLike(ancestor.parent))
        continue
      const fn = ancestor.parent
      if (!fn.body) continue
      const declarations = (symbol?.declarations ?? []).filter(
        (declaration) =>
          !erased(declaration) &&
          !(ts.isFunctionDeclaration(declaration) && !declaration.body)
      )
      const insideBody = (declaration) => {
        for (let parent = declaration; parent; parent = parent.parent)
          if (parent === fn.body) return true
        return false
      }
      if (declarations.length && declarations.every(insideBody))
        symbol = query('resolveName', node, () =>
          checker.resolveName(node.text, fn.parent, ts.SymbolFlags.Value, false)
        )
      if (symbol?.unavailable) {
        cache.set(node, symbol)
        return symbol
      }
    }
    let environmentKey
    for (const { fn, params, parameterKeys, bodies } of environments) {
      const body = bodies.get(node.text),
        parameter = params.get(node.text)
      if (
        !body ||
        (!within(node, fn.body) && !fn.parameters.some((p) => within(node, p)))
      )
        continue
      const declarations = (symbol?.declarations ?? []).filter(
        (d) => !erased(d)
      )
      const belongs = (declaration) =>
        body.declarations.includes(declaration) ||
        (parameter && within(parameter, declaration) && within(declaration, fn))
      // Nested/block lexical declarations still shadow this environment.
      if (declarations.length && !declarations.every(belongs)) continue
      if (within(node, fn.body)) environmentKey = body.key
      else if (parameter) environmentKey = parameterKeys.get(node.text)
    }
    // Type-only declarations do not shadow the value namespace. The checker
    // resolves value uses separately; unbound globals keep their own identity.
    const declarations = symbol?.declarations ?? []
    const emitted = declarations.some(
      (declaration) =>
        !erased(declaration) &&
        !(ts.isFunctionDeclaration(declaration) && !declaration.body)
    )
    // CJS var redeclarations share Node's wrapper parameters. Block-scoped
    // bindings and function declarations still have their own identities.
    const wrapperVar =
      commonJs &&
      ['require', 'module', 'exports', '__filename', '__dirname'].includes(
        node.text
      ) &&
      declarations.length > 0 &&
      declarations.every((declaration) => {
        let variable = declaration
        while (
          ts.isBindingElement(variable) ||
          ts.isObjectBindingPattern(variable) ||
          ts.isArrayBindingPattern(variable)
        )
          variable = variable.parent
        if (
          !ts.isVariableDeclaration(variable) ||
          !ts.isVariableDeclarationList(variable.parent) ||
          variable.parent.flags & ts.NodeFlags.BlockScoped
        )
          return false
        for (
          let parent = variable.parent;
          parent && parent !== source;
          parent = parent.parent
        )
          if (
            ts.isFunctionLike(parent) ||
            ts.isModuleBlock(parent) ||
            ts.isClassStaticBlockDeclaration(parent)
          )
            return false
        return true
      })
    const key =
      environmentKey ?? (emitted && !wrapperVar ? symbol : global(node.text))
    cache.set(node, key)
    return key
  }
  // Declaration ownership and initializer writes differ for Annex-B simple
  // catch bindings. A var declaration remains function-owned, while its
  // initializer writes the nearest enclosing simple catch cell of that name.
  const writeIdentity = (name) => {
    if (!name || !ts.isIdentifier(name)) return identity(name)
    let declaration = name.parent
    while (declaration && !ts.isVariableDeclaration(declaration)) {
      if (
        !ts.isBindingElement(declaration) &&
        !ts.isObjectBindingPattern(declaration) &&
        !ts.isArrayBindingPattern(declaration)
      )
        return identity(name)
      declaration = declaration.parent
    }
    if (
      !declaration ||
      !ts.isVariableDeclarationList(declaration.parent) ||
      declaration.parent.flags & ts.NodeFlags.BlockScoped
    )
      return identity(name)
    for (
      let ancestor = declaration.parent;
      ancestor;
      ancestor = ancestor.parent
    ) {
      if (
        ts.isFunctionLike(ancestor) ||
        ts.isClassStaticBlockDeclaration(ancestor)
      )
        break
      if (
        ts.isCatchClause(ancestor) &&
        ancestor.variableDeclaration &&
        ts.isIdentifier(ancestor.variableDeclaration.name) &&
        ancestor.variableDeclaration.name.text === name.text
      )
        return identity(ancestor.variableDeclaration.name)
    }
    return identity(name)
  }
  const erased = (node) => {
    for (
      let parent = node;
      parent && parent !== source;
      parent = parent.parent
    ) {
      if (
        parent.isTypeOnly ||
        parent.importClause?.isTypeOnly ||
        ts.isTypeAliasDeclaration(parent) ||
        ts.isInterfaceDeclaration(parent) ||
        parent.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)
      )
        return true
      if (
        ts.isTypeNode(parent) &&
        !(
          ts.isExpressionWithTypeArguments(parent) &&
          parent.parent?.token === ts.SyntaxKind.ExtendsKeyword &&
          ts.isClassLike(parent.parent.parent)
        )
      )
        return true
    }
    return false
  }
  const isDeclarationName = (node) => {
    const parent = node.parent
    if (!parent) return false
    if (ts.isExportSpecifier(parent)) {
      if (parent.parent.parent.moduleSpecifier) return true
      return Boolean(parent.propertyName && parent.name === node)
    }
    if (ts.isNamespaceExport(parent)) return true
    if (ts.isBindingElement(parent) && parent.propertyName === node) return true
    if (
      ts.isImportSpecifier(parent) ||
      ts.isImportClause(parent) ||
      ts.isNamespaceImport(parent) ||
      ts.isImportEqualsDeclaration(parent)
    )
      return true
    if (parent.name !== node) return false
    return (
      ts.isVariableDeclaration(parent) ||
      ts.isParameter(parent) ||
      ts.isBindingElement(parent) ||
      ts.isFunctionDeclaration(parent) ||
      ts.isFunctionExpression(parent) ||
      ts.isClassLike(parent) ||
      ts.isModuleDeclaration(parent) ||
      ts.isTypeAliasDeclaration(parent) ||
      ts.isInterfaceDeclaration(parent) ||
      ts.isTypeParameterDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isGetAccessor(parent) ||
      ts.isSetAccessor(parent) ||
      ts.isEnumDeclaration(parent) ||
      ts.isEnumMember(parent)
    )
  }
  return {
    identity,
    writeIdentity,
    global,
    erased,
    isDeclarationName,
    initialTransfers
  }
}

// Assignment joins retain every possible acquired capability. Selections use
// original identifier nodes, so synthesized accesses keep lexical identity.
export function assignedValues(ts, pattern, expression, literal, visit) {
  if (!pattern || !expression) return
  if (ts.isIdentifier(pattern)) {
    visit(pattern, expression)
    return
  }
  if (
    ts.isParenthesizedExpression(pattern) ||
    ts.isAsExpression(pattern) ||
    ts.isSatisfiesExpression(pattern) ||
    ts.isTypeAssertionExpression(pattern) ||
    ts.isNonNullExpression(pattern)
  )
    return assignedValues(ts, pattern.expression, expression, literal, visit)
  if (
    ts.isBinaryExpression(pattern) &&
    pattern.operatorToken.kind === ts.SyntaxKind.EqualsToken
  ) {
    assignedValues(ts, pattern.left, expression, literal, visit)
    assignedValues(ts, pattern.left, pattern.right, literal, visit)
    return
  }
  if (
    ts.isObjectBindingPattern(pattern) ||
    ts.isObjectLiteralExpression(pattern)
  ) {
    const entries = ts.isObjectBindingPattern(pattern)
      ? pattern.elements
      : pattern.properties
    for (const item of entries) {
      let name, target, fallback
      if (ts.isBindingElement(item)) {
        name = item.propertyName ?? item.name
        target = item.name
        fallback = item.initializer
        if (item.dotDotDotToken) name = undefined
      } else if (ts.isPropertyAssignment(item)) {
        name = item.name
        target = item.initializer
      } else if (ts.isShorthandPropertyAssignment(item)) {
        name = item.name
        target = item.name
        fallback = item.objectAssignmentInitializer
      } else if (ts.isSpreadAssignment(item)) target = item.expression
      const key =
        name &&
        (ts.isIdentifier(name)
          ? name.text
          : literal(ts.isComputedPropertyName(name) ? name.expression : name))
      const selected = ts.factory.createElementAccessExpression(
        expression,
        key === undefined
          ? ts.factory.createIdentifier('__unknown_selection__')
          : ts.factory.createStringLiteral(key)
      )
      assignedValues(ts, target, selected, literal, visit)
      if (fallback) assignedValues(ts, target, fallback, literal, visit)
    }
  }
  if (
    ts.isArrayBindingPattern(pattern) ||
    ts.isArrayLiteralExpression(pattern)
  ) {
    for (const item of pattern.elements) {
      const target = ts.isBindingElement(item)
        ? item.name
        : ts.isSpreadElement(item)
          ? item.expression
          : item
      assignedValues(
        ts,
        target,
        ts.factory.createElementAccessExpression(
          expression,
          ts.factory.createIdentifier('__unknown_selection__')
        ),
        literal,
        visit
      )
      if (ts.isBindingElement(item) && item.initializer)
        assignedValues(ts, item.name, item.initializer, literal, visit)
    }
  }
}

export function valueBranches(ts, expression) {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  )
    return valueBranches(ts, expression.expression)
  if (ts.isConditionalExpression(expression))
    return [
      ...valueBranches(ts, expression.whenTrue),
      ...valueBranches(ts, expression.whenFalse)
    ]
  if (ts.isBinaryExpression(expression)) {
    if (expression.operatorToken.kind === ts.SyntaxKind.CommaToken)
      return valueBranches(ts, expression.right)
    if (
      [
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.QuestionQuestionToken
      ].includes(expression.operatorToken.kind)
    )
      return [
        ...valueBranches(ts, expression.left),
        ...valueBranches(ts, expression.right)
      ]
  }
  return [expression]
}
