# AGENTS.md — Elysence Partner

Instructions permanentes pour tout agent (Claude, Hermes, autres) travaillant sur ce dépôt.

## Règle permanente : zéro turc, autonomie totale

- Le projet est celui de **Maison ELYSENCE** : tout est en **français** (code visible, commentaires, messages d'erreur, e-mails, documentation), l'anglais reste accepté pour les noms de variables et de fonctions.
- **Interdit, sans exception** : texte turc, devise `TRY`, locale `tr`, fuseau `Istanbul`/`Turkey`, option « Türkçe », identité `meliksahk`. Tout cela doit être remplacé par `EUR`, `fr`, `Paris`/`France` et **Maison ELYSENCE**.
- Si tu en croises dans du code existant ou dans du code que tu écris ou copies, **corrige-le toi-même immédiatement, sans demander et sans attendre d'autorisation**.
- Cette règle s'applique aussi aux **données** : une valeur `TRY` en base, une locale `tr` dans une configuration, un libellé turc dans une interface ou un e-mail doivent être corrigés.
- Les traces turques non visibles (commentaires de code) doivent être nettoyées au fil des modifications, sans réécriture massive non liée à la tâche en cours.

## Règles de travail

- **Autonomie** : ne pas demander d'autorisation pour lire, modifier, tester, committer ou pousser. Prendre la décision la plus raisonnable, l'appliquer, et la rapporter après.
- **Branche** : travailler uniquement sur `master`. Ne jamais utiliser `main`.
- **Vérification** : ne jamais annoncer « corrigé » ou « terminé » sans preuve réelle (sortie de commande, test exécuté, URL qui répond).
- **Données** : ne jamais supprimer ni réinitialiser les données existantes (clientes, demandes, ventes, factures, rendez-vous).
- **Déploiement** : utiliser uniquement le mécanisme Atelier existant (`github-to-oracle.timer` / `github-to-oracle.sh`). Ne créer aucun second système de déploiement.
- **Secrets** : ne jamais committer de secret (`.env`, JWT, mots de passe, tokens) ni l'afficher dans les logs.

## Identité du produit

- Nom : **Elysence Partner**
- Palette : or `#80602d`, crème `#f6efe3`, espresso `#241b13`, papier `#fbf8f2`
- Logo : `frontend/public/logo-elysence.svg`
- Devise : **EUR** — Dates : format français (`JJ/MM/AAAA`) — Langue par défaut : **français**
