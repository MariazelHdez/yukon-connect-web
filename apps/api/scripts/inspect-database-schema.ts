import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
type SchemaRow = {
  schema_name: string;
  schema_owner: string;
};

type RelationRow = {
  table_schema: string;
  table_name: string;
  table_type: string;
};

type ColumnRow = {
  table_schema: string;
  table_name: string;
  column_name: string;
  ordinal_position: number;
  data_type: string;
  udt_name: string;
  formatted_type: string;
  is_nullable: "YES" | "NO";
  column_default: string | null;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
};

type PrimaryKeyRow = {
  table_schema: string;
  table_name: string;
  constraint_name: string;
  columns: string[];
};

type ForeignKeyRow = {
  constraint_schema: string;
  constraint_name: string;
  table_schema: string;
  table_name: string;
  columns: string[];
  foreign_table_schema: string;
  foreign_table_name: string;
  foreign_columns: string[];
  update_rule: string;
  delete_rule: string;
};

type IndexRow = {
  table_schema: string;
  table_name: string;
  index_schema: string;
  index_name: string;
  is_unique: boolean;
  is_primary: boolean;
  index_definition: string;
};

type ViewRow = {
  table_schema: string;
  table_name: string;
  view_definition: string | null;
};

const expectedTables = [
  "contract_records",
  "contract_amounts",
  "contract_details_versioned",
  "vendors",
  "departments",
  "communities",
  "contract_types",
  "tender_classes",
  "fiscal_year",
  "types",
  "project_managers",
  "import_batches",
  "staging_contracts",
  "tmp_contract_details",
];

const expectedViews = ["vw_contracts", "vw_contracts_full"];
const outputPath = path.resolve(process.cwd(), "docs/database-current.md");

function getDatabaseUrl(): string | undefined {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error(
      [
        "DATABASE_URL is not set; database schema inspection was not run.",
        "Set DATABASE_URL to a PostgreSQL connection string and try again, for example:",
        '  DATABASE_URL="postgresql://user:password@host:5432/database" pnpm db:inspect',
        "No files were generated or modified.",
      ].join("\n"),
    );
    return undefined;
  }

  return databaseUrl;
}

function sslConfig() {
  const sslMode = process.env.PGSSLMODE?.toLowerCase();
  const databaseSsl = process.env.DATABASE_SSL?.toLowerCase();

  if (sslMode === "require" || databaseSsl === "true") {
    return { rejectUnauthorized: false };
  }

  return undefined;
}

function relationKey(schema: string, name: string): string {
  return `${schema}.${name}`;
}

function groupByRelation<T extends { table_schema: string; table_name: string }>(rows: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const key = relationKey(row.table_schema, row.table_name);
    const existing = grouped.get(key) ?? [];
    existing.push(row);
    grouped.set(key, existing);
  }

  return grouped;
}

function formatColumnType(column: ColumnRow): string {
  if (column.formatted_type) {
    return column.formatted_type;
  }

  if (column.character_maximum_length) {
    return `${column.data_type}(${column.character_maximum_length})`;
  }

  if (column.numeric_precision && column.numeric_scale !== null) {
    return `${column.data_type}(${column.numeric_precision},${column.numeric_scale})`;
  }

  return column.data_type || column.udt_name;
}

function escapePipe(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  return String(value).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function markdownTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return "_None detected._\n";
  }

  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapePipe).join(" | ")} |`),
  ].join("\n");
}

function fencedSql(sql: string | null): string {
  if (!sql) {
    return "_Definition unavailable to the current database role._";
  }

  return `\`\`\`sql\n${sql.trim()}\n\`\`\``;
}

function buildMarkdown(data: {
  generatedAt: Date;
  schemas: SchemaRow[];
  tables: RelationRow[];
  columns: ColumnRow[];
  primaryKeys: PrimaryKeyRow[];
  foreignKeys: ForeignKeyRow[];
  indexes: IndexRow[];
  views: ViewRow[];
}): string {
  const columnsByRelation = groupByRelation(data.columns);
  const primaryKeysByRelation = groupByRelation(data.primaryKeys);
  const foreignKeysByRelation = groupByRelation(data.foreignKeys);
  const indexesByRelation = groupByRelation(data.indexes);
  const detectedTableNames = new Set(data.tables.map((table) => table.table_name));
  const detectedViewNames = new Set(data.views.map((view) => view.table_name));
  const missingTables = expectedTables.filter((table) => !detectedTableNames.has(table));
  const missingViews = expectedViews.filter((view) => !detectedViewNames.has(view));

  const sections: string[] = [
    "# Current Database Schema",
    "",
    `Generated at: ${data.generatedAt.toISOString()}`,
    "",
    "> This document is generated by `pnpm db:inspect` using read-only PostgreSQL metadata queries against `information_schema` and `pg_catalog`. It should describe the database that `DATABASE_URL` points to at generation time.",
    "",
    "## Summary",
    "",
    markdownTable(
      ["Item", "Count"],
      [
        ["Schemas", String(data.schemas.length)],
        ["Tables", String(data.tables.length)],
        ["Columns", String(data.columns.length)],
        ["Primary key constraints", String(data.primaryKeys.length)],
        ["Foreign key constraints", String(data.foreignKeys.length)],
        ["Indexes", String(data.indexes.length)],
        ["Views", String(data.views.length)],
      ],
    ),
    "",
    "## Schemas",
    "",
    markdownTable(
      ["Schema", "Owner"],
      data.schemas.map((schema) => [schema.schema_name, schema.schema_owner]),
    ),
    "",
    "## Tables Found",
    "",
    markdownTable(
      ["Schema", "Table", "Type"],
      data.tables.map((table) => [table.table_schema, table.table_name, table.table_type]),
    ),
  ];

  for (const table of data.tables) {
    const key = relationKey(table.table_schema, table.table_name);
    const columns = columnsByRelation.get(key) ?? [];
    const primaryKeys = primaryKeysByRelation.get(key) ?? [];
    const foreignKeys = foreignKeysByRelation.get(key) ?? [];
    const indexes = indexesByRelation.get(key) ?? [];

    sections.push(
      "",
      `### ${key}`,
      "",
      "#### Columns",
      "",
      markdownTable(
        ["#", "Column", "Type", "Nullable", "Default"],
        columns.map((column) => [
          String(column.ordinal_position),
          column.column_name,
          formatColumnType(column),
          column.is_nullable === "YES" ? "YES" : "NO",
          column.column_default,
        ]),
      ),
      "",
      "#### Primary Keys",
      "",
      markdownTable(
        ["Constraint", "Columns"],
        primaryKeys.map((primaryKey) => [primaryKey.constraint_name, primaryKey.columns.join(", ")]),
      ),
      "",
      "#### Foreign Keys",
      "",
      markdownTable(
        ["Constraint", "Columns", "References", "On Update", "On Delete"],
        foreignKeys.map((foreignKey) => [
          foreignKey.constraint_name,
          foreignKey.columns.join(", "),
          `${foreignKey.foreign_table_schema}.${foreignKey.foreign_table_name}(${foreignKey.foreign_columns.join(", ")})`,
          foreignKey.update_rule,
          foreignKey.delete_rule,
        ]),
      ),
      "",
      "#### Indexes",
      "",
      markdownTable(
        ["Index", "Unique", "Primary", "Definition"],
        indexes.map((index) => [
          `${index.index_schema}.${index.index_name}`,
          index.is_unique ? "YES" : "NO",
          index.is_primary ? "YES" : "NO",
          index.index_definition,
        ]),
      ),
    );
  }

  sections.push(
    "",
    "## Relationships Detected",
    "",
    markdownTable(
      ["Constraint", "From", "To", "On Update", "On Delete"],
      data.foreignKeys.map((foreignKey) => [
        `${foreignKey.constraint_schema}.${foreignKey.constraint_name}`,
        `${foreignKey.table_schema}.${foreignKey.table_name}(${foreignKey.columns.join(", ")})`,
        `${foreignKey.foreign_table_schema}.${foreignKey.foreign_table_name}(${foreignKey.foreign_columns.join(", ")})`,
        foreignKey.update_rule,
        foreignKey.delete_rule,
      ]),
    ),
    "",
    "## Indexes Detected",
    "",
    markdownTable(
      ["Table", "Index", "Unique", "Primary", "Definition"],
      data.indexes.map((index) => [
        `${index.table_schema}.${index.table_name}`,
        `${index.index_schema}.${index.index_name}`,
        index.is_unique ? "YES" : "NO",
        index.is_primary ? "YES" : "NO",
        index.index_definition,
      ]),
    ),
    "",
    "## Views Found",
    "",
    markdownTable(
      ["Schema", "View"],
      data.views.map((view) => [view.table_schema, view.table_name]),
    ),
  );

  for (const view of data.views) {
    const key = relationKey(view.table_schema, view.table_name);
    const columns = columnsByRelation.get(key) ?? [];

    sections.push(
      "",
      `### ${key}`,
      "",
      "#### Columns",
      "",
      markdownTable(
        ["#", "Column", "Type", "Nullable", "Default"],
        columns.map((column) => [
          String(column.ordinal_position),
          column.column_name,
          formatColumnType(column),
          column.is_nullable === "YES" ? "YES" : "NO",
          column.column_default,
        ]),
      ),
      "",
      "#### Definition",
      "",
      fencedSql(view.view_definition),
    );
  }

  sections.push(
    "",
    "## Expected Objects Not Found",
    "",
    "### Tables",
    "",
    missingTables.length > 0 ? missingTables.map((table) => `- ${table}`).join("\n") : "_All expected tables were found by name._",
    "",
    "### Views",
    "",
    missingViews.length > 0 ? missingViews.map((view) => `- ${view}`).join("\n") : "_All expected views were found by name._",
    "",
    "## Safety Notes",
    "",
    "- This inspection script uses metadata-only `SELECT` statements.",
    "- It does not run `DROP`, `TRUNCATE`, `ALTER TABLE`, `CREATE TABLE`, `CREATE INDEX`, `INSERT`, `UPDATE`, or `DELETE`.",
    "- It does not create migrations and does not modify database data or schema.",
    "",
  );

  return `${sections.join("\n")}\n`;
}

async function queryMetadata(client: { query: <T>(sql: string) => Promise<{ rows: T[] }> }) {
  const schemas = await client.query<SchemaRow>(`
    SELECT n.nspname AS schema_name,
           pg_catalog.pg_get_userbyid(n.nspowner) AS schema_owner
    FROM pg_catalog.pg_namespace n
    WHERE n.nspname NOT LIKE 'pg\\_%'
      AND n.nspname <> 'information_schema'
    ORDER BY n.nspname;
  `);

  const tables = await client.query<RelationRow>(`
    SELECT table_schema,
           table_name,
           table_type
    FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      AND table_schema NOT LIKE 'pg\\_%'
      AND table_type = 'BASE TABLE'
    ORDER BY table_schema, table_name;
  `);

  const columns = await client.query<ColumnRow>(`
    SELECT c.table_schema,
           c.table_name,
           c.column_name,
           c.ordinal_position,
           c.data_type,
           c.udt_name,
           pg_catalog.format_type(a.atttypid, a.atttypmod) AS formatted_type,
           c.is_nullable,
           c.column_default,
           c.character_maximum_length,
           c.numeric_precision,
           c.numeric_scale
    FROM information_schema.columns c
    JOIN pg_catalog.pg_namespace n
      ON n.nspname = c.table_schema
    JOIN pg_catalog.pg_class cls
      ON cls.relnamespace = n.oid
     AND cls.relname = c.table_name
    JOIN pg_catalog.pg_attribute a
      ON a.attrelid = cls.oid
     AND a.attname = c.column_name
     AND a.attnum > 0
     AND NOT a.attisdropped
    WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
      AND c.table_schema NOT LIKE 'pg\\_%'
    ORDER BY c.table_schema, c.table_name, c.ordinal_position;
  `);

  const primaryKeys = await client.query<PrimaryKeyRow>(`
    SELECT tc.table_schema,
           tc.table_name,
           tc.constraint_name,
           array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_schema = kcu.constraint_schema
     AND tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
     AND tc.table_name = kcu.table_name
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
      AND tc.table_schema NOT LIKE 'pg\\_%'
    GROUP BY tc.table_schema, tc.table_name, tc.constraint_name
    ORDER BY tc.table_schema, tc.table_name, tc.constraint_name;
  `);

  const foreignKeys = await client.query<ForeignKeyRow>(`
    SELECT tc.constraint_schema,
           tc.constraint_name,
           tc.table_schema,
           tc.table_name,
           array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns,
           ccu.table_schema AS foreign_table_schema,
           ccu.table_name AS foreign_table_name,
           array_agg(ccu.column_name ORDER BY kcu.ordinal_position) AS foreign_columns,
           rc.update_rule,
           rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_schema = kcu.constraint_schema
     AND tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
     AND tc.table_name = kcu.table_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_schema = tc.constraint_schema
     AND ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints rc
      ON rc.constraint_schema = tc.constraint_schema
     AND rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema NOT IN ('pg_catalog', 'information_schema')
      AND tc.table_schema NOT LIKE 'pg\\_%'
    GROUP BY tc.constraint_schema,
             tc.constraint_name,
             tc.table_schema,
             tc.table_name,
             ccu.table_schema,
             ccu.table_name,
             rc.update_rule,
             rc.delete_rule
    ORDER BY tc.table_schema, tc.table_name, tc.constraint_name;
  `);

  const indexes = await client.query<IndexRow>(`
    SELECT schemaname AS table_schema,
           tablename AS table_name,
           schemaname AS index_schema,
           indexname AS index_name,
           i.indisunique AS is_unique,
           i.indisprimary AS is_primary,
           indexdef AS index_definition
    FROM pg_catalog.pg_indexes pi
    JOIN pg_catalog.pg_class idx
      ON idx.relname = pi.indexname
    JOIN pg_catalog.pg_namespace idx_ns
      ON idx_ns.oid = idx.relnamespace
     AND idx_ns.nspname = pi.schemaname
    JOIN pg_catalog.pg_index i
      ON i.indexrelid = idx.oid
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
      AND schemaname NOT LIKE 'pg\\_%'
    ORDER BY schemaname, tablename, indexname;
  `);

  const views = await client.query<ViewRow>(`
    SELECT table_schema,
           table_name,
           view_definition
    FROM information_schema.views
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      AND table_schema NOT LIKE 'pg\\_%'
    ORDER BY table_schema, table_name;
  `);

  return {
    schemas: schemas.rows,
    tables: tables.rows,
    columns: columns.rows,
    primaryKeys: primaryKeys.rows,
    foreignKeys: foreignKeys.rows,
    indexes: indexes.rows,
    views: views.rows,
  };
}

async function main() {
  const connectionString = getDatabaseUrl();

  if (!connectionString) {
    return;
  }

  const { Client } = await import("pg");
  const client = new Client({ connectionString, ssl: sslConfig() });

  await client.connect();

  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL statement_timeout = '30s'");

    const metadata = await queryMetadata(client);
    const markdown = buildMarkdown({ generatedAt: new Date(), ...metadata });

    await client.query("COMMIT");
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, markdown, "utf8");

    console.log(`Database schema inspection written to ${path.relative(process.cwd(), outputPath)}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("Database schema inspection failed.");
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
