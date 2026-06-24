#!/usr/bin/env node
// @ts-nocheck
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const apiRoot = path.join(appRoot, 'src', 'api');
const componentRoot = path.join(appRoot, 'src', 'components');
const errors = [];
const warnings = [];
const rel = (file) => path.relative(repoRoot, file).replaceAll(path.sep, '/');
const readText = (file) => fs.readFileSync(file, 'utf8');
const fail = (message) => errors.push(message);

function walk(dir, pred = () => true, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'build', 'dist', '.cache', '.tmp', '.strapi'].includes(entry.name)) continue;
      walk(full, pred, out);
    } else if (pred(full)) out.push(full);
  }
  return out;
}

function readSchema(file) {
  const text = readText(file);
  if (file.endsWith('.json')) return JSON.parse(text);
  const match = text.match(/export\s+default\s+([\s\S]*?)\s+as\s+const\s*;?\s*$/);
  if (!match) throw new Error('schema TS files must use `export default { ... } as const;`');
  return Function(`"use strict"; return (${match[1]});`)();
}

const schemaFiles = walk(apiRoot, (f) => /content-types[\/][^\/]+[\/]schema\.(json|ts|js)$/.test(f));
const schemas = new Map();
for (const file of schemaFiles) {
  let schema;
  try { schema = readSchema(file); } catch (e) { fail(`${rel(file)} invalid schema: ${e.message}`); continue; }
  const parts = rel(file).split('/');
  const apiName = parts[4];
  const typeName = parts[6];
  const uid = `api::${apiName}.${typeName}`;
  schemas.set(uid, { file, schema });
  if (!['collectionType', 'singleType'].includes(schema.kind)) fail(`${rel(file)} has invalid or missing kind`);
  for (const key of ['collectionName', 'options', 'attributes']) if (!schema[key]) fail(`${rel(file)} is missing ${key}`);
  for (const key of ['singularName', 'pluralName', 'displayName']) if (!schema.info?.[key]) fail(`${rel(file)} is missing info.${key}`);
  if (schema.info?.singularName !== typeName) fail(`${rel(file)} singularName (${schema.info?.singularName}) must match folder ${typeName}`);
}

const factoryPattern = /factories\.createCore(?:Router|Controller|Service)\(['"]([^'"]+)['"]\)/g;
const uidPattern = /api::[a-z0-9-]+\.[a-z0-9-]+/g;
for (const file of walk(appRoot, (f) => /\.(ts|js|json|d\.ts)$/.test(f))) {
  const relative = rel(file);
  if (relative.includes('/node_modules/') || relative.includes('/.strapi/') || relative.includes('/dist/')) continue;
  const text = readText(file);
  for (const uid of text.match(uidPattern) || []) if (!schemas.has(uid)) fail(`${relative} references ${uid}, but no matching content-type schema exists`);
  for (const match of text.matchAll(factoryPattern)) if (!schemas.has(match[1])) fail(`${relative} has factory call with missing schema UID ${match[1]}`);
}

for (const apiDir of fs.existsSync(apiRoot) ? fs.readdirSync(apiRoot, { withFileTypes: true }).filter((d) => d.isDirectory()) : []) {
  const apiName = apiDir.name;
  const dir = path.join(apiRoot, apiName);
  const routeFiles = walk(path.join(dir, 'routes'), (f) => /\.(ts|js)$/.test(f));
  const typeDirs = fs.existsSync(path.join(dir, 'content-types'))
    ? fs.readdirSync(path.join(dir, 'content-types'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];
  if (routeFiles.length && typeDirs.length === 0) fail(`${rel(dir)} has routes but no content-types schema; Strapi core route creation will receive undefined and fail reading kind`);
  for (const typeName of typeDirs) {
    const uid = `api::${apiName}.${typeName}`;
    if (!schemas.has(uid)) fail(`${rel(path.join(dir, 'content-types', typeName))} is missing schema.ts or schema.json for ${uid}`);
  }
}

const components = new Set();
for (const file of walk(componentRoot, (f) => /\.(json|ts|js)$/.test(f))) {
  const parts = rel(file).split('/');
  const category = parts[4];
  const name = path.basename(file).replace(/\.(json|ts|js)$/, '');
  components.add(`${category}.${name}`);
}
for (const { file, schema } of schemas.values()) {
  for (const [attrName, attr] of Object.entries(schema.attributes || {})) {
    if (attr?.type === 'component' && !components.has(attr.component)) fail(`${rel(file)} attribute ${attrName} references missing component ${attr.component}`);
  }
}
for (const file of walk(componentRoot, (f) => /\.(json|ts|js)$/.test(f))) {
  let schema;
  try { schema = readSchema(file); } catch (e) { fail(`${rel(file)} invalid component schema: ${e.message}`); continue; }
  for (const [attrName, attr] of Object.entries(schema.attributes || {})) {
    if (attr?.type === 'component' && !components.has(attr.component)) fail(`${rel(file)} attribute ${attrName} references missing component ${attr.component}`);
  }
}

const disabledInSrc = path.join(appRoot, 'src', 'api-disabled');
if (fs.existsSync(disabledInSrc)) fail(`${rel(disabledInSrc)} must not exist under src`);

const uploads = path.join(appRoot, 'public', 'uploads');
const uploadsGitkeep = path.join(uploads, '.gitkeep');
if (!fs.existsSync(uploads) || !fs.statSync(uploads).isDirectory()) fail(`${rel(uploads)} directory is missing`);
if (!fs.existsSync(uploadsGitkeep)) fail(`${rel(uploadsGitkeep)} is missing`);

const middlewareFile = path.join(appRoot, 'config', 'middlewares.ts');
if (!fs.existsSync(middlewareFile)) fail(`${rel(middlewareFile)} is missing`);
else if (!readText(middlewareFile).includes('strapi::favicon')) fail(`${rel(middlewareFile)} must include required Strapi middleware strapi::favicon`);

if (warnings.length) for (const warning of warnings) console.warn(`WARN ${warning}`);
if (errors.length) {
  console.error('Strapi validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Strapi validation passed (${schemas.size} schemas checked).`);
