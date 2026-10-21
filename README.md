# 🌾 AGRO-FERME — Plateforme Professionnelle de Gestion de Ferme Animale

Plateforme web complète, moderne, intuitive et responsive développée en français pour la gestion rigoureuse d'exploitations animales et d'élevages (aviculture, caprins, ovins, bovins, porcins, cuniculture, etc.).

---

## 🚀 Démarrage Rapide

Cette application est une **Web App 100% locale et autonome (Local-First)** :
- **Aucune API backend ni base de données distante n'est nécessaire.**
- Toutes les données (fermes, cheptel, mouvements, reproduction, ponte, incubation, santé, aliments, dépenses, alertes) sont persistées localement dans votre navigateur (`localStorage`).
- Fonctionne **100% hors-ligne**.

### Option A : Lancement via le serveur statique local (Recommandé)
1. Démarrez le serveur statique local :
   ```bash
   node server.js
   ```
2. Ouvrez votre navigateur sur :
   **[http://localhost:3000](http://localhost:3000)**

### Option B : Ouverture directe sans serveur
Double-cliquez simplement sur le fichier `public/index.html` dans l'explorateur de fichiers de votre ordinateur pour l'ouvrir dans Google Chrome, Edge ou Firefox.

> 💡 **Mode Découverte en 1 Clic :**
> Sur l'écran de connexion, le bouton **« ⚡ Découvrir avec la ferme démo pré-remplie »** charge instantanément une exploitation complète avec ses canards, poules, chèvres, bâtiments et les 4 dépenses de référence totalisant **263 000 FCFA**.
>
> Identifiants par défaut : `fermier@exemple.com` / `ferme123`.

---

## 🧪 Tests Automatisés Locaux

Une suite de tests valide l'ensemble des règles métier, la persistance locale et les calculs :

```bash
node tests/local_app_test.js
```

---

## 🌟 Fonctionnalités Implémentées

### 1. Inscription et Connexion Sécurisée
- **Inscription complète** : nom de l'éleveur, adresse e-mail et mot de passe (haché via `bcrypt`).
- **Authentification par jetons JWT** sécurisés.
- **Réinitialisation de mot de passe** avec code de vérification à 6 chiffres et expiration temporisée.
- **Protection des routes privées** côté client et serveur.
- **Contrôle d'accès strict** : isolation multi-tenant par ferme (`user_farms`).

### 2. Création et Gestion Multi-Fermes
- Formulaire complet de création :
  * Nom de la ferme.
  * Nom du propriétaire / exploitant.
  * Pays et localité.
  * Type d'exploitation (Aviculture, Élevage fermier, Biologique, etc.).
  * Devise monétaire (FCFA, EUR, USD, CAD, MAD, GNF...).
  * Date de démarrage de l'activité.
- **Gestion multi-fermes** : un utilisateur peut créer et basculer instantanément entre plusieurs fermes depuis le menu supérieur.

### 3. Sélection des Espèces (« Mes animaux »)
- **Cartes illustrées** pour les espèces :
  * 🦆 Canards (canes, canards mâles, canetons)
  * 🐔 Poules et coqs (poules, coqs, poulettes, poussins)
  * 🐐 Chèvres et boucs (chèvres, boucs, chevreaux)
  * 🐑 Moutons et brebis (brebis, béliers, agneaux)
  * 🐄 Bovins (vaches, taureaux, génisses, veaux)
  * 🐖 Porcs (truies, verrats, porcelets, charcutiers)
  * 🐇 Lapins (lapines, mâles, lapereaux)
  * 🦃 Dindes (dindes, dindons, dindonneaux)
  * 🪶 Pintades (femelles, mâles, pintadeaux)
  * 🐾 Autres espèces personnalisées
- **Interrupteurs d'activation** individuels avec compteur d'animaux vivants.
- **Ajout d'espèces personnalisées** avec emoji, description et catégories dédiées.
- **Préservation intégrale des données** : désactiver une espèce la retire uniquement de la vue quotidienne, tout l'historique et les fiches existantes restent conservés.
- Les espèces sélectionnées pilotent les filtres et les formulaires de l'application.

### 4. Gestion du Cheptel
- Enregistrement **par lots** ou **individuel**.
- Données gérées :
  * Identifiant unique / code bague / boucle (ex: `POU-0001`, `LOT-CAN-01`).
  * Espèce et Catégorie adaptée.
  * Race ou variété (ex: Barbarie, Goliath, Saanen, Marans...).
  * Sexe (Femelle, Mâle, Mixte/Non-sexé pour les poussins/canetons).
  * Date de naissance / âge estimé.
  * Date d'achat et prix d'achat.
  * Effectif initial et effectif actuel en temps réel.
  * Poids (kg) et observations sanitaires.
  * Affectation à un lot ou bâtiment de la ferme.
  * Emplacement précis (cage, enclos, parc, bâtiment).

### 5. Tableau de Bord Décisionnel
- **Cartes d'indicateurs (KPIs)** :
  * Total d'animaux vivants.
  * Nombre de naissances (+).
  * Nombre de décès et pertes (-).
  * Nombre d'achats (+).
  * Nombre de ventes (-).
  * Nombre de lots actifs.
- **Filtres interactifs** : par espèce et par période (Aujourd'hui, 7 jours, Ce mois-ci, Cette année, Tout).
- **Visualisations graphiques Chart.js** (100% hors-ligne) :
  * Histogramme des effectifs par espèce.
  * Diagramme circulaire de répartition par sexe (Femelles, Mâles, Mixtes).
- Tableaux de synthèse des catégories et des derniers mouvements.

### 6. Mouvements des Animaux & Intégrité des Stocks
Opérations gérées avec contrôles de cohérence atomiques (`withTransaction`) :
- 🐣 **Naissances** : augmente le cheptel, génère un lot de nouveaux-nés.
- 🛒 **Achats** : entrée d'animaux avec valorisation financière.
- 💰 **Ventes** : sortie contrôlée avec calcul du chiffre d'affaires.
- ✝️ **Décès** : sortie sanitaire avec motif (maladie, froid...).
- ⚠️ **Pertes / Disparitions** : sortie de stock documentée.
- 🔀 **Transferts entre lots** : déplacement physique sans altération du stock global.
- 🔄 **Changements de catégorie** : évolution naturelle (ex: poussins devenant poulettes ou coqs). **L'effectif total est rigoureusement conservé sans double comptage**.
- 🛡️ **Garde-fous de sécurité** : interdiction absolue de sortir une quantité supérieure au stock disponible (empêche les stocks négatifs).

### 7. Historique et Recherche
- Registre consultable de l'ensemble des opérations.
- Filtres multicritères combinables :
  * Recherche textuelle libre.
  * Type d'opération.
  * Espèce et catégorie.
  * Plage de dates (début / fin).
- Export des données au format **CSV** et vue imprimable pour le registre d'élevage officiel.

### 8. Lots & Bâtiments
- Organisation spatiale de la ferme (Poussinières, Hangars, Parcs de pâturage, Bassins, Clapiers).
- Suivi de la capacité maximale et du taux d'occupation en temps réel.

---

## 🛠️ Architecture Technique

```
ferme-animale/
├── db.js                 # Initialisation SQLite native (node:sqlite DatabaseSync), schémas & transactions
├── auth.js               # Middleware JWT, hachage bcrypt, vérification des droits sur la ferme
├── server.js             # Serveur Express, points d'accès API et fichiers statiques
├── routes/
│   ├── auth.js           # Inscription, connexion, me, mot de passe oublié
│   ├── farms.js          # CRUD fermes et multi-exploitation
│   ├── species.js        # Espèces système et personnalisées, activation
│   ├── categories.js     # Catégories configurables par espèce
│   ├── lots.js           # Bâtiments et enclos
│   ├── animals.js        # Gestion du cheptel (lots et individus)
│   ├── movements.js      # Moteur de mouvements et validation atomique des stocks
│   ├── dashboard.js      # Calcul des indicateurs et statistiques
│   └── history.js        # Registre d'audit filtrable et exportable
├── public/
│   ├── index.html        # Interface Single-Page responsive (Mobile, Tablette, Desktop)
│   ├── css/styles.css    # Thème agricole moderne (Forêt, Terre cuite, Ambre)
│   └── js/
│       ├── api.js        # Client HTTP centralisé avec gestion des jetons
│       ├── state.js      # Store d'état réactif
│       └── app.js        # Contrôleur d'interface, formulaires et graphiques
└── tests/
    ├── test_suite.js     # Tests unitaires et logique d'intégrité métier
    └── e2e_api_test.js   # Tests d'intégration HTTP de bout en bout
```

- **Base de données persistante** : SQLite natif avec clés étrangères actives (`PRAGMA foreign_keys = ON;`), transactions ACID (`BEGIN TRANSACTION / COMMIT / ROLLBACK`), index de recherche optimisés.
- **Évolutivité future** : Schéma conçu pour accueillir facilement les modules de reproduction (saillies, gestations, éclosions) et de comptabilité analytique (ventes, charges d'aliment, marges).
