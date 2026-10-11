#!/usr/bin/env python3
"""Script de polling des réservations ELYSENCE.

Interroge le endpoint poll du site (Cloudflare Pages), récupère les demandes
en attente, les envoie au CRM awesome_crm (web-to-lead), puis les marque comme
traitées. En cas d'échec du CRM, la demande reste en file (pas de perte).

Traite deux sources, chacune avec son propre secret :
  - production  (siteUrl)    → .reservation-secret
  - prévisualisation (previewUrl) → .preview-reservation-secret
"""
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path

# Configuration
# SITE_URL est lu depuis la variable d'environnement SITE_URL ou le fichier site-config.json
# (à la racine du projet Elysence). Valeur par défaut : URL actuelle pages.dev.
def _load_config() -> dict:
    import os
    config_path = "/home/ubuntu/atelier-runtime/projects/elysence-premiere/site-config.json"
    cfg = {}
    try:
        with open(config_path) as f:
            cfg = json.load(f)
    except Exception:
        pass
    env_url = os.environ.get("SITE_URL")
    cfg["siteUrl"] = (env_url or cfg.get("siteUrl") or "https://elysence-premiere.pages.dev").rstrip("/")
    cfg.setdefault("previewUrl", "")
    return cfg


CONFIG = _load_config()
SITE_URL = CONFIG["siteUrl"]
CRM_URL = "http://127.0.0.1:3100/api/v1/public/lead-forms/pk_uzqC4YKDXrthKtFx2pkkGjBML637HJka/submit"
SECRET_FILE = Path("/home/ubuntu/awesome_crm/.reservation-secret")
PREVIEW_SECRET_FILE = Path("/home/ubuntu/awesome_crm/.preview-reservation-secret")
TIMEOUT = 10
# User-Agent explicite : le défaut Python-urllib est bloqué (403) par Cloudflare.
USER_AGENT = "ElysenceReservationPoller/1.0"


def load_secret(path: Path) -> str:
    try:
        return path.read_text().strip()
    except Exception:
        return ""


def fetch_pending_reservations(secret: str, base_url: str) -> list:
    """Récupère les réservations en attente depuis un site donné.

    Le secret voyage en en-tête (jamais dans l'URL : les query strings sont
    journalisées par Cloudflare). Le repli ?secret= reste accepté par les
    fonctions le temps de la migration, mais n'est plus utilisé ici.
    """
    url = f"{base_url}/api/reservations"
    req = urllib.request.Request(
        url,
        method="GET",
        headers={
            "User-Agent": USER_AGENT,
            "Authorization": f"Bearer {secret}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            data = json.loads(resp.read().decode())
            if data.get("success"):
                return data.get("data", [])
    except urllib.error.HTTPError as e:
        # Ne jamais journaliser le secret ni l'URL complète.
        print(f"ERREUR_POLL [{base_url}]: HTTP {e.code}", file=sys.stderr)
    except Exception as e:
        print(f"ERREUR_POLL [{base_url}]: {type(e).__name__}", file=sys.stderr)
    return []


def send_to_crm(reservation: dict) -> bool:
    """Envoie une réservation au CRM (web-to-lead). Retourne True si succès."""
    payload = {
        "firstName": reservation.get("firstName", ""),
        "lastName": reservation.get("lastName", ""),
        "email": reservation.get("email", ""),
        "phone": reservation.get("phone", ""),
        "service": reservation.get("service", ""),
        "message": reservation.get("message", ""),
        "address": reservation.get("address", ""),
        "date": reservation.get("date", ""),
        "timeSlot": reservation.get("timeSlot", ""),
    }
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        CRM_URL,
        data=data,
        headers={"Content-Type": "application/json", "User-Agent": USER_AGENT},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            result = json.loads(resp.read().decode())
            if resp.status == 200 and result.get("success"):
                return True
            print(f"ECHEC_CRM: {result.get('error', 'inconnu')}", file=sys.stderr)
    except urllib.error.HTTPError as e:
        print(f"ECHEC_CRM_HTTP {e.code}: {e.read().decode()[:200]}", file=sys.stderr)
    except Exception as e:
        print(f"ECHEC_CRM: {e}", file=sys.stderr)
    return False


def mark_reservation(secret: str, reservation_id: str, status: str, base_url: str) -> bool:
    """Marque une réservation comme traitée dans le KV du site concerné."""
    payload = json.dumps({"id": reservation_id, "status": status}).encode()
    req = urllib.request.Request(
        f"{base_url}/api/reservations/mark",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {secret}",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            result = json.loads(resp.read().decode())
            return result.get("success", False)
    except Exception as e:
        print(f"ERREUR_MARK: {e}", file=sys.stderr)
    return False


def main():
    # 1) Traiter les sources (production puis prévisualisation)
    sources = [(SITE_URL, SECRET_FILE, "production")]
    preview_url = CONFIG.get("previewUrl")
    if preview_url:
        sources.append((preview_url, PREVIEW_SECRET_FILE, "prévisualisation"))

    for base_url, secret_path, label in sources:
        secret = load_secret(secret_path)
        if not secret:
            continue
        reservations = fetch_pending_reservations(secret, base_url)

        if reservations:
            print(f"[{label}] {len(reservations)} réservation(s) en attente")
            for r in reservations:
                rid = r.get("id", "?")
                print(f"  → Traitement {rid} ({r.get('firstName', '')} {r.get('lastName', '')})")

                if send_to_crm(r):
                    if mark_reservation(secret, rid, "processed", base_url):
                        print(f"    ✓ Traitée et envoyée au CRM")
                    else:
                        print(f"    ✗ Envoyée au CRM mais marquage échoué (reste en file)", file=sys.stderr)
                else:
                    print(f"    ✗ Échec CRM → reste en file", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
