# BioDynaMit v11.2 — Security & Production

Cette version ajoute une couche de **défense en profondeur** au widget BioDynaMit.

## Ce que fait le code v11.2

- retire l'entrée **Administration** de la build de production ;
- bloque les anciennes fonctions de création de schéma, migration et données de test ;
- bloque les modifications structurelles Grist depuis l'application ;
- bloque les suppressions permanentes de lignes depuis l'application ;
- autorise uniquement les écritures nécessaires au fonctionnement quotidien :
  - `Antibodies` : création / mise à jour ;
  - `Vials` : création / mise à jour ;
  - `Positions` : mise à jour ;
  - `Documents` : création / mise à jour ;
  - `Notes` : création / mise à jour ;
  - `History` : création ;
- ajoute une politique réseau sortante :
  - même origine GitHub Pages ;
  - Europe PMC / EBI pour la veille scientifique ;
  - hôtes Grist nécessaires ;
  - credentials et referrer supprimés pour les appels scientifiques externes ;
- ajoute `rel=noopener noreferrer` et `referrerPolicy=no-referrer` aux ressources externes ;
- ajoute une Content Security Policy (CSP) dans la page HTML ;
- passe automatiquement l'interface en lecture seule après un refus d'écriture Grist détecté.

## Important : ceci n'est PAS la sécurité principale

Le JavaScript du widget est une protection supplémentaire.  
**Les vraies autorisations doivent être appliquées dans Grist via les règles d'accès.**

Un utilisateur Editor qui conserve la permission de structure `S` peut contourner des restrictions en créant/modifiant des formules. Grist recommande de retirer cette permission aux Editors lorsque l'on veut limiter leurs droits.

## Configuration Grist recommandée

### 1. Activer les règles d'accès

Dans le document Grist :

`Partager / Gérer les utilisateurs → Ouvrir les règles d'accès`

Puis **Activer les règles d'accès** et enregistrer.

Cette activation retire normalement la modification de structure aux Editors, sauf si vous réactivez explicitement cette permission.

### 2. Ne pas autoriser les Editors à modifier la structure

Dans les règles spéciales :

- **Allow Editors to edit structure / Autoriser les éditeurs à modifier la structure : DÉSACTIVÉ**

C'est le point le plus important.

### 3. Utiliser seulement trois profils

**Owner**
- Pierre / administrateur(s) de confiance
- accès complet
- modification structurelle
- gestion des règles d'accès

**Editor — utilisateur labo**
- peut travailler via BDD v11.2
- pas de modification structurelle
- pas de suppression permanente
- pas de migration

**Viewer**
- consultation uniquement

### 4. Règles de table recommandées pour les Editors

Dans chaque règle, laissez toujours les Owners avec accès complet.

Pour `Antibodies`
- Viewer : R
- Editor : R, U, C
- Editor : D refusé

Pour `Vials`
- Viewer : R
- Editor : R, U, C
- Editor : D refusé

Pour `Positions`
- Viewer : R
- Editor : R, U
- Editor : C et D refusés

Pour `Documents`
- Viewer : R
- Editor : R, U, C
- Editor : D refusé

Pour `Notes`
- Viewer : R
- Editor : R, U, C
- Editor : D refusé

Pour `History`
- Viewer : R
- Editor : R, C
- Editor : U et D refusés

Pour `Boxes`
- Viewer : R
- Editor : R
- Editor : U, C, D refusés

Pour `AppSettings`
- non-Owner : lecture seule ou accès refusé selon votre besoin

Pour les tables Excel sources (`list of all antibodies`, stockage brut, etc.)
- non-Owner : lecture seule
- aucune création / modification / suppression

### 5. Conditions typiques

Grist utilise notamment :

- `user.Access == OWNER`
- `user.Access == EDITOR`
- `user.Access == VIEWER`
- `user.Access != OWNER`

Les permissions sont :
- `R` lecture
- `U` mise à jour
- `C` création
- `D` suppression
- `S` structure

### 6. Partage

- pas de lien public éditable ;
- comptes nominatifs uniquement ;
- 1–2 Owners maximum ;
- collaborateurs habituels en Editor avec règles d'accès ;
- personnes en consultation en Viewer.

## Données externes

La veille scientifique envoie uniquement des termes scientifiques utiles à Europe PMC :
- références catalogue ;
- noms/cibles d'anticorps ;
- termes mitochondriaux.

Elle ne doit jamais envoyer :
- Notes internes ;
- commentaires de stock ;
- emplacements de boîtes ;
- historique utilisateurs ;
- données sensibles du laboratoire.

La v11.2 bloque les connexions `fetch()` vers d'autres domaines non autorisés.

## Limite actuelle connue

Three.js et OrbitControls restent chargés depuis jsDelivr, mais avec une version figée `0.128.0`.
Une prochaine étape de durcissement peut consister à **self-héberger ces deux fichiers dans le dépôt GitHub** pour supprimer cette dépendance externe.

L'API Grist reste chargée depuis `docs.getgrist.com`, ce qui est normal pour le fonctionnement du widget.

## Test avant mise en production

1. tester avec un Owner ;
2. tester avec un Editor ;
3. tester avec un Viewer ;
4. vérifier que l'Editor peut :
   - ajouter/modifier un vial ;
   - déplacer un vial ;
   - ajouter Documents/Notes ;
   - ajouter un anticorps ;
5. vérifier que l'Editor ne peut pas :
   - modifier la structure ;
   - supprimer définitivement une ligne ;
   - lancer une migration ;
   - accéder aux actions d'administration ;
6. vérifier qu'un Viewer ne peut rien écrire ;
7. exporter une sauvegarde Grist avant promotion en production.
