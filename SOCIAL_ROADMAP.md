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

## Tur 2 — Detay ekranında sosyal kanıt
- DetailModal'da içeriğe dair "3 arkadaşın izledi · ort 7.3" satırı + arkadaş avatarları.
- Takip edilenlerin `activity_feed`/`watchlist` verisinden hesaplanır.

## Tur 3 — Profil paylaşımı
- `izlio.app/u/<username>` landing + OG kartı (api/u.js, Tur-0 landing paternine benzer).
- Profil ekranına "Paylaş" butonu → bu linki paylaşır.

## Tur 4 — Keşfedilecek kişiler
- Ara sekmesinde + onboarding sonunda "en aktif kullanıcılar" önerileri.
- Aktiflik `activity_feed` sayımından türetilir.

## Tur 5 — Değerlendirmeler sekmesi
- Kişi kartında o kullanıcının tüm yorumları (kendi + başkasının profilinde).
- Uzun yorum "...devamını oku" ile genişler.

## Tur 6 — Push bildirimleri (NATIVE — production build gerekir)
- `expo-notifications` native modül → OTA'ya GİTMEZ, production build'e biner.
- Yeni takipçi / arkadaş aktivitesi / değerlendirme bildirimi.
- Şimdilik sadece planda; tetiklendiğinde önce build gereksinimi netleştirilir.
