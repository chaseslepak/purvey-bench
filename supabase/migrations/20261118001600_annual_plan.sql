-- Brokers choose monthly ($100/month) or annual ($300/year, 75% off) and pay
-- before building their listing. The plan is recorded from Stripe's price.
alter table public.subscriptions add column if not exists plan text check (plan is null or plan in ('monthly','annual'));
