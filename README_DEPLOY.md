# BioDynaMit Antibody Stock — Widget Grist

Cette application est un **widget web statique** destiné à être intégré dans Grist via **Page personnalisée → URL personnalisée**.

## Ce que fait la V1

- interface inspirée de la maquette validée (barre latérale bleue, dashboard, fiches, stockage) ;
- création automatique d'un schéma relationnel Grist **sans supprimer les tables Excel importées** ;
- import automatique de la feuille `list of all antibodies` vers la table propre `Antibodies` ;
- tables : Suppliers, Antibodies, Vials, Boxes, Positions, Applications, Dilutions, Documents, Notes, History, AppSettings ;
- boîte 3D interactive : rotation, zoom, sélection d'un vial, surélévation, panneau d'informations ;
- déplacement d'un vial vers une position libre, avec écriture persistante dans Grist ;
- statut `Vide / à retirer` qui **ne libère pas automatiquement la position** ;
- vue grille alternative ;
- ajout d'anticorps et création de boîtes ;
- mode démonstration si l'application est ouverte hors Grist.

## Sécurité et architecture

Grist reste la **source de vérité**. Le site statique ne contient pas la base de données.
Le widget demande `requiredAccess: 'full'` car il doit créer les tables et déplacer des vials.
N'hébergez le code que sur un hébergement que le laboratoire / service informatique considère fiable.

## Déploiement le plus simple : GitHub Pages

1. Créer un dépôt GitHub, par exemple `biodynamit-antibody-stock`.
2. Copier `index.html`, `styles.css` et `app.js` à la racine du dépôt.
3. Activer **Settings → Pages → Deploy from a branch → main / root**.
4. GitHub fournira une URL HTTPS publique du type :
   `https://<compte>.github.io/biodynamit-antibody-stock/`
5. Dans Grist : **Ajouter une page → Personnalisée → URL personnalisée**.
6. Coller cette URL HTTPS et accepter l'accès complet au document uniquement si le dépôt est bien celui du laboratoire/de confiance.

> Le code est public si le dépôt GitHub Pages est public. Cela ne rend PAS les données Grist publiques : les données transitent entre l'iframe et Grist. Le code du widget ne contient pas d'API key.

## Première ouverture dans Grist

1. Le widget détecte que les tables propres n'existent pas.
2. Cliquer **Créer la structure dans Grist**.
3. Aller dans **Administration**.
4. Cliquer **Importer « list of all antibodies »**.
5. Vérifier quelques lignes dans Anticorps.
6. Pour tester immédiatement la 3D sans modifier les imports : cliquer **Créer les données de test**. Une `Box 3` 10×10 et un vial MFN2 en C7 sont créés.
7. Ouvrir **Stockage → Box 3** et tester C7 → nouvelle position.

## Partage avec les collègues

Le partage se fait au niveau du document Grist, pas du site statique du widget. Inviter les collègues dans Grist avec les droits adaptés. Ils ouvriront le même document et verront la même BDD / le même widget.

## À valider avant production

- hébergement du widget autorisé par le service informatique ;
- sauvegarde Grist ;
- droits d'accès avancés Grist ;
- politique sur les documents ou données sensibles ;
- migration des feuilles de stockage physiques (`-20C antibodies storage`, `4C antibodies storage`) après vérification de leur structure réelle.
