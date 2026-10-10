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

---

## Lot 4 : SEO, données structurées, accessibilité, performance — ✅ TERMINÉ

### Réalisé
- **JSON-LD BeautySalon enrichi** : `@id`, image, `priceRange` réel (40–89 €), `currenciesAccepted`,
  `hasOfferCatalog` avec les **7 prestations et tarifs réels**
- **JSON-LD FAQPage** : les 10 questions/réponses de la FAQ (éligible aux résultats enrichis)
- **JSON-LD WebPage** sur les 3 pages légales
- **Accessibilité** : skip-link (« Aller au contenu principal »), `main#main`, `aria-expanded`
  + `aria-controls` sur le menu mobile, fermeture par Échap avec retour de focus,
  focus visible renforcé (3 px or), `prefers-reduced-motion`
- **Performance** : images 6,5 Mo → 621 Ko (−91 %), `loading="lazy"`, `decoding="async"`,
  `width`/`height` sur les 14 images (évite le décalage de mise en page), preload des 2 polices principales
- **SEO technique** : title, description, canonical, OG, Twitter, robots, favicon, lang=fr, h1 unique
- **URLs canoniques** : liens internes et canonical harmonisés vers `/mentions-legales` (sans `.html`)
  → plus de redirection 308

### Preuves en production
- 2 blocs JSON-LD valides (BeautySalon 7 offres, FAQPage 10 Q/R)
- 6 pages en **200**, route inexistante en **404**, **0 lien interne cassé**
- Skip-link visible au focus, menu mobile `aria-expanded` true/false vérifié au navigateur
- 0 overflow horizontal en 390 px
- Structure HTML : 0 erreur sur les 5 pages

---

## Lot 5 : Parcours complet, réservation/CRM, validation finale — ✅ TERMINÉ

### Preuves (parcours réel, mobile 390 px)
1. Découverte → h1 « L'art du rituel pour elle comme pour lui. »
2. Tarifs → 7 prestations affichées
3. Galerie → 3 images chargées (lazy vérifié après scroll)
4. FAQ → ouverture/fermeture fonctionnelle
5. Réservation → formulaire soumis → message de confirmation affiché
6. CRM → lead créé (`NEW`), poller : « ✓ Traitée et envoyée au CRM »
7. Facture PDF → 200, `%PDF-`, contenu vérifié

### Correction majeure (signalée par la cliente)
**Les prix affichés sont TTC.** Le moteur de facturation les traitait comme HT et ajoutait
20 % par-dessus (69 € → 82,80 €). Corrigé : `calcTotalsFromGross` extrait la TVA du montant.
- Vérifié : prix affiché **69 €** → total **69 €**, dont TVA 11,50 €, base HT 57,50 €
- Comportement HT historique préservé (défaut `pricesIncludeTax=false`) : 100 HT → 120 TTC
- PDF : affiche « Total / dont TVA / Base hors taxe » quand TTC

### État final
- **139 tests** passent (22 suites), `tsc` propre
- Base nettoyée : 0 lead, 0 facture, 0 e-mail en file
- `MAIL_DRIVER=simulated` inchangé

### Reste bloquant (nécessite votre intervention)
1. **Identifiants SMTP** + autorisation d'envoi réel → le déclencheur « confirmation à la cliente »
   est prêt mais n'est pas branché (aucun e-mail réel envoyé).
2. **Informations légales** : SIRET, adresse, forme juridique, téléphone, horaires,
   médiateur, TVA applicable (champs « à compléter » en place).
3. **Domaine propre** : le site est sur `pages.dev` ; un domaine personnalisé améliorerait le SEO.

### Déclencheur métier non branché (documenté, aucun envoi)
Quand un rendez-vous est validé dans le CRM, il faudra appeler
`MailService.enqueue({ template:'reservation.confirmed', idempotencyKey:'<resaId>:confirmed', tenantId:'elysence' })`.
Le socle (file, idempotence, reprises, journal) est prêt ; il manque uniquement le transport réel.

---

## Intégration Resend — ✅ TERMINÉE (commit 4e74c71)

### Fichiers modifiés
- `backend/src/modules/integrations/mail/providers/resend-mail.provider.ts` (nouveau)
- `backend/src/modules/integrations/mail/providers/resend-mail.provider.spec.ts` (nouveau, 13 tests)
- `backend/src/modules/integrations/integrations.module.ts` (enregistrement + sélection MAIL_DRIVER)
- `backend/.env.example` (documentation variables RESEND_*)
- Traduction turc → français dans 20 fichiers du module integrations (règle zéro turc)

### Architecture
- `ResendMailProvider` implémente `IMailProvider` (DIP préservée)
- Utilise `fetch` directement (l'interface `IHttpClient` ne retourne que `{status}`, Resend nécessite le corps)
- `MAIL_DRIVER=resend` active le provider ; défaut = `simulated` (inchangé)
- `RESEND_API_KEY` + `RESEND_FROM` requis ; sans eux, aucune erreur silencieuse — exception explicite
- File d'attente, idempotence, backoff, isolation tenant : tous préservés (MailService inchangé)

### Tests
- 13 tests Resend : succès, erreurs API (400/429/500), timeout, absence fuite clé API, absence filigrane
- 152 tests totaux passent (23 suites)
- `tsc --noEmit` propre

### Absence de filigrane — vérifié
- **Fait documenté** : Resend n'ajoute aucun watermark ni branding sur le plan Free (sources : Sequenzy, Dreamlit.ai)
- **Test automatisé** : le texte de l'e-mail ne contient ni "resend", ni "sent with", ni "powered by", ni "unsubscribe"
- **Condition** : utiliser un domaine vérifié (pas `resend.dev`) pour un rendu professionnel complet

### État production
- `MAIL_DRIVER` non défini → `simulated` (aucun e-mail réel)
- Aucune variable `RESEND_*` dans `.env`
- `EmailLog` vide (0 e-mail envoyé)
- Aucun e-mail réel envoyé pendant les tests

### Actions manuelles requises pour activer l'envoi réel
1. Créer un compte Resend (gratuit)
2. Vérifier un domaine (SPF, DKIM, DMARC) — ou utiliser `resend.dev` pour tester
3. Générer une API key
4. Ajouter dans `.env` : `RESEND_API_KEY=re_xxx`, `RESEND_FROM="Maison ELYSENCE <maison@elysence.fr>"`, `MAIL_DRIVER=resend`
5. Redémarrer le backend
6. Le déclencheur métier (confirmation réservation) reste à brancher côté CRM
