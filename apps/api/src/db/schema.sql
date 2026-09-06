create extension if not exists "pgcrypto";

create or replace function parse_beim_money(value text)
returns numeric
language sql
immutable
as $$
  select coalesce(nullif(replace(regexp_replace(coalesce(value, ''), '[^0-9,.-]', '', 'g'), ',', '.'), '')::numeric, 0)
$$;

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  first_name text,
  last_name text,
  username text unique,
  email text unique,
  password_hash text not null,
  role text not null check (role in ('cliente', 'admin', 'superadmin')),
  phone text,
  company text,
  ci text,
  rut text,
  department text,
  locality text,
  address text,
  website text,
  trade_references text,
  is_wholesaler boolean not null default false,
  is_beim boolean not null default false,
  is_approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists categories (
  id text primary key,
  name text not null,
  code text not null,
  description text not null,
  parent_id text references categories(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table categories add column if not exists sort_order integer not null default 0;

create table if not exists products (
  id text primary key,
  product_code integer,
  name text not null,
  category_id text not null references categories(id) on delete restrict,
  brand text not null default '',
  model text not null default '',
  price numeric(12,2) not null default 0,
  currency text not null default 'UYU' check (currency in ('UYU', 'USD', 'USDT')),
  stock integer not null default 0,
  badge text not null default 'Nuevo',
  image text,
  description text not null default '',
  product_type text not null default 'accesorio',
  compatible_models text[] not null default '{}',
  supplier_name text not null default '',
  supplier_lot text not null default '',
  min_stock integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table products add column if not exists product_type text not null default 'accesorio';
alter table products add column if not exists compatible_models text[] not null default '{}';
alter table products add column if not exists supplier_name text not null default '';
alter table products add column if not exists supplier_lot text not null default '';
alter table products add column if not exists min_stock integer not null default 0;
alter table products add column if not exists warranty_days integer not null default 30;

create sequence if not exists product_code_seq start with 1 increment by 1;

alter table products add column if not exists product_code integer;

update products
set product_code = ordered.next_code
from (
  select id, row_number() over (order by created_at asc, id asc) as next_code
  from products
) as ordered
where products.id = ordered.id
  and products.product_code is null;

select setval(
  'product_code_seq',
  greatest(coalesce((select max(product_code) from products), 0), 1),
  true
);

alter table products alter column product_code set default nextval('product_code_seq');
alter table products alter column product_code set not null;

create unique index if not exists products_product_code_key on products(product_code);

create table if not exists promo_slides (
  id text primary key,
  eyebrow text not null,
  title text not null,
  text text not null,
  image text not null,
  primary_label text,
  primary_href text,
  secondary_label text,
  secondary_href text,
  image_x numeric(8,2) not null default 50,
  image_y numeric(8,2) not null default 50,
  image_scale numeric(8,2) not null default 1,
  image_frame_preset text not null default 'default',
  image_frame_width numeric(8,2),
  image_frame_height numeric(8,2),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table promo_slides add column if not exists image_frame_width numeric(8,2);
alter table promo_slides add column if not exists image_frame_height numeric(8,2);

create table if not exists orders (
  id text primary key,
  invoice_number integer unique,
  user_id uuid references users(id) on delete set null,
  customer text not null,
  email text,
  phone text,
  ci text,
  rut text,
  payment_method_id text,
  payment_method_name text,
  payment_instructions text,
  payment_status text not null default 'Pendiente de pago',
  payment_receipt_path text,
  payment_receipt_name text,
  payment_reviewed_at timestamptz,
  stock_committed boolean not null default false,
  document_type text,
  document_value text,
  address text,
  shipping text,
  comments text,
  total numeric(12,2) not null default 0,
  currency text not null default 'UYU' check (currency in ('UYU', 'USD', 'USDT')),
  status text not null default 'Pendiente',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table orders add column if not exists payment_method_id text;
alter table orders add column if not exists payment_method_name text;
alter table orders add column if not exists payment_instructions text;
alter table orders add column if not exists payment_status text;
alter table orders add column if not exists payment_receipt_path text;
alter table orders add column if not exists payment_receipt_name text;
alter table orders add column if not exists payment_reviewed_at timestamptz;
alter table orders add column if not exists stock_committed boolean;
update orders set payment_status = case when status = 'Pagado' then 'Pagado' else 'Pendiente de pago' end where payment_status is null;
update orders set stock_committed = true where stock_committed is null;
alter table orders alter column payment_status set default 'Pendiente de pago';
alter table orders alter column payment_status set not null;
alter table orders alter column stock_committed set default false;
alter table orders alter column stock_committed set not null;
alter table orders add column if not exists invoice_number integer;

create sequence if not exists invoice_number_seq minvalue 0 start with 0 increment by 1;

update orders
set invoice_number = ordered.invoice_number
from (
  select id, row_number() over (order by created_at asc, id asc) - 1 as invoice_number
  from orders
) as ordered
where orders.id = ordered.id
  and orders.invoice_number is null;

select setval(
  'invoice_number_seq',
  greatest(coalesce((select max(invoice_number) from orders), 0), 0),
  true
);

alter table orders alter column invoice_number set default nextval('invoice_number_seq');
alter table orders alter column invoice_number set not null;
create unique index if not exists orders_invoice_number_key on orders(invoice_number);

create sequence if not exists beim_receipt_number_seq minvalue 1000 start with 1000 increment by 1;

create table if not exists beim_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_number integer unique not null default nextval('beim_receipt_number_seq'),
  user_id uuid references users(id) on delete set null,
  repair_status text not null default 'Ingresado',
  client_name text not null default '',
  client_id text not null default '',
  client_phone text not null default '',
  device_brand text not null default '',
  device_model text not null default '',
  device_color text not null default '',
  imei_serial text not null default '',
  assigned_technician_id uuid references users(id) on delete set null,
  diagnostic_notes text not null default '',
  quote_status text not null default 'Borrador',
  quote_total numeric(12,2) not null default 0,
  quote_sent_at timestamptz,
  quote_approved_at timestamptz,
  qa_status text not null default 'Pendiente',
  qa_completed_at timestamptz,
  warranty_starts_at timestamptz,
  warranty_ends_at timestamptz,
  invoice_number text not null default '',
  payment_status text not null default 'Pendiente',
  services text[] not null default '{}',
  reported_issue text not null default '',
  visual_items text[] not null default '{}',
  entry_date_text text not null default '',
  delivery_time text not null default '',
  delivery_unit text not null default '',
  warranty_offered text not null default '',
  price text not null default '',
  unlock_code text not null default '',
  unlock_password text not null default '',
  unlock_pattern text not null default '',
  terms text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table beim_receipts add column if not exists price text not null default '';
alter table beim_receipts add column if not exists repair_status text not null default 'Ingresado';
alter table beim_receipts add column if not exists imei_serial text not null default '';
alter table beim_receipts add column if not exists assigned_technician_id uuid references users(id) on delete set null;
alter table beim_receipts add column if not exists diagnostic_notes text not null default '';
alter table beim_receipts add column if not exists quote_status text not null default 'Borrador';
alter table beim_receipts add column if not exists quote_total numeric(12,2) not null default 0;
alter table beim_receipts add column if not exists quote_sent_at timestamptz;
alter table beim_receipts add column if not exists quote_approved_at timestamptz;
alter table beim_receipts add column if not exists qa_status text not null default 'Pendiente';
alter table beim_receipts add column if not exists qa_completed_at timestamptz;
alter table beim_receipts add column if not exists warranty_starts_at timestamptz;
alter table beim_receipts add column if not exists warranty_ends_at timestamptz;
alter table beim_receipts add column if not exists invoice_number text not null default '';
alter table beim_receipts add column if not exists payment_status text not null default 'Pendiente';

select setval(
  'beim_receipt_number_seq',
  greatest(coalesce((select max(receipt_number) from beim_receipts), 1000), 1000),
  (select max(receipt_number) is not null from beim_receipts)
);

create table if not exists order_items (
  id bigserial primary key,
  order_id text not null references orders(id) on delete cascade,
  product_id text references products(id) on delete set null,
  product_code integer,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  currency text not null default 'UYU' check (currency in ('UYU', 'USD', 'USDT'))
);

alter table order_items add column if not exists product_code integer;

create table if not exists beim_receipt_parts (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references beim_receipts(id) on delete cascade,
  product_id text references products(id) on delete set null,
  quantity integer not null check (quantity > 0),
  unit_cost numeric(12,2) not null default 0,
  unit_price numeric(12,2) not null default 0,
  warranty_days integer not null default 30,
  supplier_name text not null default '',
  stock_decremented boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists beim_receipt_payments (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references beim_receipts(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'UYU',
  method text not null,
  reference text not null default '',
  notes text not null default '',
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists beim_receipt_checklists (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references beim_receipts(id) on delete cascade,
  checklist_type text not null,
  status text not null default 'Pendiente',
  checks jsonb not null default '[]'::jsonb,
  notes text not null default '',
  completed_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigserial primary key,
  actor_user_id uuid references users(id) on delete set null,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_users_role on users(role);
create index if not exists idx_users_approval on users(is_approved);
create index if not exists idx_products_category on products(category_id);
create index if not exists idx_products_type on products(product_type);
create index if not exists idx_products_min_stock on products(min_stock);
create index if not exists idx_orders_user on orders(user_id);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_beim_receipts_number on beim_receipts(receipt_number);
create index if not exists idx_beim_receipts_status on beim_receipts(repair_status);
create index if not exists idx_beim_receipts_client_name on beim_receipts(lower(client_name));
create index if not exists idx_beim_receipts_client_id on beim_receipts(lower(client_id));
create index if not exists idx_beim_receipts_device_model on beim_receipts(lower(device_model));
create index if not exists idx_beim_receipts_imei_serial on beim_receipts(lower(imei_serial));
create index if not exists idx_beim_receipts_technician on beim_receipts(assigned_technician_id);
create index if not exists idx_beim_receipts_quote_status on beim_receipts(quote_status);
create index if not exists idx_beim_receipt_parts_receipt on beim_receipt_parts(receipt_id);
create index if not exists idx_beim_receipt_payments_receipt on beim_receipt_payments(receipt_id);
create index if not exists idx_beim_receipt_payments_created_by on beim_receipt_payments(created_by);
create index if not exists idx_beim_receipt_payments_created_at on beim_receipt_payments(created_at desc);
create index if not exists idx_beim_receipt_checklists_receipt on beim_receipt_checklists(receipt_id);

create table if not exists beim_fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  expense_month text not null,
  category_name text not null,
  amount numeric(12,2) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_beim_fixed_expenses_month on beim_fixed_expenses(expense_month);
create index if not exists idx_audit_logs_created_at on audit_logs(created_at desc);

create table if not exists gestion_cash_sessions (
  id uuid primary key default gen_random_uuid(), business_date date not null unique,
  opening_amount numeric(12,2) not null default 0, expected_amount numeric(12,2) not null default 0,
  counted_amount numeric(12,2), difference numeric(12,2) not null default 0,
  status text not null default 'open', notes text not null default '', opened_at timestamptz not null default now(),
  closed_at timestamptz, updated_at timestamptz not null default now()
);

create table if not exists gestion_financial_state (
  singleton_id smallint primary key check (singleton_id = 1),
  capital_initial numeric(14,2) not null default 0,
  expenses jsonb not null default '[]'::jsonb,
  menu_items jsonb not null default '[]'::jsonb,
  accounting_state jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists gestion_payment_movements (
  id bigserial primary key,
  receipt_id uuid not null references beim_receipts(id) on delete cascade,
  amount numeric(14,2) not null,
  payment_status text not null default '', method text not null default '',
  business_date date not null, created_at timestamptz not null default now()
);

create table if not exists gestion_users (
  id uuid primary key default gen_random_uuid(), username text not null unique, name text not null default '',
  password_hash text not null, role text not null default 'vendedor', active boolean not null default true,
  last_login_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table gestion_users add column if not exists web_user_id uuid references users(id) on delete set null;
create table if not exists gestion_role_permissions (role text primary key, permissions jsonb not null default '[]'::jsonb, updated_at timestamptz not null default now());
create table if not exists gestion_web_access_tokens (token_hash text primary key, web_user_id uuid not null references users(id) on delete cascade, gestion_user_id uuid not null references gestion_users(id) on delete cascade, expires_at timestamptz not null, created_at timestamptz not null default now());
