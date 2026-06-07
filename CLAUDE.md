# ZORUNLU KURALLAR

## ASLA YAPMA — HİÇBİR KOŞULDA
- eas build komutu çalıştırma

## ONAY GEREKİR — AÇIK İZİN OLMADAN YAPMA
- `eas update` ile **production** branch/channel'a OTA gönderme. Production'a OTA SADECE kullanıcının o an verdiği açık onayla yapılır. (Varsayılan: preview.)

## SERBESTÇE YAP — ONAY GEREKMEZ
- git add, git commit, git push
- `eas update --branch preview` (sadece preview)
- GitHub Actions workflow çalıştırma
- npm install
- Supabase sorgu çalıştırma
- Dosya okuma, yazma, silme
- Her türlü kod değişiklik
