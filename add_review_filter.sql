-- Değerlendirme görünürlüğü tercihi
-- Değerler: 'everyone' (herkes) | 'following' (ben + takip ettiklerim) | 'both' (ben + takipçiler + takip ettiklerim)
-- Supabase SQL Editor'de çalıştır. ÖNCE bunu çalıştır, yoksa profil kaydetme hata verir.

alter table public.profiles
  add column if not exists review_filter text not null default 'everyone';
