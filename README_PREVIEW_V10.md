# BioDynaMit — validation du stockage V10

Cette page est indépendante de l'application officielle. Aucun fichier existant n'est remplacé. Elle ne charge ni app.js, ni 3d-fix.js, ni storage-migration.js. Aucun appel d'écriture, de migration ou de création de tables n'est présent dans ses modules.

## Fichiers ajoutés à la racine du dépôt

- preview-v10.html : page de test.
- storage-preview-v10.css : mise en page responsive.
- storage-preview-v10.js : navigation et connexion en consultation.
- storage-data-v10.js : lecture du schéma canonique et jointures.
- storage-scene-v10.js : caméra, sélection, couvercle et nettoyage WebGL.
- storage-box-model-v10.js : géométrie carton et flacons, reprise du modèle photo validé.

Les fichiers tests/preview-v10.test.mjs et ce guide ne sont pas chargés par l'interface.

## Ajouter les fichiers dans GitHub

La publication automatique a été refusée par GitHub (403, Resource not accessible by integration). Le dépôt officiel n'a pas été modifié.

1. Télécharger BioDynaMit-preview-v10.zip et faire clic droit → Extraire tout sous Windows.
2. Ouvrir https://github.com/pierrebandini-sudo/biodynamit-antibody-database et rester sur la branche main.
3. Cliquer Add file → Upload files.
4. Glisser les SIX fichiers de l'interface listés ci-dessus dans la zone d'envoi. Ils doivent apparaître directement à la racine, à côté d'index.html. Ne pas envoyer le ZIP lui-même, ni un dossier parent contenant ces fichiers.
5. Cliquer Commit changes. Si GitHub demande un message, écrire « Ajouter la preview stockage V10 en lecture seule ». Ne remplacer aucun fichier existant.
6. Attendre la fin du déploiement GitHub Pages dans l'onglet Actions. L'adresse preview-v10.html devient alors utilisable. Si elle affiche une erreur 404, vérifier la fin du déploiement et l'emplacement des six fichiers.

Le guide et le dossier tests sont fournis pour référence ; ils ne sont pas nécessaires à l'hébergement du widget.

## Installation dans le document existant

1. Ouvrir https://grist.numerique.gouv.fr/o/docs/64YcwiEAHRud/BDMIT-antibodies-2025 et se connecter normalement.
2. Ajouter une nouvelle page/widget **Personnalisé**. Nommer la page **Test stockage V10**. Ne pas modifier l'URL du widget officiel.
3. Choisir la table existante **Positions** comme données source. Ne pas créer de nouvelle table et ne pas importer de fichier.
4. Dans le panneau de configuration du widget, choisir **URL personnalisée** et coller :

   https://pierrebandini-sudo.github.io/biodynamit-antibody-database/preview-v10.html?v=10

5. Autoriser **Accès complet** lorsque Grist le demande. Grist exige ce niveau pour lire plusieurs tables via docApi. Le code de cette preview n'utilise que listTables et fetchTable : aucun appel d'écriture. Cette propriété du code n'est pas une permission serveur de lecture seule.
6. Vérifier le message **Connecté à Grist**. Cliquer sur Actualiser si nécessaire. Agrandir le widget pour donner de la place à la scène et à la fiche latérale.

## Parcours de validation sur les vraies données

Les compteurs ne sont pas codés en dur. Si les données sont toujours dans l'état décrit, les boîtes doivent afficher 61/100, 35/100 et 35/100.

1. Sélectionner chacune des trois boîtes : nom, température, plan et contenu doivent changer ensemble.
2. Ouvrir et fermer le couvercle, utiliser Recentrer, Perspective et Vue du dessus. La géométrie garde les mêmes proportions quel que soit le format du widget.
3. Cliquer sur un bouchon puis sur le même emplacement dans le plan ou la vue 2D : la fiche doit montrer le même vial, la même référence catalogue et le même emplacement.
4. Cliquer sur une case libre : le panneau affiche Position libre. Le bouton Ajouter est désactivé dans cette phase.
5. Contrôler un vial non relié : son étiquette originale issue de Comments est affichée ; aucune correspondance nouvelle n'est inventée.
6. Contrôler un vial vide : il reste occupé dès lors que Positions.Vial le référence. Un volume de 0 µL est affiché comme 0 et jamais comme inconnu.
7. Dans Catalogue, rechercher une référence et ouvrir sa fiche. Tous ses vials sont comptés ; toutes ses positions liées sont proposées.
8. Ouvrir Historique : les lignes viennent de History. L'absence de cette table ne bloque pas le stockage.
9. Vérifier que la consultation n'a créé aucune action dans l'historique Grist et qu'aucune table supplémentaire n'a été créée.

## Comportements importants

- Source de vérité : Positions.Box → Boxes.id ; Positions.Vial → Vials.id ; Vials.Antibody → Antibodies.id.
- Positions.Vial détermine l'occupation, même si le flacon est vide ou si Available est incohérent. Un emplacement sans vial et Available=false est signalé indisponible.
- Le produit peut avoir plusieurs vials et emplacements. Aucun dédoublonnage destructif.
- Les codes couleurs suivent HostSpecies (anglais/français). En l'absence de fiche liée, une espèce exacte dans l'étiquette source peut être lue. Sinon, gris « Non renseigné ».
- Les positions manquantes, invalides, répétées ou les références rompues produisent un avertissement, sans réparation automatique.
- L'interface ne contient aucun inventaire embarqué et aucun aperçu fictif. Ouverte hors Grist, elle explique comment la connecter.
- Rafraîchissement à la demande, à la notification Grist et toutes les 15 secondes lorsque la page est visible.
- La 3D nécessite WebGL et les scripts Grist/Three.js accessibles. Le bouton Vue 2D fonctionne si le moteur 3D est indisponible.
- Modèle photo estimé : pas de dimensions physiques mesurées. Format pris en charge : les trois boîtes 10 × 10 actuelles.

## Après validation visuelle

La version officielle reste inchangée. L'ajout direct, le déplacement et le retrait physique seront raccordés dans une phase suivante avec vérification des positions et gestion des conflits. Aucun basculement automatique n'est effectué. Ne pas réactiver les migrations déjà faites.

## Vérifications techniques

Le test Node/Playwright utilise uniquement des enregistrements synthétiques privés au test ; ils ne sont jamais chargés par la preview. Il contrôle les jointures, les compteurs, les vials vides/non reliés, l'absence d'appels d'écriture, la navigation, les trois scènes, le couvercle et les formats d'écran. Il ne remplace pas la validation dans la session Grist du laboratoire.

Documentation Grist : https://support.getgrist.com/widget-custom/
