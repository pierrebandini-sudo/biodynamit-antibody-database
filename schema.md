# Schéma de données V1

## Antibodies
Fiche scientifique/commerciale du produit : Code, Name, FullName, Supplier, CatalogNumber, HostSpecies, Class, Target, ApplicationsText, MolecularWeight, Website, DateAdded, Comments, Active, RawTable, RawRowId.

## Vials
Exemplaire physique : Code, Antibody (Ref), FillStatus, EstimatedVolume_uL, Status, DateReceived, Comments.

## Boxes
Boîte physique : Code, Name, Temperature, Rack, Rows, Columns, Notes.

## Positions
Emplacement physique : Code, Box (Ref), Slot, Vial (Ref), Available, Notes.

## Applications / Dilutions
Applications et dilutions fournisseur/labo par anticorps.

## Documents / Notes / History
Documents, journal expérimental et historique des actions importantes.
