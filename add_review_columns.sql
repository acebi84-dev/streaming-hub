-- Review (yorum) özelliği için review sütunları
-- Supabase SQL Editor'de çalıştır.

alter table public.watchlist
  add column if not exists review text;

alter table public.activity_feed
  add column if not exists review text;
