declare module 'pg' {
  export class Pool {
    constructor(options: { connectionString?: string });
    query<Row>(sql: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount: number }>;
    end(): Promise<void>;
  }
}
