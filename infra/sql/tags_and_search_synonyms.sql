-- Tags and search synonyms for contract search enrichment.
-- Run this after the core contract tables exist. Contract tags are attached to
-- contract_records rows and are used by the API to broaden q search results.

create table if not exists tags (
  id bigint generated always as identity primary key,
  name text not null unique,
  slug text not null unique,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists contract_tags (
  contract_record_id bigint not null references contract_records(id) on delete cascade,
  tag_id bigint not null references tags(id) on delete cascade,
  source text not null default 'manual',
  confidence numeric(5, 4) not null default 1.0 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  primary key (contract_record_id, tag_id, source)
);

create table if not exists search_synonyms (
  id bigint generated always as identity primary key,
  term text not null,
  synonym text not null,
  category text,
  created_at timestamptz not null default now(),
  unique (term, synonym, category)
);

create index if not exists contract_tags_contract_record_id_idx
  on contract_tags (contract_record_id);

create index if not exists contract_tags_tag_id_idx
  on contract_tags (tag_id);

create index if not exists tags_slug_idx
  on tags (slug);

create index if not exists search_synonyms_term_idx
  on search_synonyms (lower(term));

insert into tags (name, slug, category)
values
  ('construction', 'construction', 'contract'),
  ('infrastructure', 'infrastructure', 'contract'),
  ('bridge', 'bridge', 'contract'),
  ('road maintenance', 'road-maintenance', 'contract'),
  ('materials', 'materials', 'contract'),
  ('food', 'food', 'contract'),
  ('apples', 'apples', 'contract'),
  ('produce', 'produce', 'contract'),
  ('support', 'support', 'contract'),
  ('engineering', 'engineering', 'contract'),
  ('consulting', 'consulting', 'contract'),
  ('IT services', 'it-services', 'contract')
on conflict (slug) do update
set
  name = excluded.name,
  category = excluded.category;

insert into search_synonyms (term, synonym, category)
values
  ('construction', 'infrastructure', 'contract'),
  ('construction', 'bridge', 'contract'),
  ('construction', 'road', 'contract'),
  ('construction', 'materials', 'contract'),
  ('apples', 'food', 'contract'),
  ('apples', 'produce', 'contract'),
  ('support', 'maintenance', 'contract'),
  ('bridge', 'infrastructure', 'contract')
on conflict (term, synonym, category) do nothing;
