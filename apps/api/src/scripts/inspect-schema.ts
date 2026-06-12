import { writeFile } from 'node:fs/promises';
import { PostgresDatabaseClient } from '../db/postgres.ts';

const outputPath = process.argv[2] ?? 'docs/schema-inspection.json';
const db = await PostgresDatabaseClient.fromEnvironment();

if (!db) {
  console.log('DATABASE_URL is not configured. No database connection was attempted.');
  console.log('To inspect your local PostgreSQL schema, run:');
  console.log('  DATABASE_URL="postgresql://user:password@localhost:5432/yukon_connect" pnpm --filter @yukon-connect/api inspect:schema');
  process.exit(0);
}

try {
  const tables = await db.query(
    `
      select table_schema, table_name, table_type
      from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
      order by table_type, table_name
    `,
    [
      'contract_records',
      'contract_amounts',
      'contract_details_versioned',
      'vendors',
      'departments',
      'communities',
      'contract_types',
      'tender_classes',
      'fiscal_year',
      'types',
      'project_managers',
      'import_batches',
      'staging_contracts',
      'tmp_contract_details',
      'vw_contracts',
      'vw_contracts_full',
    ],
  );

  const columns = await db.query(
    `
      select table_schema, table_name, column_name, data_type, is_nullable
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, ordinal_position
    `,
  );

  const foreignKeys = await db.query(
    `
      select
        tc.table_name,
        kcu.column_name,
        ccu.table_name as foreign_table_name,
        ccu.column_name as foreign_column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
        and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name
        and ccu.table_schema = tc.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = 'public'
      order by tc.table_name, kcu.column_name
    `,
  );

  await writeFile(
    outputPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        tables: tables.rows,
        columns: columns.rows,
        foreignKeys: foreignKeys.rows,
      },
      null,
      2,
    ),
  );

  console.log(`Schema inspection written to ${outputPath}`);
} finally {
  await db.close();
}
