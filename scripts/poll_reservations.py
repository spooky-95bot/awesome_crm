#!/usr/bin/env python3
"""Script de polling des réservations ELYSENCE.

Interroge le endpoint poll du site (Cloudflare Pages), récupère les demandes
en attente, les envoie au CRM awesome_crm (web-to-lead), puis les marque comme
traitées. En cas d'échec du CRM, la demande reste en file (pas de perte).
"""
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path

# Configuration
# SITE_URL est lu depuis la variable d'environnement SITE_URL ou le fichier site-config.json
# (à la racine du projet Elysence). Valeur par défaut : URL actuelle pages.dev.
def _load_site_url() -> str:
    import os
    env_url = os.environ.get("SITE_URL")
    if env_url:
        return env_url.rstrip("/")
    config_path = "/home/ubuntu/atelier-runtime/projects/elysence-premiere/site-config.json"
    try:
        with open(config_path) as f:
            return json.load(f)["siteUrl"].rstrip("/")
    except Exception:
        return "https://elysence-premiere.pages.dev"

SITE_URL = _load_site_url()
POLL_URL = f"{SITE_URL}/api/reservations"
MARK_URL = f"{SITE_URL}/api/reservations/mark"
CRM_URL = "http://127.0.0.1:3100/api/v1/public/lead-forms/pk_uzqC4YKDXrthKtFx2pkkGjBML637HJka/submit"
SECRET_FILE = Path("/home/ubuntu/awesome_crm/.reservation-secret")
TIMEOUT = 10
# User-Agent explicite : le défaut Python-urllib est bloqué (403) par Cloudflare.
USER_AGENT = "ElysenceReservationPoller/1.0"


def load_secret() -> str:
    return SECRET_FILE.read_text().strip()


def fetch_pending_reservations(secret: str) -> list:
    """Récupère les réservations en attente depuis le site."""
    url = f"{POLL_URL}?secret={secret}"
    req = urllib.request.Request(url, method="GET", headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            data = json.loads(resp.read().decode())
            if data.get("success"):
                return data.get("data", [])
    except Exception as e:
        print(f"ERREUR_POLL: {e}", file=sys.stderr)
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


def mark_reservation(secret: str, reservation_id: str, status: str) -> bool:
    """Marque une réservation comme traitée dans le KV."""
    payload = json.dumps({"id": reservation_id, "status": status}).encode()
    req = urllib.request.Request(
        MARK_URL,
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
    secret = load_secret()

    # 1) Traiter les demandes de réservation en attente
    reservations = fetch_pending_reservations(secret)

    if reservations:
        print(f"{len(reservations)} réservation(s) en attente")
        for r in reservations:
            rid = r.get("id", "?")
            print(f"  → Traitement {rid} ({r.get('firstName', '')} {r.get('lastName', '')})")

            if send_to_crm(r):
                if mark_reservation(secret, rid, "processed"):
                    print(f"    ✓ Traitée et envoyée au CRM")
                else:
                    print(f"    ✗ Envoyée au CRM mais marquage échoué (reste en file)", file=sys.stderr)
            else:
                print(f"    ✗ Échec CRM → reste en file", file=sys.stderr)

    # 2) Traiter la file d'e-mails sortants (même cycle, aucun timer supplémentaire)
    process_mail_outbox(secret)

    return 0


def process_mail_outbox(secret: str) -> None:
    """Déclenche le traitement de la file e-mail du CRM. Ne journalise aucun secret."""
    payload = json.dumps({}).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:3100/api/v1/mail/process-outbox",
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
            summary = (result.get("data") or {})
            if summary:
                parts = ", ".join(f"{k}={v}" for k, v in sorted(summary.items()))
                print(f"  ✉ File e-mail traitée : {parts}")
    except urllib.error.HTTPError as e:
        # 404/403 = endpoint indisponible : on sort proprement, sans boucle.
        if e.code not in (403, 404):
            print(f"  ✉ File e-mail : HTTP {e.code}", file=sys.stderr)
    except Exception as e:
        print(f"  ✉ File e-mail : {type(e).__name__}", file=sys.stderr)


if __name__ == "__main__":
    sys.exit(main())
