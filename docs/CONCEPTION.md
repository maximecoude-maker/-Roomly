# Conception — État des lieux mobile

## 1. Analyse du PDF source

Fichier : `Etat des lieux d'entrée - Template.pdf` (22 pages, généré par un outil métier, export macOS du 02/02/2024).

| Bloc PDF | Pages | Contenu extrait |
|---|---|---|
| Couverture | 1 | Bailleur, référence (T5 100 m² Lorient Gal Leclerc), adresse, locataire, gestionnaire, exécutant, dates (EDL 20/01/2024, début de bail 31/12/2023, entrée 27/01/2024), photo de couverture |
| Clés | 4 | 3 jeux : Entrée commune (clé noire ×4), Porte d'entrée (clé noire ×4), Boîte aux lettres (×1) + 1 photo chacun |
| Compteurs | 5 | Électricité (réf. 14848046268402, EDF) ; Eau (Saur via copropriété, relevé 1211827, emplacement Cuisine) + photo |
| Intérieur | 6-19 | 6 pièces, chacune : **État général** (Ordre, Propreté, Peinture) + **Condition structurelle** (Ventilation, Installation électrique, Humidité, Boiseries) puis rubriques → éléments |
| Installations techniques | 20 | Général > Coffret de distribution (photo, sans état) |
| Documents | 21 | Dépôts de garantie : vignettes vides → ignorées |
| Signatures | 22 | Signatures manuscrites → **non réutilisées** (propres à l'EDL signé) |

Hiérarchie : `Pièce > Rubrique (Base, Spécificités, Conformité, Appareils, Meubles & décorations) > Élément`. Chaque élément porte : **état** (Neuf, Très bon), **caractéristiques** (ex. Téléviseur › marque : Samsung ; Vaisselle › nombre d'assiettes : 12), **parties** (Porte › Serrure, Seuil, Ferme-porte), **constats** (Toilette › Plafond : Dégâts — « Marque au plafond »), **photos**.

Résultat : 7 pièces (dont Installations techniques), 83 éléments, 67 photos rattachées automatiquement à leur élément par position dans la page.

Particularités traitées :
- Texte en petites capitales encodé dans une plage Unicode décalée → décodage.
- Rubriques de niveau 3 sans sous-éléments (« Chambre 2 › Etagère », « Coffret de distribution ») → converties en éléments.
- Éléments coupés entre deux pages (titre répété) → dédoublonnés.
- 3 éléments sans état dans le PDF (Four, Plafond de la salle d'eau 2, Coffret) → laissés « À faire ».
- Numéro d'identité du locataire (page 1) volontairement non repris.

Script reproductible : `tools/extract_template.py` → `src/seed/template.json` + `public/seed/*.jpg` (noms explicites, ex. `cuisine-appareils-four-1.jpg`).

## 2. Modèle de données (`src/types.ts`)

```
Inspection
├─ type: entree | sortie · status: draft | validated · entryInspectionId?
├─ property { reference, address, postalCode, city, description, coverPhotoId }
├─ parties { landlord, manager, executedBy, tenant { name, phone, email, birthDate, birthPlace } }
├─ dates { inspectionDate, leaseStart, moveInDate, moveOutDate }
├─ keys[]   { label, type, description, quantity, photoIds[] }
├─ meters[] { kind, label, reference, provider, reading, readingDate, location, photoIds[], entryReading? }
├─ rooms[]  { name, generalState[] {label, value}, comment, photoIds[],
│             sections[] { name, items[] } }
│     Item { name, condition, comment, characteristics[], parts[], issues[] {type, comment},
│            photoIds[], entry? { condition, comment, issues, photoIds } }
├─ generalComment
└─ signatures { place, tenant?, landlord? }   (PNG data URL)

PhotoRecord (store séparé) { id, inspectionId, blob (JPEG ≤ 2000 px), thumb (480 px), width, height, source }
```

Échelle d'état : Neuf · Très bon · Bon · Usagé · Mauvais · Hors service.
Sortie : l'état d'entrée est figé dans `item.entry` (photos dupliquées) → comparaison et détection de dégradation.

## 3. Parcours et écrans

```
Accueil ─► Nouveau (Entrée | Sortie) ─► Point de départ (Modèle PDF | Entrée existante | Vierge)
   │
   └─► Vue d'ensemble ─┬─► Informations générales
                       ├─► Clés / Compteurs
                       ├─► Pièce ──► Élément ──(Suivant)──► Élément … ──► Récapitulatif
                       └─► Récapitulatif ─► Signatures ─► Valider ─► PDF (télécharger / e-mail / aperçu)
```

Principes UX terrain :
- **Saisie séquentielle** : bouton « Suivant » persistant qui enchaîne tous les éléments, pièces comprises.
- **Photo en 1 tap** : bouton appareil photo principal sur chaque élément ; galerie/fichier ou glisser-déposer sur ordinateur.
- **Gros CTA** en barre basse (54 px), cibles ≥ 48 px, sélection d'état en grille de 6 boutons colorés.
- **Accélérateurs** : « Remplir les éléments restants », « Identique à l'entrée », suggestions de commentaire.
- **Autosave** : écriture IndexedDB 400 ms après chaque modification + flush quand l'app passe en arrière-plan ; indicateur « Enregistré » permanent.
- Récapitulatif bloquant en douceur : éléments non renseignés, infos manquantes, points d'attention cliquables.
- Photo : remplacer (meilleure qualité), déplacer vers un autre élément, définir en couverture, supprimer.

## 4. Choix techniques

- React 19 + TypeScript + Vite, aucun framework UI ni routeur (hash routing maison).
- IndexedDB natif (inspections + photos en Blob), `navigator.storage.persist()` demandé à la création.
- PDF côté client avec jsPDF (couverture, synthèse, clés, compteurs, pièces avec photos, comparaison entrée/sortie, signatures, pagination).
- E-mail : Web Share API (PDF joint automatiquement sur mobile, nécessite HTTPS) ; repli téléchargement + `mailto:` prérempli.
- Sauvegarde/restauration JSON (photos incluses) pour changer d'appareil ou archiver.
