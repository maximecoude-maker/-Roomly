# État des lieux — application mobile-first

Réalisation d'états des lieux d'entrée et de sortie sur smartphone : saisie pièce par pièce, photos, constats, comparaison entrée/sortie, signatures et PDF final. Fonctionne entièrement en local (données dans le navigateur, aucun serveur).

Conception détaillée (analyse du PDF, modèle de données, parcours) : [docs/CONCEPTION.md](docs/CONCEPTION.md).

## Lancer

```bash
npm install
npm run dev
```

- Ordinateur : http://localhost:5190
- Smartphone sur le même Wi-Fi : l'adresse « Network » affichée par Vite (ex. `http://192.168.1.20:5190`).

Pour l'envoi par e-mail avec PDF joint depuis le téléphone (partage natif), servir en HTTPS :

```bash
npm run dev:https
```

Accepter l'avertissement de certificat auto-signé sur le téléphone. En HTTP, l'app bascule sur « télécharger + e-mail prérempli ».

## Fonctionnalités

- Création : **Entrée** ou **Sortie** ; départ depuis le modèle issu du PDF, un logement vierge, ou (sortie) un état d'entrée existant.
- Structure éditable : pièces, rubriques, éléments, caractéristiques, parties, constats (ajout, renommage, suppression, duplication, réordonnancement des pièces).
- Photos : appareil photo, galerie, fichier, glisser-déposer ; remplacer, déplacer, définir en couverture, supprimer. Compression automatique (2000 px JPEG).
- Sauvegarde automatique continue (IndexedDB) + export/import d'une sauvegarde `.json` (photos incluses).
- Récapitulatif : éléments non renseignés, informations manquantes, points d'attention, signatures tactiles.
- PDF professionnel : téléchargement, aperçu, envoi par e-mail.

## Remplacer les photos du modèle par les originaux

Deux options :

1. **Dans l'app** : ouvrir la photo › *Remplacer* › choisir l'original (garde le rattachement).
2. **Dans le modèle** (pour tous les futurs états des lieux) : remplacer le fichier de même nom dans `public/seed/` — les noms suivent la structure, ex. `cuisine-appareils-four-1.jpg`, `sejour-meubles-decorations-grand-canape-1.jpg`. Mettre à jour `width`/`height` dans `src/seed/template.json` si le ratio change.

Régénérer le modèle depuis le PDF :

```bash
uv run --with pymupdf python3 tools/extract_template.py "/chemin/Etat des lieux.pdf"
```

## Limites connues (v1)

- Données stockées dans le navigateur de l'appareil utilisé : exporter une sauvegarde avant de vider le cache ou de changer d'appareil.
- Envoi e-mail sans serveur : pièce jointe automatique uniquement via le partage natif (HTTPS mobile).
- Photos HEIC : prises en charge si le navigateur sait les décoder (Safari iOS oui, Chrome desktop non).
