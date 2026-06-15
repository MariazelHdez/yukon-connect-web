declare module 'pg' {
  type ConnectionOptions = {
    connectionString?: string;
    ssl?: false | { rejectUnauthorized?: boolean };
    max?: number;
  };

  export class Pool {
    constructor(options: ConnectionOptions);
    query<Row>(sql: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount: number }>;
    end(): Promise<void>;
  }

  export class Client {
    constructor(options: ConnectionOptions);
    connect(): Promise<void>;
    query<Row = unknown>(sql: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount: number }>;
    end(): Promise<void>;
  }
}
