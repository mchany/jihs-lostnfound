create table if not exists public.posts (
  id uuid primary key,
  type text not null check (type in ('lost', 'found')),
  item text not null,
  location text not null,
  storage text not null default '',
  simple_description text not null,
  detailed_description text not null default '',
  nickname text not null,
  photo text not null default '',
  password_salt text not null,
  password_hash text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create table if not exists public.post_comments (
  id uuid primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  nickname text not null,
  content text not null,
  created_at timestamptz not null
);

create index if not exists post_comments_post_created_idx
  on public.post_comments (post_id, created_at);

alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
