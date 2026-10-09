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

## Lot 3 : Galerie, FAQ, témoignages — ✅ TERMINÉ (e-mail en attente de SMTP)

### Inspection préalable
- Module mail du CRM existant : `MAIL_DRIVER=simulated` → **aucun e-mail réellement envoyé aujourd'hui**
- Providers présents : `simulated` et `smtp` (SMTP_HOST/PORT/SECURE/USER/PASS/FROM)
- Images : 3 vraies photos de massage (4000×6000, 1,7–2,8 Mo) ; 2 jpeg = visuels marketing (affiche tarifs, livre fondateur) → **non utilisés** (ce ne sont pas des photos de lieu)

### Réalisé
- **Images optimisées** : 6,5 Mo → 621 Ko (−91 %), 1600 px + vignettes 800 px
- **Galerie** `#galerie` : 3 photos légendées (vérifiées par analyse visuelle, pas d'invention), `loading="lazy"`, `alt` descriptifs
- **FAQ complète** : 4 → 10 questions (réservation, délai, grossesse, allergies, annulation, cartes cadeaux, paiement)
- **Témoignages** `#avis` : section **prête à remplir**, aucun avis inventé, lien mailto pour recueillir les avis
- Lien « Galerie » ajouté à la navigation

### Preuves (production)
- Images : HTTP 200 (243/243/133 Ko), chargées au navigateur 390 px
- Sections `galerie`/`avis`/`tarifs` présentes ; 10 `<details>` ; 3 `<figure>` ; placeholder témoignage présent
- HTML valide : **0 erreur** de structure (parseur), 0 image sans `alt`, 0 id dupliqué, 0 lien cassé
- 0 overflow horizontal en 390 px
- Non-régression : `POST /api/reservations` → **200**
- Données de test supprimées (CRM + KV)

### ⚠️ Blocage e-mail (champ à fournir)
L'e-mail de confirmation cliente **nécessite un SMTP**. Aujourd'hui `MAIL_DRIVER=simulated` : rien n'est envoyé.
**Champs manquants à fournir** (backend/.env) :
- `MAIL_DRIVER=smtp`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`
- `SMTP_USER`, `SMTP_PASS`
- `SMTP_FROM`

Solution gratuite recommandée : un compte SMTP gratuit (Brevo 300 mails/jour, ou Gmail avec mot de passe d'application). Dès que ces valeurs sont fournies, l'envoi de confirmation est immédiatement opérationnel (module déjà en place).

---

## Lots suivants (à faire)
- Lot 3b : e-mail de confirmation cliente (en attente des champs SMTP ci-dessus)
- Lot 4 : SEO (sitemap, robots, données structurées), accessibilité, performance
- Lot 5 : parcours complet cliente + facture PDF, nettoyage final

---

## Messagerie (orientation A validée) — moteur souverain, transport interchangeable

### Réalisé et prouvé
1. **Modèles transactionnels** (`c94fec4`) : `reservation.confirmed/cancelled/updated/received/admin`.
   Français, EUR, libellés de repli. 8 tests.
2. **File persistante** (`76de0eb`) : table `EmailOutbox` (statut, tentatives, `maxAttempts`,
   `nextAttemptAt`, `idempotencyKey` unique, `tenantId`, `driver`, `sentAt`).
   Migration appliquée (non destructive). `enqueue/deliver/claimDue/processDue`.
   Recul exponentiel 1 min → 4 h, `DEAD` après épuisement. 15 tests.
   Traduction de 63 commentaires turcs de `schema.prisma`.
3. **Worker** : endpoint `POST /mail/process-outbox` (secret partagé, `@SkipThrottle`),
   intégré au poller systemd **existant** — aucun nouveau timer.

### Preuves en conditions réelles
- Sans/mauvais secret → **403** ; bon secret → **200** et réponse plate
- 2 messages en file → traités → `SIMULATED=2`, **0 `SENT`** (simulé jamais confondu)
- Doublon (même `idempotencyKey`) → rejeté par contrainte unique PostgreSQL
- Échec puis reprise → `FAILED` → retry → `SIMULATED`, tentatives incrémentées
- 2ᵉ passage → **aucun renvoi** (EmailLog inchangé)
- Intégration via le poller : `✉ File e-mail traitée : SIMULATED=1`
- Suite complète : **135 tests**, tsc propre, aucune régression

### État
- `MAIL_DRIVER=simulated` **inchangé** — aucun e-mail réel envoyé
- Secret `POLL_SECRET` dans `.env` (gitignoré, non versionné)
- Données de test supprimées (EmailOutbox et EmailLog vides)

### Reste (nécessite votre intervention)
- Fournir les identifiants SMTP (`MAIL_DRIVER=smtp`, `SMTP_HOST/PORT/SECURE/USER/PASS/FROM`)
  puis **autoriser explicitement un envoi réel** pour passer de `SIMULATED` à `SENT`.
- Étape 7 (supervision/alerte sur `FAILED` ou file stagnante) non implémentée.
- Branchement des déclencheurs métier (confirmation à la validation d'un rendez-vous CRM)
  à faire quand le transport réel sera validé.
