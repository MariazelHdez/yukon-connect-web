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
  score?: number | null;
  match_reason?: string[] | null;
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

const CONTRACT_LIST_SELECT = `
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
        v.soa_number`;

const DIRECT_SEARCH_PREDICATE = `(
        v.contract_no ilike '%' || sq.raw_query || '%'
        or v.contract_description ilike '%' || sq.raw_query || '%'
        or v.vendor ilike '%' || sq.raw_query || '%'
        or v.department ilike '%' || sq.raw_query || '%'
        or v.community ilike '%' || sq.raw_query || '%'
        or v.fiscal_year ilike '%' || sq.raw_query || '%'
        or v.project_manager ilike '%' || sq.raw_query || '%'
        or v.amount::text ilike '%' || sq.raw_query || '%'
        or v.contract_type ilike '%' || sq.raw_query || '%'
        or v.tender_class ilike '%' || sq.raw_query || '%'
        or v.type_code ilike '%' || sq.raw_query || '%'
        or v.type_name ilike '%' || sq.raw_query || '%'
      )`;

const FULL_TEXT_MATCH_PREDICATE = `(
        v.contract_description ilike '%' || sq.raw_query || '%'
        or v.department ilike '%' || sq.raw_query || '%'
        or v.community ilike '%' || sq.raw_query || '%'
        or v.fiscal_year ilike '%' || sq.raw_query || '%'
        or v.amount::text ilike '%' || sq.raw_query || '%'
        or v.contract_type ilike '%' || sq.raw_query || '%'
        or v.tender_class ilike '%' || sq.raw_query || '%'
        or v.type_code ilike '%' || sq.raw_query || '%'
        or v.type_name ilike '%' || sq.raw_query || '%'
      )`;

const EXPANDED_DIRECT_SEARCH_PREDICATE = `exists (
        select 1
        from unnest(sq.search_terms) as term(value)
        where
          v.contract_no ilike '%' || term.value || '%'
          or v.contract_description ilike '%' || term.value || '%'
          or v.vendor ilike '%' || term.value || '%'
          or v.department ilike '%' || term.value || '%'
          or v.community ilike '%' || term.value || '%'
          or v.fiscal_year ilike '%' || term.value || '%'
          or v.project_manager ilike '%' || term.value || '%'
          or v.amount::text ilike '%' || term.value || '%'
          or v.contract_type ilike '%' || term.value || '%'
          or v.tender_class ilike '%' || term.value || '%'
          or v.type_code ilike '%' || term.value || '%'
          or v.type_name ilike '%' || term.value || '%'
      )`;

const SYNONYM_DIRECT_SEARCH_PREDICATE = `exists (
        select 1
        from unnest(sq.synonym_terms) as term(value)
        where
          v.contract_no ilike '%' || term.value || '%'
          or v.contract_description ilike '%' || term.value || '%'
          or v.vendor ilike '%' || term.value || '%'
          or v.department ilike '%' || term.value || '%'
          or v.community ilike '%' || term.value || '%'
          or v.fiscal_year ilike '%' || term.value || '%'
          or v.project_manager ilike '%' || term.value || '%'
          or v.amount::text ilike '%' || term.value || '%'
          or v.contract_type ilike '%' || term.value || '%'
          or v.tender_class ilike '%' || term.value || '%'
          or v.type_code ilike '%' || term.value || '%'
          or v.type_name ilike '%' || term.value || '%'
      )`;

const FALLBACK_MATCH_REASON_SQL = `array_remove(array[
        case when lower(v.contract_no) = lower(sq.raw_query) then 'exact_contract_no' end,
        case when v.vendor ilike '%' || sq.raw_query || '%' then 'vendor_match' end,
        case when v.project_manager ilike '%' || sq.raw_query || '%' then 'project_manager_match' end,
        case when v.contract_description ilike '%' || sq.raw_query || '%' then 'full_text' end
      ], null)`;

const MATCH_REASON_SQL = `array_remove(array[
        case when lower(v.contract_no) = lower(sq.raw_query) then 'exact_contract_no' end,
        case when v.vendor ilike '%' || sq.raw_query || '%' then 'vendor_match' end,
        case when v.project_manager ilike '%' || sq.raw_query || '%' then 'project_manager_match' end,
        case when ${FULL_TEXT_MATCH_PREDICATE} or (numnode(sq.expanded_query) > 0 and csi.search_vector @@ sq.expanded_query) then 'full_text' end,
        case when coalesce(ctm.direct_tag_match, false) then 'tag_match' end,
        case when coalesce(ctm.synonym_tag_match, false) or ${SYNONYM_DIRECT_SEARCH_PREDICATE} then 'synonym_match' end
      ], null)`;

export class ContractsRepository {
  private readonly db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  async listContracts(query: ContractListQuery): Promise<ContractListResult> {
    return query.q ? this.searchContracts(query) : this.listContractsWithoutSearch(query);
  }

  private async listContractsWithoutSearch(query: ContractListQuery): Promise<ContractListResult> {
    const { whereSql, values } = buildWhereClause(query);
    const limitPosition = values.length + 1;
    const offsetPosition = values.length + 2;
    const limit = query.pageSize;
    const offset = (query.page - 1) * query.pageSize;

    const dataSql = `
      select
${CONTRACT_LIST_SELECT},
        null::double precision as score,
        null::text[] as match_reason,
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

  private async searchContracts(query: ContractListQuery): Promise<ContractListResult> {
    const { whereSql, values } = buildWhereClause(query);
    const searchTermPosition = values.length + 1;
    const limitPosition = values.length + 2;
    const offsetPosition = values.length + 3;
    const limit = query.pageSize;
    const offset = (query.page - 1) * query.pageSize;

    const searchCte = `
      with search_query as (
        select
          websearch_to_tsquery('english', expanded.search_text) as expanded_query,
          websearch_to_tsquery('english', raw.raw_query) as query,
          raw.raw_query,
          expanded.search_terms,
          expanded.synonym_terms
        from (select $${searchTermPosition}::text as raw_query) raw
        cross join lateral (
          select
            array_remove(array_agg(distinct term), null) as search_terms,
            array_remove(array_agg(distinct term) filter (where term <> raw.raw_query), null) as synonym_terms,
            array_to_string(array_remove(array_agg(distinct term), null), ' ') as search_text
          from (
            select raw.raw_query as term
            union
            select ss.synonym as term
            from search_synonyms ss
            where lower(ss.term) = lower(raw.raw_query)
          ) expanded_terms
        ) expanded
      ), matching_contract_tags as (
        select
          ct.contract_record_id,
          bool_or(lower(t.name) = lower(sq.raw_query) or lower(t.slug) = lower(replace(sq.raw_query, ' ', '-'))) as direct_tag_match,
          bool_or(exists (
            select 1
            from unnest(sq.synonym_terms) as synonym(value)
            where lower(t.name) = lower(synonym.value)
              or lower(t.slug) = lower(replace(synonym.value, ' ', '-'))
          )) as synonym_tag_match
        from contract_tags ct
        join tags t on t.id = ct.tag_id
        cross join search_query sq
        where lower(t.name) = any (select lower(value) from unnest(sq.search_terms) as term(value))
          or lower(t.slug) = any (select lower(replace(value, ' ', '-')) from unnest(sq.search_terms) as term(value))
        group by ct.contract_record_id
      )`;
    const searchPredicate = `(
        lower(v.contract_no) = lower(sq.raw_query)
        or ${DIRECT_SEARCH_PREDICATE}
        or ${EXPANDED_DIRECT_SEARCH_PREDICATE}
        or (numnode(sq.expanded_query) > 0 and csi.search_vector @@ sq.expanded_query)
        or coalesce(ctm.direct_tag_match, false)
        or coalesce(ctm.synonym_tag_match, false)
      )`;
    const searchScore = `(
        case when lower(v.contract_no) = lower(sq.raw_query) then 1000 else 0 end
        + case when v.contract_no ilike '%' || sq.raw_query || '%' then 500 else 0 end
        + case when v.vendor ilike '%' || sq.raw_query || '%' then 125 else 0 end
        + case when v.project_manager ilike '%' || sq.raw_query || '%' then 125 else 0 end
        + case when coalesce(ctm.direct_tag_match, false) then 100 else 0 end
        + case when coalesce(ctm.synonym_tag_match, false) then 90 else 0 end
        + case when numnode(sq.expanded_query) > 0 then coalesce(ts_rank_cd(csi.search_vector, sq.expanded_query), 0) else 0 end
      )`;
    const combinedWhereSql = appendWhereCondition(whereSql, searchPredicate);

    const dataSql = `
      ${searchCte}
      select
${CONTRACT_LIST_SELECT},
        ${searchScore} as score,
        ${MATCH_REASON_SQL} as match_reason,
        v.created_at,
        v.updated_at
      from vw_contracts_full v
      left join contract_records cr on cr.id = v.id
      left join contract_search_index csi on csi.contract_record_id = v.id
      left join matching_contract_tags ctm on ctm.contract_record_id = v.id
      cross join search_query sq
      ${combinedWhereSql}
      order by score desc, v.created_at desc nulls last, v.id desc
      limit $${limitPosition}
      offset $${offsetPosition}
    `;
    const countSql = `
      ${searchCte}
      select count(*)::int as total
      from vw_contracts_full v
      left join contract_records cr on cr.id = v.id
      left join contract_search_index csi on csi.contract_record_id = v.id
      left join matching_contract_tags ctm on ctm.contract_record_id = v.id
      cross join search_query sq
      ${combinedWhereSql}
    `;
    const queryValues = [...values, query.q];

    try {
      const [dataResult, countResult] = await Promise.all([
        this.db.query<ContractRow>(dataSql, [...queryValues, limit, offset]),
        this.db.query<{ total: number }>(countSql, queryValues),
      ]);

      return {
        data: dataResult.rows,
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total: countResult.rows[0]?.total ?? 0,
        },
      };
    } catch (error) {
      if (isUndefinedTableError(error)) {
        return this.searchContractsWithoutIndex(query);
      }

      throw error;
    }
  }

  private async searchContractsWithoutIndex(query: ContractListQuery): Promise<ContractListResult> {
    const { whereSql, values } = buildWhereClause(query);
    const searchTermPosition = values.length + 1;
    const limitPosition = values.length + 2;
    const offsetPosition = values.length + 3;
    const limit = query.pageSize;
    const offset = (query.page - 1) * query.pageSize;
    const searchCte = `
      with search_query as (
        select $${searchTermPosition}::text as raw_query
      )`;
    const searchPredicate = `(
        lower(v.contract_no) = lower(sq.raw_query)
        or ${DIRECT_SEARCH_PREDICATE}
      )`;
    const searchScore = `(
        case when lower(v.contract_no) = lower(sq.raw_query) then 1000 else 0 end
        + case when v.contract_no ilike '%' || sq.raw_query || '%' then 500 else 0 end
        + case when v.vendor ilike '%' || sq.raw_query || '%' then 125 else 0 end
        + case when v.project_manager ilike '%' || sq.raw_query || '%' then 125 else 0 end
        + case when v.contract_description ilike '%' || sq.raw_query || '%' then 50 else 0 end
      )`;
    const combinedWhereSql = appendWhereCondition(whereSql, searchPredicate);
    const queryValues = [...values, query.q];

    const dataSql = `
      ${searchCte}
      select
${CONTRACT_LIST_SELECT},
        ${searchScore} as score,
        ${FALLBACK_MATCH_REASON_SQL} as match_reason,
        v.created_at,
        v.updated_at
      from vw_contracts_full v
      left join contract_records cr on cr.id = v.id
      cross join search_query sq
      ${combinedWhereSql}
      order by score desc, v.created_at desc nulls last, v.id desc
      limit $${limitPosition}
      offset $${offsetPosition}
    `;
    const countSql = `
      ${searchCte}
      select count(*)::int as total
      from vw_contracts_full v
      left join contract_records cr on cr.id = v.id
      cross join search_query sq
      ${combinedWhereSql}
    `;

    const [dataResult, countResult] = await Promise.all([
      this.db.query<ContractRow>(dataSql, [...queryValues, limit, offset]),
      this.db.query<{ total: number }>(countSql, queryValues),
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
          null::double precision as score,
          null::text[] as match_reason,
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

function appendWhereCondition(whereSql: string, condition: string): string {
  if (whereSql.trim() === '') {
    return `where ${condition}`;
  }

  return `${whereSql} and ${condition}`;
}

function isUndefinedTableError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '42P01';
}
