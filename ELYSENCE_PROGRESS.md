# ELYSENCE_PROGRESS.md

## Lot 1 : Réservation fiable (SANS tunnel) — ✅ TERMINÉ

### ❌ Impasses à NE PLUS réessayer
- **localtunnel** : sous-domaine non garanti, instable
- **serveo** : ne transmet pas le trafic (redirige vers sa page d'accueil)
- **localhost.run** : HTTP 000, mort
- **bore** : binaire non installable proprement
- **Tunnel nommé Cloudflare sans zone DNS** : pas d'URL publique
- **trycloudflare / quick tunnel** : URL change à chaque redémarrage
- **Service systemd elysence-crm-tunnel** : supprimé (créé pour rien)
- **Tunnel Cloudflare nommé « elysence-crm »** : supprimé via API

### ✅ Solution retenue et prouvée
1. **Pages Function** `/api/reservations` (POST = créer, GET = poll protégé par secret)
   - Stockage KV `elysence-reservations` (id `18733502aefd4324bead333d3040c8ef`)
   - Binding `RESERVATIONS` + secret `POLL_SECRET` configurés (prod + preview)
2. **Poller VM** `scripts/poll_reservations.py` + `elysence-poll.timer` (1 min, `enabled` au boot)
   - User-Agent explicite `ElysenceReservationPoller/1.0` (Python-urllib était bloqué 403)
3. **Formulaire** pointe vers `/api/reservations`

### Preuves
- POST production → 200 + UUID ; GET sans secret → 401
- Réservation → CRM (`Test LOT1`, statut NEW) : arrivée 1 fois
- CRM coupé → réservation créée → poller échoue → reste en file
- CRM relancé → demande livrée → 2ᵉ passage vide (0 doublon, vérifié en base)
- Timer `enabled`, `OnBootSec=1min`, redémarrage timer OK
- Données de test supprimées (CRM + KV vides)

### Re-vérification du 2026-10-09 (reprise de mission)
- Site prod : `API_URL='/api/reservations'` (tunnel mort retiré), POST → 200, GET sans secret → 401
- **Parcours formulaire réel testé au navigateur (390 px)** : saisie → clic → message de succès affiché
- Réservation issue du formulaire réel → poller → CRM (`Cliente Formulaire`, statut NEW, tél. conservé)
- 0 doublon (2 UUID distincts = 2 leads distincts), KV et CRM nettoyés après test
- Dépôt : `master`, arbre propre, HEAD `675f203`, aucun fichier non suivi
- Providers : RAM 18 Go dispo, disque 12 Go libres — aucun quota bloquant

### Décisions prises
- Pipeline de publication existant uniquement (`deployMissionWorkspace`), aucun second mécanisme
- Wrangler non appelé directement (passe par le pipeline)
- Secret stocké dans `/home/ubuntu/awesome_crm/.reservation-secret` (600, gitignoré)

---

## Lot 2 : Pages légales + 404 + tiers — ✅ TERMINÉ

### Inspection préalable
- Seul service tiers : **Google Fonts** (transfert d'IP à Google → non conforme RGPD France)
- **Aucun cookie, localStorage, analytics** → bannière de consentement **non nécessaire** (pas de bannière artificielle posée)

### Réalisé
- **Polices auto-hébergées** : 16 woff2 (latin + latin-ext) dans `assets/fonts/`, CSS local. Zéro référence Google.
- `mentions-legales.html` — éditeur, hébergement, propriété intellectuelle, activité réglementée
- `confidentialite.html` — RGPD : données, finalités, destinataires, durées (7 j / relation / 10 ans), droits, CNIL, cookies
- `cgv.html` — 12 articles (réservation, annulation, paiement, cartes cadeaux, rétractation, médiation)
- `404.html` — page personnalisée, `noindex`
- Footer du site : liens légaux ajoutés ; favicon créé ; sitemap mis à jour

### Champs « à compléter » laissés volontairement (aucune invention)
- Identité juridique : forme, adresse siège, SIRET, TVA, responsable de publication, téléphone
- Hébergeur : coordonnées exactes à confirmer
- TVA applicable, délais d'annulation, moyens de paiement, cartes cadeaux, médiateur

### Preuves (production)
- `mentions-legales.html`, `confidentialite.html`, `cgv.html` → **HTTP 200**
- Route inexistante → **HTTP 404** avec la page Elysence (titre, texte, bouton vérifiés)
- Polices : `fonts.css` 200, woff2 200, favicon 200
- **Zéro domaine tiers** (hors propre domaine + schema.org), **zéro cookie**, aucun `set-cookie`
- Non-régression réservation : `POST /api/reservations` → **200**
- Rendu 390 px : footer + pages + 404 vérifiés au navigateur

---

## Lots suivants (à faire)
- Lot 3 : galerie photos, FAQ complète, témoignages (section prête à remplir), e-mail de confirmation cliente
- Lot 4 : SEO (sitemap, robots, données structurées), accessibilité, performance
- Lot 5 : parcours complet cliente + facture PDF, nettoyage final
