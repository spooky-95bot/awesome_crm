# Audit — Messagerie autonome pour Elysence / Atelier IA

Date : 9 octobre 2026 · Lecture seule, aucune modification de production

---

## 1. Inventaire réel de l'existant

### 1.1 CRM `/home/ubuntu/awesome_crm` — module mail

| Élément | État vérifié |
|---|---|
| Architecture | Abstraction `IMailProvider` (DIP) — `MAIL_PROVIDER` token d'injection |
| Providers | `SimulatedMailProvider` (`driver='simulated'`), `SmtpMailProvider` (`driver='smtp'`) |
| Sélection | `MAIL_DRIVER` env → `smtp` si `=smtp`, sinon simulé |
| Transport réel | `nodemailer@^6.10.1` **déjà installé** |
| Journalisation | Table `EmailLog` : `to, subject, template, status, error, createdAt` |
| Statuts | `SENT`, `FAILED`, `SIMULATED` — **distinction correcte déjà en place** |
| Templates | 3 seulement : `deal.won`, `lead.assigned`, `invoice.issued` |
| File d'attente | **Aucune** (pas de Bull/BullMQ/Redis/Agenda) |
| Anti-doublon | **Aucune clé d'idempotence** sur EmailLog |
| Multi-tenant | `EmailLog` **sans `tenantId`** (les autres modèles en ont un) |
| MailHog | Présent dans `docker-compose.yml`, **en crash-loop** (`exec format error` — image amd64 sur hôte arm64) |

**Constat clé** : `MAIL_DRIVER=simulated` → **aucun e-mail réel n'est envoyé aujourd'hui**. Le CRM est correctement câblé pour un transport réel ; il ne manque que les identifiants.

### 1.2 Atelier IA `~/entreprise-autonome/entreprise-autonome-v0.2`

- **Aucun module de messagerie**, **aucune lib mail**, **aucun envoi d'e-mail** dans le code.
- Aucun système de file d'attente.
- Atelier ne gère aujourd'hui **aucune** communication e-mail.

### 1.3 Infrastructure

| Élément | Valeur vérifiée |
|---|---|
| Fournisseur | Oracle Cloud — `VM.Standard.A1.Flex` (ARM Ampere) |
| Ressources | 4 OCPU, 24 Go RAM, region `eu-paris-1` |
| OS | Ubuntu 24.04.4 LTS, kernel 6.17 |
| IP publique | `145.241.166.163` |
| **PTR / rDNS** | **AUCUN** (vérifié par résolution inverse) |
| **Port 25 sortant** | **BLOQUÉ** (test TCP + doc Oracle : tenancies créées après le 23/06/2021) |
| Ports 587 / 465 sortants | **OUVERTS** (test TCP OK) |
| Port 25 entrant | Aucun service en écoute |
| Serveur mail installé | **Aucun** (postfix, exim, dovecot, opendkim absents) |
| Redis | Absent |
| Disque | 12 Go libres — mais **63 Go récupérables** (32 Go build cache, 56 Go images) |
| Conteneurs | 13 actifs (CRM + Atelier + SearXNG + Ollama) |

---

## 2. Architectures étudiées

### A. Moteur Atelier souverain + transport interchangeable

```
  Site (Pages Function)          CRM / Atelier
        │                              │
        │  POST /api/reservations      │  déclencheur (réservation, annulation…)
        ▼                              ▼
   ┌──────────────┐            ┌──────────────────┐
   │ KV (file      │──poller──▶│  EmailOutbox      │  ◀── table DB (à créer)
   │  réservation) │            │  (statut, essais, │
   └──────────────┘            │   idempotence)    │
                               └────────┬──────────┘
                                        │  worker (cron 1 min)
                                        ▼
                               ┌──────────────────┐
                               │  IMailProvider    │  ◀── DÉJÀ EXISTANT
                               └────────┬──────────┘
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
              simulated            smtp (relais)        api (Brevo/Resend)
              (dev/test)           port 587/465         HTTPS
```

**Tout est à nous** : modèles, déclencheurs, file, journaux, reprise, templates.
**Seul le transport est interchangeable** — et c'est exactement le point d'étranglement.

- Coût logiciel : **0 €** (nodemailer déjà là)
- Complexité : **faible à moyenne** (1 table + 1 worker, pas de Redis nécessaire)
- Maintenance : **faible**

### B. Serveur SMTP auto-hébergé sur l'infra actuelle

**Verdict : NON VIABLE pour l'envoi direct.** Trois blocages matériels, non contournables par du logiciel :

1. **Port 25 sortant bloqué** par Oracle (politique tenancy, confirmée par doc officielle et test TCP). Un serveur SMTP ne peut pas remettre un message à un MX distant sans port 25 sortant. Demander l'ouverture via ticket est possible mais non garanti, et Oracle a refusé plusieurs demandes publiquement.
2. **Aucun PTR/rDNS** sur l'IP, et Oracle ne le délègue pas sur le free tier. Sans PTR cohérent avec le HELO, la majorité des grands fournisseurs (Gmail, Outlook) rejettent ou classent en spam.
3. **IP partagée / réputation nulle** — les plages Oracle free tier sont listées sur plusieurs blocklists ; une IP neuve sans historique est traitée comme suspecte.

Même en installant Stalwart / mailcow / docker-mailserver, **on ne peut pas envoyer**. La brique manquante n'est pas logicielle, elle est réseau et réputationnelle.

**Seule variante survivable** : le serveur auto-hébergé devient un **relais qui pousse vers un smarthost** (port 587). Mais à ce moment, on dépend d'un tiers exactement comme en A — avec une complexité et une surface d'attaque supérieures.

### C. Hybride / open source

| Variante | Description | Dépendance tierce |
|---|---|---|
| **C1** | Moteur A + transport **API** (Brevo, Resend, SES, Mailgun) | Transport seulement |
| **C2** | Moteur A + relais SMTP auto-hébergé (Stalwart, Postal, mailcow) poussant vers un smarthost | Transport **et** logiciel à maintenir |
| **C3** | Moteur A + serveur SMTP sur un **VPS tiers** avec port 25 ouvert et PTR propre | Infra entière (coût mensuel) |

**Composants open source pertinents** (pour C2/C3) :
- **Stalwart** (Rust, moderne, actif) — serveur tout-en-un, faible empreinte
- **Postal** (Ruby, orienté envoi de masse, suivi de délivrabilité)
- **Maddy** (Go, binaire unique, simple)
- **Haraka** (Node.js, programmable — cohérent avec la stack existante)
- **docker-mailserver / mailcow / Mailu** (bundles prêts à l'emploi)
- **Rspamd** (antispam/filtrage), **OpenDKIM** (signature)

Licences : toutes permissives (MIT / Apache-2.0 / GPL selon projet). Aucune n'est payante. **Mais aucune ne résout les blocages réseau de la section B.**

**Distinction importante** : ces logiciels sont libres ; **l'acheminement final reste opéré par un tiers** dès qu'on n'a pas de port 25 ouvert et de PTR propre.

---

## 3. Besoins réels d'Elysence

| Besoin | Volume / contrainte estimé |
|---|---|
| Confirmations de réservation | ~5–20 / semaine → **~1 000 / an** |
| Annulations / modifications | marginal (quelques dizaines / an) |
| Messages administratifs | marginal |
| Pics | faibles (pas de campagne marketing) |
| Séparation par cliente | identité d'expédition unique (une seule Maison) |
| Multi-projet | possible mais **non requis aujourd'hui** ; `EmailLog` sans `tenantId` serait à compléter |
| Confidentialité / conservation | RGPD : données de réservation, conservation 7 j en file, logs à limiter |
| Anti-doublon | **requis** — un poller peut repasser ; sans clé d'idempotence, risque d'envois répétés |
| Erreurs temporaires | **requis** — retry avec backoff, quota, indisponibilité transport |
| Mode test sans envoi | **requis** — déjà assuré par `simulated`, statut `SIMULATED` distinct de `SENT` |

**Point de conformité déjà respecté** : le code ne déclare jamais `SENT` si le transport est simulé (`status: this.provider.driver === 'simulated' ? 'SIMULATED' : 'SENT'`). C'est exactement l'exigence demandée.

**Volume vs offres gratuites** : 1 000 mails/an ≈ 85/mois. **Toutes** les offres gratuites couvrent ce besoin avec une marge énorme (Brevo 300/jour ≈ 9 000/mois).

---

## 4. Comparatif coûts / avantages / limites / risques

| Critère | **A** Moteur + transport interchangeable | **B** SMTP auto-hébergé | **C1** Moteur + API tierce | **C2/C3** Moteur + relais/VPS |
|---|---|---|---|---|
| Coût logiciel | 0 € | 0 € | 0 € | 0 € |
| Coût infra | 0 € (existant) | 0 € (existant) | 0 € | **5–6 €/mois** (VPS) ou 0 € si relais |
| Coût à l'échelle | 0 € | 0 € | 0 € jusqu'à ~9 000/mois | 0 € |
| Envoi direct possible | selon transport | **NON** (port 25 bloqué) | Oui (via API) | Oui (via VPS) |
| Délivrabilité | dépend du transport | **très mauvaise** | **bonne** | à construire |
| Complexité dev | **faible-moyenne** | élevée | faible-moyenne | élevée |
| Maintenance | faible | **très élevée** (antispam, DKIM, blocklists, mises à jour, supervision) | faible | élevée |
| Dépendance tierce | **transport uniquement** | faible en théorie, mais nécessite smarthost → tierce en pratique | transport | infra |
| Risque principal | changement de fournisseur de transport | **échec d'envoi, blacklist, perte de mails** | quotas, changement de politique | coût + maintenance |
| Temps de mise en œuvre | 1–2 j | **plusieurs semaines** + tickets Oracle | 1–2 j | plusieurs semaines |
| Réaliste en production | **OUI** | **NON** sur cette infra | **OUI** | OUI mais surdimensionné |

### Coûts annuels estimés (faits vs estimations)

- **Faits vérifiés** : nodemailer déjà installé (0 €) ; volume ~1 000 mails/an ; offres gratuites ≥ 3 000/mois ; port 25 bloqué ; aucun PTR.
- **Estimations** : coût réel 0 €/an pour A et C1 au volume d'Elysence. Un VPS tiers avec port 25 ouvert : ~60–72 €/an. **Coûts cachés des offres gratuites** : plafond quotidien, sous-domaine imposé si domaine non vérifié, filigrane éventuel, mise en veille après inactivité, changement de conditions unilatéral.
- **Non vérifiable sans intervention humaine** : politique exacte d'Oracle sur une demande d'ouverture du port 25 pour ce tenant ; délégation PTR ; acceptation d'un domaine personnalisé par le fournisseur retenu.

---

## 5. Prérequis manquants

1. **Template `reservation.confirmed`** (et `reservation.cancelled`, `reservation.updated`) — **inexistants**
2. **Table `EmailOutbox`** : file persistante avec `statut`, `tentatives`, `nextAttemptAt`, `idempotencyKey`
3. **Worker d'envoi** (cron 1 min) avec backoff et reprise — **inexistant**
4. **Clé d'idempotence** (ex. `reservationId + type`) — **inexistante**
5. **`tenantId` sur `EmailLog`** — si plusieurs projets partagent le moteur
6. **Transport** : soit identifiants SMTP (587/465), soit clé API
7. **Domaine avec SPF, DKIM, DMARC** — pour la délivrabilité ; aujourd'hui le site est sur `pages.dev` (pas de domaine propre choisi)
8. **MailHog fonctionnel** pour les tests locaux (image arm64 ou alternative type Mailpit)
9. **Supervision** : alerte si `EmailLog.status = FAILED` ou file qui stagne

---

## 6. Conclusion argumentée

**Atelier peut posséder toute la logique de messagerie sans dépendre d'un tiers** : modèles, déclencheurs, file d'attente, reprise, journalisation, anti-doublon, mode test. C'est réaliste, peu coûteux et déjà à moitié en place (l'abstraction `IMailProvider` et `nodemailer` existent).

**Atelier ne peut pas, sur cette infrastructure, acheminer lui-même le courrier jusqu'aux boîtes des clientes.** Ce n'est pas une limite de logiciel : le port 25 sortant est bloqué par Oracle, il n'y a aucun PTR, et l'IP n'a aucune réputation. Installer un serveur SMTP ne changerait rien à ces trois faits.

**Conséquence honnête** : la souveraineté totale sur l'envoi exigerait soit un autre hébergeur avec port 25 ouvert et PTR propre (VPS tiers, coût + maintenance), soit l'usage d'un relais tiers. Pour une activité de 1 000 mails/an, la seconde option est disproportionnellement plus simple et plus fiable.

**Le bon découpage** : garder le **moteur** chez nous (souverain, remplaçable) et traiter le **transport** comme une pièce interchangeable — c'est déjà la conception du code. On ne dépend alors d'aucun fournisseur pour la logique, et le jour où l'on veut changer de transport (ou passer à un VPS avec port 25), une seule classe change.

---

## 7. Plan d'implémentation par étapes

| Étape | Contenu | Test | Critère d'acceptation |
|---|---|---|---|
| 1 | Ajouter `EmailOutbox` (Prisma) + migration | migration appliquée, table visible | schéma en base, aucune donnée détruite |
| 2 | Templates `reservation.confirmed/cancelled/updated` | test unitaire de rendu | rendu FR correct, variables injectées |
| 3 | Worker d'envoi (cron 1 min) + backoff | envoi avec `MAIL_DRIVER=simulated` | statut `SIMULATED`, **jamais** `SENT` |
| 4 | Idempotence (`reservationId + type`) | double déclenchement du même événement | **1 seul** enregistrement, 0 doublon |
| 5 | Test de panne transport | transport injoignable simulé | message conservé, retry programmé, statut `FAILED` explicite |
| 6 | Brancher le transport réel (SMTP 587 ou API) | envoi vers une adresse de test | réception réelle + `SENT` + SPF/DKIM OK |
| 7 | Supervision | forcer un échec | alerte visible, pas d'échec silencieux |
| 8 | Multi-projet (optionnel) | `tenantId` sur EmailLog + identité par tenant | isolation vérifiée |

**Aucune de ces étapes n'est lancée** — elles attendent votre validation.

---

## 8. Recommandation technique

**Architecture A**, avec le transport traité comme interchangeable :

1. **Court terme** : garder `simulated` (mode test) et implémenter les étapes 1 à 5 — entièrement souveraines, 0 €, 0 dépendance. Cela rend la messagerie fiable même sans transport réel.
2. **Transport** : brancher un relais gratuit (Brevo ou Resend) **uniquement comme transport**, derrière l'interface existante. Coût 0 €, couvre 100× le volume d'Elysence.
3. **Ne pas auto-héberger de serveur SMTP sur cette VM** : le port 25 bloqué et l'absence de PTR rendent le service non fiable, quels que soient les logiciels installés.
4. **Si la souveraineté totale devient une exigence** : provisionner un VPS tiers avec port 25 ouvert et PTR configurable, et y déployer Stalwart ou Postal. C'est la seule voie techniquement valable pour un envoi direct — elle coûte ~60–72 €/an et demande une maintenance réelle (SPF, DKIM, DMARC, blocklists, supervision).

**En résumé** : oui à un moteur Atelier souverain ; non à un serveur SMTP auto-hébergé sur Oracle ; oui à un transport tiers interchangeable et remplaçable à tout moment.
