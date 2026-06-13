-- Feedback/contact submissions for Yukon Connect.
-- This table is used by the API POST /feedback endpoint and intentionally
-- stores only user-submitted feedback fields, not contract records.

create table if not exists app_feedback (
  id bigserial primary key,
  name text not null check (char_length(name) between 1 and 120),
  email text not null check (char_length(email) between 3 and 254),
  message text not null check (char_length(message) between 10 and 4000),
  context jsonb not null default '{}'::jsonb,
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved', 'spam')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_feedback_status_created_at_idx
  on app_feedback (status, created_at desc);

create or replace function set_app_feedback_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_feedback_set_updated_at on app_feedback;
create trigger app_feedback_set_updated_at
before update on app_feedback
for each row
execute function set_app_feedback_updated_at();
