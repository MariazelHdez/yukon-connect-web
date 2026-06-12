import type { DatabaseClient, QueryValue } from '../db/database.ts';
import type { ContractListQuery } from './validation.ts';

export interface ContractRow {
  id: number;
  contract_no: string | null;
  contract_description: string | null;
  vendor: string | null;
  department: string | null;
  community: string | null;
  contract_type: string | null;
  tender_class: string | null;
  fiscal_year: string | null;
  type_code: string | null;
  type_name: string | null;
  amount: number | null;
  project_manager?: string | null;
  work_community?: string | null;
  postal_code?: string | null;
  yukon_business?: boolean | null;
  yfn_business?: boolean | null;
  detail_contract_type?: string | null;
  tender_type?: string | null;
  detail_tender_class?: string | null;
  soa_number?: string | null;
  created_at: string | Date | null;
  updated_at: string | Date | null;
}

export interface ContractListResult {
  data: ContractRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

export interface ContractFilters {
  vendors: string[];
  departments: string[];
  communities: string[];
  fiscalYears: string[];
  contractTypes: string[];
  tenderClasses: string[];
  projectManagers: string[];
}

const FILTER_COLUMNS = {
  vendor: 'v.vendor',
  department: 'v.department',
  community: 'v.community',
  fiscalYear: 'v.fiscal_year',
  projectManager: 'v.project_manager',
  contractType: 'v.contract_type',
  tenderClass: 'v.tender_class',
} as const;

export class ContractsRepository {
  private readonly db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  async listContracts(query: ContractListQuery): Promise<ContractListResult> {
    const { whereSql, values } = buildWhereClause(query);
    const limitPosition = values.length + 1;
    const offsetPosition = values.length + 2;
    const limit = query.pageSize;
    const offset = (query.page - 1) * query.pageSize;

    const dataSql = `
      select
        v.id,
        v.contract_no,
        v.contract_description,
        v.vendor,
        v.department,
        v.community,
        v.contract_type,
        v.tender_class,
        v.fiscal_year,
        v.type_code,
        v.type_name,
        v.amount,
        v.project_manager,
        v.created_at,
        v.updated_at
      from vw_contracts_full v
      left join contract_records cr on cr.id = v.id
      ${whereSql}
      order by v.created_at desc nulls last, v.id desc
      limit $${limitPosition}
      offset $${offsetPosition}
    `;
    const countSql = `select count(*)::int as total from vw_contracts_full v left join contract_records cr on cr.id = v.id ${whereSql}`;

    const [dataResult, countResult] = await Promise.all([
      this.db.query<ContractRow>(dataSql, [...values, limit, offset]),
      this.db.query<{ total: number }>(countSql, values),
    ]);

    return {
      data: dataResult.rows,
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total: countResult.rows[0]?.total ?? 0,
      },
    };
  }

  async getContract(id: number): Promise<ContractRow | null> {
    const result = await this.db.query<ContractRow>(
      `
        select
          v.id,
          v.contract_no,
          v.contract_description,
          v.vendor,
          v.department,
          v.community,
          v.contract_type,
          v.tender_class,
          v.fiscal_year,
          v.type_code,
          v.type_name,
          v.amount,
          v.project_manager,
          v.work_community,
          v.postal_code,
          v.yukon_business,
          v.yfn_business,
          v.detail_contract_type,
          v.tender_type,
          v.detail_tender_class,
          v.soa_number,
          v.created_at,
          v.updated_at
        from vw_contracts_full v
        where v.id = $1
        limit 1
      `,
      [id],
    );

    return result.rows[0] ?? null;
  }

  async getFilters(): Promise<ContractFilters> {
    const sql = `
      select
        coalesce(array_agg(distinct vendor order by vendor) filter (where vendor is not null), '{}') as "vendors",
        coalesce(array_agg(distinct department order by department) filter (where department is not null), '{}') as "departments",
        coalesce(array_agg(distinct community order by community) filter (where community is not null), '{}') as "communities",
        coalesce(array_agg(distinct fiscal_year order by fiscal_year) filter (where fiscal_year is not null), '{}') as "fiscalYears",
        coalesce(array_agg(distinct contract_type order by contract_type) filter (where contract_type is not null), '{}') as "contractTypes",
        coalesce(array_agg(distinct tender_class order by tender_class) filter (where tender_class is not null), '{}') as "tenderClasses",
        coalesce(array_agg(distinct project_manager order by project_manager) filter (where project_manager is not null), '{}') as "projectManagers"
      from vw_contracts_full
    `;
    const result = await this.db.query<ContractFilters>(sql);
    return result.rows[0] ?? {
      vendors: [],
      departments: [],
      communities: [],
      fiscalYears: [],
      contractTypes: [],
      tenderClasses: [],
      projectManagers: [],
    };
  }
}

function buildWhereClause(query: ContractListQuery): { whereSql: string; values: QueryValue[] } {
  const conditions: string[] = [];
  const values: QueryValue[] = [];

  const addValue = (value: QueryValue): string => {
    values.push(value);
    return `$${values.length}`;
  };

  if (query.q) {
    const placeholder = addValue(`%${query.q}%`);
    conditions.push(`(
      v.contract_no ilike ${placeholder}
      or v.contract_description ilike ${placeholder}
      or v.vendor ilike ${placeholder}
      or v.department ilike ${placeholder}
      or v.community ilike ${placeholder}
      or v.project_manager ilike ${placeholder}
    )`);
  }

  for (const [queryKey, column] of Object.entries(FILTER_COLUMNS)) {
    const value = query[queryKey as keyof typeof FILTER_COLUMNS];
    if (typeof value === 'string' && value !== '') {
      conditions.push(`${column} = ${addValue(value)}`);
    }
  }

  if (query.minAmount !== undefined) {
    conditions.push(`v.amount >= ${addValue(query.minAmount)}`);
  }

  if (query.maxAmount !== undefined) {
    conditions.push(`v.amount <= ${addValue(query.maxAmount)}`);
  }

  if (query.startDateFrom) {
    conditions.push(`cr.start_date::date >= ${addValue(query.startDateFrom)}`);
  }

  if (query.startDateTo) {
    conditions.push(`cr.start_date::date <= ${addValue(query.startDateTo)}`);
  }

  return {
    whereSql: conditions.length > 0 ? `where ${conditions.join(' and ')}` : '',
    values,
  };
}
