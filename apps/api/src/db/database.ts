export type QueryValue = string | number | boolean | Date | string[] | null;

export interface QueryResult<Row> {
  rows: Row[];
  rowCount: number;
}

export interface DatabaseClient {
  query<Row>(sql: string, values?: QueryValue[]): Promise<QueryResult<Row>>;
  close(): Promise<void>;
}

export interface DatabaseStatus {
  configured: boolean;
  connected: boolean;
  message?: string;
}
