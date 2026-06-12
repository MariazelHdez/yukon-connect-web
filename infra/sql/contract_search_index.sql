-- Full-text search index for contract records.
-- Run this after vw_contracts_full exists, then call rebuild_contract_search_index()
-- whenever source contract data changes.

create table if not exists contract_search_index (
  id bigint generated always as identity primary key,
  contract_record_id bigint not null unique,
  search_text text not null,
  search_vector tsvector not null,
  last_indexed_at timestamptz not null default now()
);

create index if not exists contract_search_index_search_vector_idx
  on contract_search_index using gin (search_vector);

create index if not exists contract_search_index_contract_record_id_idx
  on contract_search_index (contract_record_id);

create or replace function rebuild_contract_search_index()
returns void
language plpgsql
as $$
begin
  truncate table contract_search_index restart identity;

  insert into contract_search_index (
    contract_record_id,
    search_text,
    search_vector,
    last_indexed_at
  )
  select
    v.id as contract_record_id,
    concat_ws(' ',
      v.contract_description,
      v.vendor,
      v.department,
      v.community,
      v.contract_type,
      v.tender_class,
      v.fiscal_year,
      v.type_code,
      v.type_name,
      v.amount::text,
      v.project_manager,
      v.work_community,
      v.postal_code,
      case when v.yukon_business is null then null else 'yukon_business ' || v.yukon_business::text end,
      case when v.yfn_business is null then null else 'yfn_business ' || v.yfn_business::text end,
      v.detail_contract_type,
      v.tender_type,
      v.detail_tender_class,
      v.soa_number
    ) as search_text,
    setweight(to_tsvector('english', coalesce(v.vendor, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(v.project_manager, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(v.contract_description, '')), 'B') ||
    setweight(to_tsvector('english', concat_ws(' ',
      v.department,
      v.community,
      v.contract_type,
      v.tender_class,
      v.fiscal_year,
      v.type_code,
      v.type_name,
      v.amount::text,
      v.work_community,
      v.postal_code,
      case when v.yukon_business is null then null else 'yukon_business ' || v.yukon_business::text end,
      case when v.yfn_business is null then null else 'yfn_business ' || v.yfn_business::text end,
      v.detail_contract_type,
      v.tender_type,
      v.detail_tender_class,
      v.soa_number
    )), 'C') as search_vector,
    now() as last_indexed_at
  from vw_contracts_full v;
end;
$$;
