# İzlio — Sosyal Özellik Yol Haritası

Her tur **ayrı** yapılır. Bir tur tamamlanıp OTA preview'e gönderilmeden sonrakine geçilmez.
Veri katmanı (RLS/view'ler) hazır: `public_profiles` view, `watchlist`/`activity_feed` açık SELECT, `follows`.

---

## Tur 1 — Başkasının profilini açma ✅ TAMAMLANDI (OTA preview)
**Amaç:** Kullanıcı adı/avatarı görünen HER yer tıklanabilir olsun, o kişinin profil ekranını açsın.

- `WatchlistScreen`'e `targetUser` prop'u: dolu = başkasının profili, null = kendi profili (mevcut davranış aynen).
- Başkasının profilinde: profil/watchlist/takipçi-takip o kişiden yüklenir; **Ara sekmesi gizli**; kişi kartında **Takip Et / Takip Ediliyor** butonu; düzenleme vb. yok.
- **Aktivite Akışı** başkasının profilinde o kişinin aktiviteleri (`user_id=eq.<target>`); kendi profilinde takip akışı kalır.
- Tıklanabilirlik: takipçi/takip PersonRow'ları, Ara sonuçları, akıştaki aktör ad/avatarı (profil + ana ekran akışı).
- Navigasyon: mevcut App.js ekran paterni; profil→profil için basit stack (navStack benzeri), geri dönüş çalışır.
- Kendi profiline giden yollar (alt bar vb.) aynen kalır.
- Kural: veri katmanı değişmez, yeni paket yok.

## Tur 2 — Detay ekranında sosyal kanıt ✓ TAMAMLANDI (OTA preview)
- DetailModal'da içeriğe dair "3 arkadaşın izledi · ort 7.3" satırı + arkadaş avatarları.
- Takip edilenlerin `activity_feed`/`watchlist` verisinden hesaplanır.

## Tur 3 — Profil paylaşımı ✓ TAMAMLANDI (OTA preview + landing prod)
- `izlio.app/u/<username>` landing + OG kartı (api/u.js, Tur-0 landing paternine benzer).
- Profil ekranına "Paylaş" butonu → bu linki paylaşır.

## Tur 4 — Keşfedilecek kişiler ✓ TAMAMLANDI (OTA preview)
- Ara sekmesi boş durumu + onboarding sonu ara ekranı: "en aktif kullanıcılar" önerileri.
- Aktiflik son 30 gün `activity_feed` sayımından (istemci tarafı); <3 ise fallback = en yeni kayıtlı kullanıcılar.
- **İleri iş:** ölçek büyüyünce istemci sayımı (300 satır çekip JS'te sayma) bir SQL view veya RPC'ye taşınmalı (ör. `most_active_users` materialized view / `rpc.suggested_users`).

## Tur 5 — Değerlendirmeler sekmesi ✓ TAMAMLANDI (OTA preview)
- Kişi kartında o kullanıcının tüm yorumları (kendi + başkasının profilinde).
- Uzun yorum "...devamını oku" ile genişler.

## Tur 6 — Push bildirimleri — ⚙️ SUNUCU TARAFI KURULDU, APP KODU BUILD BEKLİYOR
Kapsam (v1, iki bildirim):
- **A) Anında "seni takip etti":** `follows` INSERT → Supabase DB Webhook → `app/api/push-follow.js` (Vercel) → Expo Push. Service role + `PUSH_WEBHOOK_SECRET` header doğrulaması.
- **B) Günlük yeni içerik:** GitHub Actions `hub-push-new.yml` (19:00 TR) → `scripts/hub-push-new.js` → kullanıcının seçili platformlarındaki son 24s yeni içerik; eşik <3 ise gönderme. Mesaj: en çok eklenen 2 platform.
- **C) DB:** `push_tokens` (RLS sadece sahibine) — SQL çalıştırıldı.
- **D) App.js:** `expo-notifications` + izin akışı (ilk takip / ilk NewScreen; ilk açılışta değil; red kalıcı) + token upsert/çıkışta sil + tıklama yönlendirmesi (follow→profil, new→NewScreen). **KOD YAZILDI, OTA GÖNDERİLMEDİ — production build ile aktifleşecek** (IAP/Sentry ile birlikte). Tüm çağrılar lazy-require + try/catch guard'lı.

**Açık iş / not:**
- `HUB_SUPABASE_KEY` service role mu doğrulanamadı (GitHub secret okunamaz) → workflow `HUB_SUPABASE_SERVICE_KEY` secret'ı bekliyor.
- **v1 sadece iOS push.** Android push **ileri iş**: `android.googleServicesFile` (google-services.json) eklenip EAS'e **FCM V1** credentials yüklenecek; sonra Android build'e dahil edilecek.
- Haftalık sosyal özet KALDIRILDI; **ağ canlanınca "aylık sosyal özet"** bildirimi eklenebilir (ileri iş).
- Production build runtime **1.1.0**, channel **"production"**; build sonrası production OTA SADECE açık onayla (`eas update --branch production`).
