import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire,registerHooks} from 'node:module';
import {pathToFileURL,fileURLToPath} from 'node:url';
import zlib from 'node:zlib';
const ev=path.dirname(fileURLToPath(import.meta.url));
const root='/mnt/ia/cvg-hiso005-build0237-20261018';
const prior=path.resolve(ev,'../HISO005-P2-BUILD-0237-20261018');
const hash=v=>createHash('sha256').update(v).digest('hex');
const fileHash=p=>hash(fs.readFileSync(p));
if(process.versions.node!=='22.23.2')throw Error('PINNED_NODE_REQUIRED');
const loaderEvents=[];let blockedTargetLoads=0;
const helper=path.join(root,'scripts/boundary-semantic-resolution.mjs');
registerHooks({load(url,context,next){if(url.startsWith('file:')){const p=fileURLToPath(url);if(p!==helper&&!p.startsWith(path.join(root,'node_modules/typescript/lib')+path.sep)){blockedTargetLoads++;throw Error('TARGET_MODULE_LOAD_FORBIDDEN:'+url)}loaderEvents.push(url)}return next(url,context)}});
if(fileHash(path.join(root,'node_modules/typescript/lib/typescript.js'))!=='569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39')throw Error('PARSER_PIN');
const ts=createRequire(import.meta.url)(path.join(root,'node_modules/typescript/lib/typescript.js'));
const {createResolutionSession}=await import(pathToFileURL(helper).href);
if(ts.version!=='6.0.3')throw Error('PARSER_VERSION');
const raw=fs.readFileSync(path.join(prior,'real-postcert-normal-report.json.gz'));
const report=JSON.parse(zlib.gunzipSync(raw));
const origins=report.semanticBoundary.frontierOrigins.filter(x=>x.semanticPointer.reason==='UNKNOWN_AMBIGUOUS_RESOLUTION');
if(origins.length!==359)throw Error('SELECTED_DENOMINATOR_DRIFT');
const uniqueFiles=[...new Set(origins.filter(x=>x.file!==null).map(x=>x.file))].sort();
const edges=[],files=[],manifests=new Map();const startedAt=new Date().toISOString();
  function lexical(node, name) {
    for (let scope = node.parent; scope; scope = scope.parent) {
      const candidates = []
      if (ts.isSourceFile(scope) || ts.isBlock(scope))
        candidates.push(...scope.statements)
      if (ts.isFunctionLike(scope)) {
        for (const p of scope.parameters || [])
          if (p.name.getText() === name) return { kind: 'unknown' }
        if (scope.name?.text === name) return { kind: 'unknown' }
      }
      for (const s of candidates) {
        if (ts.isVariableStatement(s))
          for (const d of s.declarationList.declarations) {
            if (ts.isIdentifier(d.name) && d.name.text === name)
              return s.declarationList.flags & ts.NodeFlags.Const
                ? { kind: 'const', node: d.initializer }
                : { kind: 'unknown' }
            if (!ts.isIdentifier(d.name) && d.name.getText().includes(name))
              return { kind: 'unknown' }
          }
        if (
          (ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) &&
          s.name?.text === name
        )
          return { kind: 'unknown' }
        if (ts.isImportDeclaration(s) && s.importClause) {
          if (
            s.importClause.name?.text === name ||
            s.importClause.namedBindings?.name?.text === name ||
            s.importClause.namedBindings?.elements?.some(
              (e) => e.name.text === name
            )
          )
            return { kind: 'unknown' }
        }
      }
    }
    return null
  }
  function finite(node, seen = new Set()) {
    if (!node || seen.has(node)) return null
    seen = new Set([...seen, node])
    if (ts.isStringLiteralLike(node)) return [node.text]
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node)
    )
      return finite(node.expression, seen)
    if (ts.isIdentifier(node)) {
      const binding = lexical(node, node.text)
      return binding?.kind === 'const' ? finite(binding.node, seen) : null
    }
    if (ts.isConditionalExpression(node)) {
      const a = finite(node.whenTrue, seen),
        b = finite(node.whenFalse, seen)
      return a && b ? [...new Set([...a, ...b])].slice(0, 129) : null
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const a = finite(node.left, seen),
        b = finite(node.right, seen)
      if (!a || !b || a.length * b.length > 128) return null
      return [...new Set(a.flatMap((x) => b.map((y) => x + y)))]
    }
    if (ts.isTemplateExpression(node)) {
      let values = [node.head.text]
      for (const span of node.templateSpans) {
        const part = finite(span.expression, seen)
        if (!part || values.length * part.length > 128) return null
        values = values.flatMap((x) =>
          part.map((y) => x + y + span.literal.text)
        )
      }
      return values
    }
    return null
  }

const trackedFDs=new Set(),trackedDirs=new Set();
const fsOriginal={openSync:fs.openSync,closeSync:fs.closeSync,opendirSync:fs.opendirSync};
fs.openSync=(...args)=>{const fd=fsOriginal.openSync(...args);trackedFDs.add(fd);return fd};
fs.closeSync=(fd)=>{const result=fsOriginal.closeSync(fd);trackedFDs.delete(fd);return result};
fs.opendirSync=(...args)=>{const dir=fsOriginal.opendirSync(...args);trackedDirs.add(dir);const close=dir.closeSync.bind(dir);dir.closeSync=()=>{const result=close();trackedDirs.delete(dir);return result};return dir};
for(const file of uniqueFiles){
 const productEvents=[];const session=createResolutionSession({root,onProduct:(target,from)=>productEvents.push({target,from})});
 let row={file,sourceSha256:null,scope:null,parseDiagnostics:[],candidateEdgeIds:[],usage:null,revalidation:null,closedOwnDescriptors:null};
 try{
  const acquired=session.read(file);row.sourceSha256=acquired.sha256;
  for(const origin of origins.filter(x=>x.file===file))if(origin.fileSha256!==acquired.sha256)throw Error('SOURCE_HASH_DRIFT:'+file);
  let dir=path.posix.dirname(file),scope=null;
  while(true){const m=(dir==='.'?'':dir+'/')+'package.json';if(session.probe(m)){scope={file:m,body:JSON.parse(session.read(m).text)};break}if(dir==='.')break;dir=path.posix.dirname(dir)}
  row.scope=scope?{file:scope.file,name:scope.body.name??null,type:scope.body.type??null,hasImports:Object.hasOwn(scope.body,'imports'),hasBrowser:Object.hasOwn(scope.body,'browser'),engineLoadGuardTruthy:!!(scope.body.imports||scope.body.browser)}:null;
  const cjs=/\.c(?:js|ts)$/.test(file)||(!/\.m(?:js|ts)$/.test(file)&&scope?.body.type!=='module');
  const sf=ts.createSourceFile(file,acquired.text,ts.ScriptTarget.Latest,true,/\.[cm]?tsx?$/.test(file)?ts.ScriptKind.TS:ts.ScriptKind.JS);
  row.parseDiagnostics=sf.parseDiagnostics.map(d=>({code:d.code,start:d.start??null,length:d.length??null}));let visited=0;
  const visit=n=>{if(++visited>2000000)throw Error('OPERATOR_AST_LIMIT');let specs=null,mode='import',kind=null;
   if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&!(n.importClause?.isTypeOnly||n.isTypeOnly)){specs=[n.moduleSpecifier.text];kind=ts.SyntaxKind[n.kind]}
   if(ts.isCallExpression(n)){
    if(n.expression.kind===ts.SyntaxKind.ImportKeyword){specs=finite(n.arguments[0]);kind='FiniteDynamicImport'}
    if(cjs&&ts.isIdentifier(n.expression)&&n.expression.text==='require'&&!lexical(n.expression,'require')){mode='require';specs=finite(n.arguments[0]);kind='FiniteUnshadowedRequire'}
    if(cjs&&ts.isPropertyAccessExpression(n.expression)&&ts.isIdentifier(n.expression.expression)&&n.expression.expression.text==='require'&&n.expression.name.text==='resolve'&&!lexical(n.expression,'require')){mode='require';specs=finite(n.arguments[0]);kind='FiniteUnshadowedRequireResolve'}
   }
   for(const specifier of specs||[]){
    const id=hash(JSON.stringify({file,start:n.getStart(sf),end:n.end,mode,specifier,kind}));const edge={id,file,start:n.getStart(sf),end:n.end,kind,mode,specifier,status:null,reason:null,detail:null,stack:null,selected:null,guardClass:null,ownerManifestCandidates:[]};
    try{const x=session.resolve({from:file,specifier,mode});edge.status='RESOLVED_BY_APPROVED_HELPER';edge.selected={file:x.file,logicalURL:x.logicalURL,owner:x.owner??null}}
    catch(error){edge.status='REFUSED_BY_APPROVED_HELPER';edge.reason=String(error.message).split(':')[0];edge.detail=String(error.message);edge.stack=String(error.stack);if(edge.reason==='UNKNOWN_AMBIGUOUS_RESOLUTION'){edge.guardClass=edge.stack.includes('boundary-semantic-resolution.mjs:949:')?'OWNER_BROWSER_OR_IMPORTS_PRESENCE':edge.stack.includes('boundary-semantic-resolution.mjs:846:')?'CJS_LEGACY_CANDIDATE_COUNT':'UNATTRIBUTED_HELPER_GUARD';
      const name=specifier.startsWith('@')?specifier.split('/').slice(0,2).join('/'):specifier.split('/')[0];
      for(const input of session.snapshot().inputs.filter(x=>x.kind==='file'&&x.file.endsWith('package.json'))){const body=JSON.parse(session.read(input.file).text);if(body.name===name){const key=input.file+':'+input.sha256;manifests.set(key,{file:input.file,sha256:input.sha256,name:body.name,type:body.type??null,hasImports:Object.hasOwn(body,'imports'),hasBrowser:Object.hasOwn(body,'browser'),imports:body.imports??null,browser:body.browser??null,exports:body.exports??null,main:body.main??null});edge.ownerManifestCandidates.push(key)}}
    }}
    row.candidateEdgeIds.push(id);edges.push(edge);
   }ts.forEachChild(n,visit)
  };visit(sf);row.visitedNodes=visited;row.revalidation=session.revalidate();row.usage={...session.usage};row.productEvents=productEvents;
 }catch(error){row.operatorError={message:String(error.message),stack:String(error.stack)}}finally{session.close();row.descriptorHighWater=session.usage.openDescriptors;row.closedOwnDescriptors=trackedFDs.size+trackedDirs.size}
 files.push(row);fs.writeFileSync(path.join(ev,'census-progress.json'),JSON.stringify({status:'RUNNING',completedFiles:files.length,totalFiles:uniqueFiles.length,edges:edges.length,lastFile:file},null,2)+'\n');
}
const trackedResidualAtEnd=trackedFDs.size+trackedDirs.size;fs.openSync=fsOriginal.openSync;fs.closeSync=fsOriginal.closeSync;fs.opendirSync=fsOriginal.opendirSync;
const byFile=new Map(files.map(x=>[x.file,x]));
const records=origins.map(origin=>{const f=origin.file===null?null:byFile.get(origin.file);const matches=edges.filter(x=>x.file===origin.file&&x.reason==='UNKNOWN_AMBIGUOUS_RESOLUTION');return {origin,candidateGuardEdgeIds:matches.map(x=>x.id),ownScopeGuardPossible:f?.scope?.engineLoadGuardTruthy??false,attribution:origin.file===null?'UNAVAILABLE_GLOBAL_ORIGIN_NOT_ATTRIBUTED':f?.operatorError?'OPERATOR_INCOMPLETE':matches.length?'FROZEN_HELPER_GUARD_REPRODUCED_FOR_SOURCE_CANDIDATES':'NO_MATCHING_LITERAL_CANDIDATE',edgeToOriginalOccurrenceIdentity:'Candidate correspondence only; source envelope has no AST edge id. No bijection assumed.'}});
const counts=items=>Object.fromEntries([...items.reduce((a,x)=>a.set(x,(a.get(x)||0)+1),new Map())].sort((a,b)=>a[0].localeCompare(b[0])));
const result={status:'READONLY_CENSUS_EXECUTED',startedAt,finishedAt:new Date().toISOString(),sourceCommit:'84d8d4b4ed053493533d7e9ad55e574a9e6f9047',sourceReportCompressedSha256:hash(raw),operatorSha256:fileHash(fileURLToPath(import.meta.url)),helperSha256:fileHash(helper),engineSha256:fileHash(path.join(root,'scripts/boundary-semantic-engine.mjs')),node:process.versions.node,parser:ts.version,mode:'Observation only; no semantic model rule changed or new proof accepted.',loaderEvents,blockedTargetLoads,targetModuleEvaluations:0,trackedResidualAtEnd,originCount:origins.length,physicalFiles:uniqueFiles.length,files,edges,ownerManifests:[...manifests.values()],records,summary:{attribution:counts(records.map(x=>x.attribution)),guardEdges:counts(edges.filter(x=>x.reason==='UNKNOWN_AMBIGUOUS_RESOLUTION').map(x=>x.guardClass)),ownerNames:counts(edges.filter(x=>x.reason==='UNKNOWN_AMBIGUOUS_RESOLUTION').flatMap(x=>x.ownerManifestCandidates.map(k=>manifests.get(k).name))),operatorFileErrors:files.filter(x=>x.operatorError).length,allOwnFDsClosed:files.every(x=>x.closedOwnDescriptors===0)&&trackedResidualAtEnd===0,maximumDescriptorHighWater:Math.max(...files.map(x=>x.descriptorHighWater??0))},b6Accepted:false,newProofsAccepted:0};
fs.writeFileSync(path.join(ev,'census.json'),JSON.stringify(result,null,2)+'\n');fs.writeFileSync(path.join(ev,'census-progress.json'),JSON.stringify({status:'FINISHED',completedFiles:files.length,totalFiles:uniqueFiles.length},null,2)+'\n');console.log(JSON.stringify({status:result.status,origins:result.originCount,files:result.physicalFiles,edges:edges.length,summary:result.summary,targetModuleEvaluations:0}));
if(result.summary.operatorFileErrors||!result.summary.allOwnFDsClosed||blockedTargetLoads)process.exitCode=1;
