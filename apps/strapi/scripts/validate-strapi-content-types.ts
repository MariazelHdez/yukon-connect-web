#!/usr/bin/env node
// @ts-nocheck
/*
 * Safe Strapi CMS validator for Yukon Connect.
 * This script only reads files and checks Strapi app structure; it never connects
 * to PostgreSQL and never modifies data.
 */
const fs = require('node:fs');
const path = require('node:path');

const appRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(appRoot, '..', '..');
const apiRoot = path.join(appRoot, 'src', 'api');
const allowedUids = new Set([
  'api::page.page',
  'api::feedback.feedback',
  'api::search-tag.search-tag',
  'api::search-synonym.search-synonym',
]);
const errors = [];
const warnings = [];

function rel(file) {
  return path.relative(repoRoot, file).replaceAll(path.sep, '/');
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function walk(dir, predicate = () => true, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['node_modules', 'build', 'dist', '.cache', '.tmp', '.strapi'].includes(entry.name)) continue;
      walk(full, predicate, out);
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

const schemas = new Map();
for (const schemaFile of walk(apiRoot, (file) => file.endsWith('schema.json'))) {
  let schema;
  try {
    schema = JSON.parse(readText(schemaFile));
  } catch (error) {
    fail(`${rel(schemaFile)} is not valid JSON: ${error.message}`);
    continue;
  }

  const parts = rel(schemaFile).split('/');
  const apiName = parts[4];
  const contentTypeName = parts[6];
  const uid = `api::${apiName}.${contentTypeName}`;
  schemas.set(uid, { file: schemaFile, schema });

  if (!allowedUids.has(uid)) fail(`${rel(schemaFile)} defines unexpected UID ${uid}`);
  if (!schema.kind) fail(`${rel(schemaFile)} is missing kind`);
  if (!schema.collectionName) fail(`${rel(schemaFile)} is missing collectionName`);
  if (!schema.info || typeof schema.info !== 'object') fail(`${rel(schemaFile)} is missing info`);
  if (!schema.info?.singularName) fail(`${rel(schemaFile)} is missing info.singularName`);
  if (!schema.info?.pluralName) fail(`${rel(schemaFile)} is missing info.pluralName`);
  if (!schema.info?.displayName) fail(`${rel(schemaFile)} is missing info.displayName`);
  if (!schema.options || typeof schema.options !== 'object') fail(`${rel(schemaFile)} is missing options`);
  if (!schema.attributes || typeof schema.attributes !== 'object') fail(`${rel(schemaFile)} is missing attributes`);
  if (schema.info?.singularName !== contentTypeName) {
    fail(`${rel(schemaFile)} singularName (${schema.info?.singularName}) must match folder ${contentTypeName}`);
  }
}

for (const uid of allowedUids) {
  if (!schemas.has(uid)) fail(`Missing schema for ${uid}`);
}

const uidPattern = /api::[a-z0-9-]+\.[a-z0-9-]+/g;
for (const file of walk(appRoot, (name) => /\.(ts|js|json|d\.ts)$/.test(name))) {
  const relative = rel(file);
  if (relative.startsWith('apps/strapi/node_modules/')) continue;
  const text = readText(file);
  const refs = text.match(uidPattern) || [];
  for (const uid of refs) {
    if (!allowedUids.has(uid)) fail(`${relative} references non-existing or disallowed UID ${uid}`);
    if (!schemas.has(uid)) fail(`${relative} references ${uid}, but no matching schema exists`);
  }

  const factoryMatch = text.match(/factories\.createCore(?:Router|Controller|Service)\(['"]([^'"]+)['"]\)/g) || [];
  for (const call of factoryMatch) {
    const uid = call.match(/['"]([^'"]+)['"]/)?.[1];
    if (!uid || !schemas.has(uid)) fail(`${relative} has factory call with missing schema UID ${uid || '(unknown)'}`);
  }
}

const disabledApiPath = path.join(appRoot, 'src', 'api-disabled');
if (fs.existsSync(disabledApiPath)) fail(`${rel(disabledApiPath)} must not exist under src; move disabled APIs outside apps/strapi/src`);

const uploads = path.join(appRoot, 'public', 'uploads');
const uploadsGitkeep = path.join(uploads, '.gitkeep');
if (!fs.existsSync(uploads) || !fs.statSync(uploads).isDirectory()) fail(`${rel(uploads)} directory is missing`);
if (!fs.existsSync(uploadsGitkeep)) fail(`${rel(uploadsGitkeep)} is missing`);

const middlewareFile = path.join(appRoot, 'config', 'middlewares.ts');
if (!fs.existsSync(middlewareFile)) {
  fail(`${rel(middlewareFile)} is missing`);
} else {
  const middlewareText = readText(middlewareFile);
  if (!middlewareText.includes('strapi::favicon')) {
    fail(`${rel(middlewareFile)} must include required Strapi middleware strapi::favicon`);
  } else {
    const customPath = middlewareText.match(/path\s*:\s*['"]([^'"]+)['"]/);
    const faviconCandidates = customPath
      ? [path.join(appRoot, customPath[1])]
      : [path.join(appRoot, 'favicon.png'), path.join(appRoot, 'favicon.ico')];
    if (!faviconCandidates.some((candidate) => fs.existsSync(candidate))) {
      fail(
        customPath
          ? `${rel(middlewareFile)} configures strapi::favicon path ${customPath[1]}, but that file does not exist`
          : `${rel(middlewareFile)} enables strapi::favicon, but neither apps/strapi/favicon.png nor apps/strapi/favicon.ico exists`,
      );
    }
  }
}

const generatedFiles = [
  path.join(appRoot, 'types', 'generated', 'components.d.ts'),
  path.join(appRoot, 'types', 'generated', 'contentTypes.d.ts'),
];
for (const file of generatedFiles) {
  if (!fs.existsSync(file)) continue;
  const refs = readText(file).match(uidPattern) || [];
  for (const uid of refs) {
    if (!allowedUids.has(uid)) fail(`${rel(file)} contains stale or invalid UID ${uid}; regenerate or remove generated types`);
  }
}

for (const warning of warnings) console.warn(`WARN ${warning}`);
if (errors.length) {
  console.error('Strapi validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Strapi validation passed (${schemas.size} schemas checked).`);
