#!/usr/bin/env node
// @ts-nocheck
const fs = require('node:fs');
const path = require('node:path');
const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const apiRoot = path.join(appRoot, 'src', 'api');
const errors = [];
const rel = (file) => path.relative(repoRoot, file).replaceAll(path.sep, '/');
const read = (file) => fs.readFileSync(file, 'utf8');
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
const schemas = new Map();
for (const file of walk(apiRoot, (f) => f.endsWith('schema.json'))) {
  let schema;
  try { schema = JSON.parse(read(file)); } catch (e) { errors.push(`${rel(file)} invalid JSON: ${e.message}`); continue; }
  const parts = rel(file).split('/');
  const apiName = parts[4];
  const typeName = parts[6];
  const uid = `api::${apiName}.${typeName}`;
  schemas.set(uid, { file, schema });
  for (const key of ['kind', 'collectionName', 'options', 'attributes']) if (!schema[key]) errors.push(`${rel(file)} is missing ${key}`);
  for (const key of ['singularName', 'pluralName', 'displayName']) if (!schema.info?.[key]) errors.push(`${rel(file)} is missing info.${key}`);
  if (schema.info?.singularName !== typeName) errors.push(`${rel(file)} singularName (${schema.info?.singularName}) must match folder ${typeName}`);
}
const required = ['api::homepage.homepage','api::page.page','api::feedback.feedback','api::search-tag.search-tag','api::search-synonym.search-synonym'];
for (const uid of required) if (!schemas.has(uid)) errors.push(`Missing schema for ${uid}`);
const uidPattern = /api::[a-z0-9-]+\.[a-z0-9-]+/g;
for (const file of walk(appRoot, (f) => /\.(ts|js|json|d\.ts)$/.test(f))) {
  const relative = rel(file);
  if (relative.includes('/node_modules/') || relative.includes('/.strapi/')) continue;
  for (const uid of read(file).match(uidPattern) || []) if (!schemas.has(uid)) errors.push(`${relative} references ${uid}, but no matching schema exists`);
  for (const call of read(file).match(/factories\.createCore(?:Router|Controller|Service)\(['"][^'"]+['"]\)/g) || []) {
    const uid = call.match(/['"]([^'"]+)['"]/)?.[1];
    if (!schemas.has(uid)) errors.push(`${relative} has factory call with missing schema UID ${uid}`);
  }
}
const disabled = path.join(appRoot, 'src', 'api-disabled');
if (fs.existsSync(disabled)) errors.push(`${rel(disabled)} must not exist under src`);
const uploads = path.join(appRoot, 'public', 'uploads');
if (!fs.existsSync(uploads) || !fs.statSync(uploads).isDirectory()) errors.push(`${rel(uploads)} directory is missing`);
if (!fs.existsSync(path.join(uploads, '.gitkeep'))) errors.push(`${rel(path.join(uploads, '.gitkeep'))} is missing`);
const middlewares = path.join(appRoot, 'config', 'middlewares.ts');
if (fs.existsSync(middlewares) && read(middlewares).includes('strapi::favicon') && !fs.existsSync(path.join(appRoot, 'favicon.png'))) errors.push(`${rel(middlewares)} enables strapi::favicon, but favicon.png does not exist`);
if (errors.length) { console.error('Strapi validation failed:'); errors.forEach((e) => console.error(`- ${e}`)); process.exit(1); }
console.log(`Strapi validation passed (${schemas.size} schemas checked).`);
