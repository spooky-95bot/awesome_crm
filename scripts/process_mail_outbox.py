#!/usr/bin/env python3
"""Script de traitement de la file e-mail sortante (outbox) ELYSENCE.

Déclenché par un timer systemd indépendant (elysence-mail-outbox.timer) toutes
les minutes. Appelle l'endpoint du CRM local qui se charge de l'envoi réel.

Ne journalise aucun secret. L'endpoint CRM gère lui-même les protections
contre les doublons et les envois multiples.
"""
import json
import sys
import urllib.request
import urllib.error
from pathlib import Path

# Configuration
SECRET_FILE = Path("/home/ubuntu/awesome_crm/.reservation-secret")
CRM_OUTBOX_URL = "http://127.0.0.1:3100/api/v1/mail/process-outbox"
TIMEOUT = 10
USER_AGENT = "ElysenceMailOutbox/1.0"


def load_secret(path: Path) -> str:
    try:
        return path.read_text().strip()
    except Exception:
        return ""


def process_mail_outbox(secret: str) -> None:
    """Déclenche le traitement de la file e-mail du CRM. Ne journalise aucun secret."""
    payload = json.dumps({}).encode()
    req = urllib.request.Request(
        CRM_OUTBOX_URL,
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


def main() -> int:
    secret = load_secret(SECRET_FILE)
    if not secret:
        print("ERREUR_MAIL: secret absent", file=sys.stderr)
        return 1
    process_mail_outbox(secret)
    return 0


if __name__ == "__main__":
    sys.exit(main())
