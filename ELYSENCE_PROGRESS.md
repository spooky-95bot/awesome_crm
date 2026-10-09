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

### Décisions prises
- Pipeline de publication existant uniquement (`deployMissionWorkspace`), aucun second mécanisme
- Wrangler non appelé directement (passe par le pipeline)
- Secret stocké dans `/home/ubuntu/awesome_crm/.reservation-secret` (600, gitignoré)

---

## Lots suivants (à faire)
- Lot 2 : pages légales (mentions, RGPD, CGV), bandeau cookies, page 404
- Lot 3 : galerie photos, FAQ complète, témoignages (section prête à remplir)
- Lot 4 : SEO (sitemap, robots, données structurées), accessibilité, performance
- Lot 5 : parcours complet cliente + facture PDF, nettoyage final
