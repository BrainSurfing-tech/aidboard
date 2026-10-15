# A-I-D · références d’implémentation (v0, sans Swairm)

Trois fichiers HTML statiques, destinés à être lus par un programme. Chaque fichier contient les 16 cadres d’un écran (4 états × 4 tailles) et 1 cadre de survol.

| Fichier | Écran |
|---|---|
| `aid-1-1-accueil.html` | 1.1 Accueil : une carte par sujet ouvert, avec intervention directe |
| `aid-1-2-boite-de-reception.html` | 1.2 Boîte de réception : éléments triés par urgence, issues à démarrer |
| `aid-1-3-sujet.html` | 1.3 Sujet : terminaux, diff, consignes, fil d’événements |

## Conventions

- **Cadre** : la racine porte `data-screen` (1.1, 1.2, 1.3), `data-state` (default, empty, loading, error, hover) et `data-viewport` (phone 390, tablet 834, desktop 1440, wide 1920). La hauteur suit le contenu. Le cadre `hover` fait 480 px et porte `data-viewport="desktop"`.
- **`data-node`** : `écran.zone.élément[.champ]`, l’écran s’écrit avec un tiret (`1-1.grille.sujet-3.demande.option-1`). Les éléments répétés sont indicés. Chaque `data-node` est unique dans son cadre. Il est identique sur les quatre tailles d’un même état : ce qui n’a pas la place est masqué en CSS, jamais retiré.
- **`data-bind`** : nom du champ fourni par le daemon.
- **`data-action`** : intention déclenchée par un élément interactif. Contrairement à l’écran 7.1 (lecture pure), ces trois écrans sont interactifs, donc chaque bouton, champ, case, lien ou onglet en porte un. Les identifiants `topic.sync`, `topic.pr`, `topic.cleanup` et `tests` reprennent ceux du registre d’actions de la spec.
- **`data-layer="overlay"`** : seule couche en position absolue (l’infobulle du cadre hover).
- **Styles** : aucun attribut `style`. Toutes les couleurs sont des variables de `:root`, Inter est la seule police, la mise en page est en flex ou grid, et les tailles se distinguent par `[data-viewport="…"]`.
- HTML statique : aucun script, aucun gestionnaire `on…`.

## Vocabulaire `data-action`

actions.menu, agent.ajouter, agent.choisir, agent.lancer (+ `data-agent`), consigne.ajouter, consigne.envoyer, consigne.globale, consigne.saisir, daemon.reconnecter, demande.repondre, diff.ouvrir, diff.portee, editeur.ouvrir, fichier.choisir, filtre.distant, filtre.statut, filtre.workspace, issue.confier, issue.creer-sujet, message.envoyer, message.saisir, nav.accueil, nav.boite, nav.consignes, nav.reglages, onglet.choisir, palette.ouvrir, pr.ouvrir, relais.desactiver, relais.reconnecter, run.pause, run.reprendre, sujet.adopter, sujet.creer, sujet.ouvrir, sujet.recreer-worktree, sujet.reprendre-local, terminal.agrandir, terminal.ouvrir, terminal.saisir, tests, topic.cleanup, topic.pr, topic.sync, topic.sync-annuler

## Vocabulaire `data-bind`

action.resultat, agent.acces, agent.invite_detectee, agent.message, agent.outil, agent.role, agent.silence_depuis, agent.source, agent.statut, agent.transport, agent.type, consigne.niveau, consigne.texte, consignes.repartition, daemon.etat, demande.option, demande.question, demande.type, diff.ajouts, diff.fichiers, diff.ligne, diff.suppressions, erreur.cause, evenement.heure, evenement.moment, evenement.source, evenement.texte, evenement.type, fichier.ajouts, fichier.chemin, fichier.etat, fichier.suppressions, fichiers.resume, issue.executant, issue.label, issue.numero, issue.titre, pr.resume, pr.verifications, pty.taille, relais.depot, relais.derniere_synchro, relais.etat, resume.a_relire, resume.agents_inactifs, resume.elements, resume.en_attente, resume.en_cours, resume.en_pause, resume.erreurs, resume.sujets, run.etat, run.partage, sujet.base, sujet.branche, sujet.derniere_activite, sujet.etat, sujet.pr, sujet.retard_base, sujet.statut (statut agrégé des agents, le plus urgent), sujet.titre, sujet.worktree, terminal.ligne, workspace.nom

## Statuts (jamais par la couleur seule)

| Statut | Libellé | Marque |
|---|---|---|
| needs_input | Attend une réponse | point plein ambre + libellé |
| error | Erreur | point carré rouge + libellé |
| idle | À relire | point plein turquoise + libellé |
| idle (heuristique) | À relire · estimé | anneau + bordure en tirets + « estimé » |
| working | En cours | point plein bleu + libellé |
| en pause | En pause | anneau gris + libellé |

## États d’erreur : second cas

- 1.1 : worktree introuvable (sujet bloqué), en plus du daemon injoignable.
- 1.2 : relais aid-inbox interrompu (jeton GitHub refusé, 401).
- 1.3 : `topic.sync` arrêté sur un conflit (code de sortie 2).

## Cadres produits (51)

| # | Écran | État | Taille | Largeur |
|---|---|---|---|---|
| 1 | 1.1 Accueil | default | phone | 390 px |
| 2 | 1.1 Accueil | default | tablet | 834 px |
| 3 | 1.1 Accueil | default | desktop | 1440 px |
| 4 | 1.1 Accueil | default | wide | 1920 px |
| 5 | 1.1 Accueil | empty | phone | 390 px |
| 6 | 1.1 Accueil | empty | tablet | 834 px |
| 7 | 1.1 Accueil | empty | desktop | 1440 px |
| 8 | 1.1 Accueil | empty | wide | 1920 px |
| 9 | 1.1 Accueil | loading | phone | 390 px |
| 10 | 1.1 Accueil | loading | tablet | 834 px |
| 11 | 1.1 Accueil | loading | desktop | 1440 px |
| 12 | 1.1 Accueil | loading | wide | 1920 px |
| 13 | 1.1 Accueil | error | phone | 390 px |
| 14 | 1.1 Accueil | error | tablet | 834 px |
| 15 | 1.1 Accueil | error | desktop | 1440 px |
| 16 | 1.1 Accueil | error | wide | 1920 px |
| 17 | 1.1 Accueil | hover | desktop (cadre réduit) | 480 px |
| 18 | 1.2 Boîte de réception | default | phone | 390 px |
| 19 | 1.2 Boîte de réception | default | tablet | 834 px |
| 20 | 1.2 Boîte de réception | default | desktop | 1440 px |
| 21 | 1.2 Boîte de réception | default | wide | 1920 px |
| 22 | 1.2 Boîte de réception | empty | phone | 390 px |
| 23 | 1.2 Boîte de réception | empty | tablet | 834 px |
| 24 | 1.2 Boîte de réception | empty | desktop | 1440 px |
| 25 | 1.2 Boîte de réception | empty | wide | 1920 px |
| 26 | 1.2 Boîte de réception | loading | phone | 390 px |
| 27 | 1.2 Boîte de réception | loading | tablet | 834 px |
| 28 | 1.2 Boîte de réception | loading | desktop | 1440 px |
| 29 | 1.2 Boîte de réception | loading | wide | 1920 px |
| 30 | 1.2 Boîte de réception | error | phone | 390 px |
| 31 | 1.2 Boîte de réception | error | tablet | 834 px |
| 32 | 1.2 Boîte de réception | error | desktop | 1440 px |
| 33 | 1.2 Boîte de réception | error | wide | 1920 px |
| 34 | 1.2 Boîte de réception | hover | desktop (cadre réduit) | 480 px |
| 35 | 1.3 Sujet | default | phone | 390 px |
| 36 | 1.3 Sujet | default | tablet | 834 px |
| 37 | 1.3 Sujet | default | desktop | 1440 px |
| 38 | 1.3 Sujet | default | wide | 1920 px |
| 39 | 1.3 Sujet | empty | phone | 390 px |
| 40 | 1.3 Sujet | empty | tablet | 834 px |
| 41 | 1.3 Sujet | empty | desktop | 1440 px |
| 42 | 1.3 Sujet | empty | wide | 1920 px |
| 43 | 1.3 Sujet | loading | phone | 390 px |
| 44 | 1.3 Sujet | loading | tablet | 834 px |
| 45 | 1.3 Sujet | loading | desktop | 1440 px |
| 46 | 1.3 Sujet | loading | wide | 1920 px |
| 47 | 1.3 Sujet | error | phone | 390 px |
| 48 | 1.3 Sujet | error | tablet | 834 px |
| 49 | 1.3 Sujet | error | desktop | 1440 px |
| 50 | 1.3 Sujet | error | wide | 1920 px |
| 51 | 1.3 Sujet | hover | desktop (cadre réduit) | 480 px |
