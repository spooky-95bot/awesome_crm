// src/common/http/meta-error.ts
// Meta Graph API hata gövdesinden kullanıcıya gösterilebilir mesaj üretir.
// Meta'nın hata metni API rehberliğidir (token/PII içermez) → güvenle gösterilir.
// Sık kodlara Türkçe ipucu eklenir (190 = token süresi/dolmuş).
export function metaErrorMessage(body: string): string {
  try {
    const j = JSON.parse(body) as {
      error?: { message?: string; code?: number; error_subcode?: number };
    };
    const e = j.error;
    if (e?.message) {
      const code = e.code != null ? ` (kod ${e.code})` : '';
      let hint = '';
      if (e.code === 190) {
        hint =
          ' — Erişim token’ı geçersiz/süresi dolmuş. Yeni (tercihen uzun ömürlü / System User) token üretin.';
      } else if (e.code === 100) {
        hint = ' — Geçersiz parametre veya token bu istek için yetersiz.';
      } else if (e.code === 10 || e.code === 200 || e.code === 3) {
        hint =
          ' — İzin eksik. Token’da ads_read izni ve gerekli kimlik/erişim onayları olmalı.';
      }
      return `${e.message}${code}${hint}`;
    }
  } catch {
    /* JSON değilse ham metnin başını ver */
  }
  return body.slice(0, 160);
}
