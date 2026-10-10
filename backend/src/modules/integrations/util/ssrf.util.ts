// src/modules/integrations/util/ssrf.util.ts
// Protection SSRF : l'URL cible du webhook doit être HTTPS + un hôte externe (public).
// POST interdit vers les IP internes/privées (loopback, link-local, plages privées, metadata).
//
// LIMITE PRAGMATIQUE : la résolution hostname → IP (contrôle DNS rebinding) n'est pas faite ici ;
// les IP littérales et les noms d'hôte internes connus sont bloqués. La solution complète serait un dispatch
// öncesi DNS lookup + IP kontrolü gerektirir (ileride eklenebilir).

export interface SsrfOptions {
  // Test/auto-hébergement : réseau privé + http autorisé (désactivé par défaut).
  allowPrivate?: boolean;
}

function isPrivateIPv4(ip: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local + cloud metadata 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  return false;
}

function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) {
    return true;
  }
  if (
    h === '::1' ||
    h.startsWith('fc') ||
    h.startsWith('fd') ||
    h.startsWith('fe80')
  ) {
    return true; // IPv6 loopback / ULA / link-local
  }
  return isPrivateIPv4(h);
}

export function isSafeWebhookUrl(url: string, opts: SsrfOptions = {}): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (opts.allowPrivate) {
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  }
  // HTTPS uniquement.
  if (parsed.protocol !== 'https:') {
    return false;
  }
  // Blocage des hôtes internes/privés.
  if (isPrivateHost(parsed.hostname)) {
    return false;
  }
  return true;
}
