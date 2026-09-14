"""Extrait la structure et les photos du PDF d'etat des lieux source.

Usage : uv run --with pymupdf python3 tools/extract_template.py <chemin.pdf>
Produit : src/seed/template.json et public/seed/*.jpg
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / "src" / "seed" / "template.json"
OUT_IMG = ROOT / "public" / "seed"

HEADING = re.compile(r"^(\d+(?:\. \d+)*)\. (.+)$")
CONDITIONS = {"Neuf": "neuf", "Très bon": "tres_bon", "Bon": "bon", "Usagé": "usage", "Mauvais": "mauvais"}
IGNORED_XREFS = {26, 165}  # logo de pied de page, pictogramme d'alerte


def decode(text):
    """Le PDF encode les petites capitales dans une plage Unicode decalee."""
    out = []
    for ch in text:
        code = ord(ch)
        if 0x3FB <= code <= 0x414:
            out.append(chr(code - 0x39A))
        else:
            out.append({"Ш": "é", "Ю": "è", "Ы": "ê"}.get(ch, ch))
    return "".join(out)


def slug(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def page_events(page):
    events = []
    for block in page.get_text("dict")["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            text = "".join(decode(s["text"]) for s in line["spans"]).strip()
            x0, y0 = line["bbox"][0], line["bbox"][1]
            if text and 40 <= y0 <= 770:
                events.append({"k": "T", "y": round(y0), "x": round(x0), "t": text})
    for img in page.get_images(full=True):
        if img[0] in IGNORED_XREFS:
            continue
        for rect in page.get_image_rects(img[0]):
            events.append({"k": "I", "y": round(rect.y0), "x": round(rect.x0), "xref": img[0]})
    events.sort(key=lambda e: (e["y"], e["x"]))
    return events


class Exporter:
    def __init__(self, doc):
        self.doc = doc
        self.count = 0
        OUT_IMG.mkdir(parents=True, exist_ok=True)

    def save(self, xref, name):
        info = self.doc.extract_image(xref)
        pix = pymupdf.Pixmap(self.doc, xref)
        if pix.n - pix.alpha >= 4:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        filename = f"{name}.jpg"
        pix.save(str(OUT_IMG / filename), jpg_quality=92) if info["ext"] != "jpeg" else (OUT_IMG / filename).write_bytes(info["image"])
        self.count += 1
        return {"file": filename, "width": info["width"], "height": info["height"]}


def new_item(name):
    return {"name": name, "condition": None, "comment": "", "characteristics": [], "parts": [], "issues": [], "photos": []}


def parse_rooms(doc, exporter):
    """Parcourt les pages Interieur et Installations techniques dans l'ordre de lecture."""
    rooms, room, section, target, path = [], None, None, None, []
    mode, last_kv, seen = None, None, set()
    for page_no in range(5, 20):
        for ev in page_events(doc[page_no]):
            if ev["k"] == "I":
                if target is not None:
                    name = f"{slug('-'.join(path))}-{len(target['photos']) + 1}"
                    target["photos"].append(exporter.save(ev["xref"], name))
                continue
            text, x, y = ev["t"], ev["x"], ev["y"]
            match = HEADING.match(text)
            if match:
                number = match.group(1)
                if number in seen:
                    continue
                seen.add(number)
                depth = len(number.split(". "))
                label = match.group(2).split(" > ")[-1]
                mode, last_kv = None, None
                if depth == 2:
                    name = "Installations techniques" if number.startswith("4") else label
                    room = {"name": name, "generalState": [], "comment": "", "photos": [], "sections": []}
                    rooms.append(room)
                    section, target, path = None, room, [name]
                elif depth == 3:
                    section = {"name": label, "items": [], "photos": []}
                    room["sections"].append(section)
                    target, path = section, [room["name"], label]
                elif depth == 4:
                    item = new_item(label)
                    section["items"].append(item)
                    target, path = item, [room["name"], section["name"], label]
                continue
            if text.startswith("État : "):
                target["condition"] = CONDITIONS[text[7:]]
                mode = None
                continue
            if text in ("Etat général", "Condition structurelle"):
                mode = "general"
                continue
            if text in ("Caractéristiques", "Parties", "Constat"):
                mode = {"Caractéristiques": "characteristics", "Parties": "parts", "Constat": "issueRows"}[text]
                continue
            if mode is None:
                continue
            if x >= 125 and last_kv is not None and abs(last_kv["y"] - y) <= 1:
                last_kv["entry"]["value"] = text
                continue
            if x < 125 and last_kv is not None and 0 < y - last_kv["y"] <= 10 and last_kv["entry"]["value"]:
                last_kv["entry"]["label"] += " " + text
                last_kv["y"] = y
                continue
            entry = {"label": text, "value": ""}
            if mode == "general":
                room["generalState"].append(entry)
            else:
                target.setdefault(mode, []).append(entry)
            last_kv = {"y": y, "entry": entry}
    for room in rooms:
        promote_leaf_sections(room)
    return rooms


def promote_leaf_sections(room):
    """Une rubrique de niveau 3 sans sous-elements (ex : Etagere) devient un element."""
    for section in list(room["sections"]):
        if section["items"]:
            section.pop("photos")
            continue
        item = new_item(section["name"])
        for key in ("condition", "characteristics", "parts", "photos", "issueRows"):
            if key in section:
                item[key] = section[key]
        room["sections"].remove(section)
        dest = next((s for s in room["sections"] if s["name"] == "Meubles & décorations"), None)
        if dest is None:
            dest = {"name": "Équipements", "items": []}
            room["sections"].append(dest)
        dest["items"].insert(0, item)
    for section in room["sections"]:
        for item in section["items"]:
            rows = {r["label"]: r["value"] for r in item.pop("issueRows", [])}
            if rows:
                item["issues"].append({"type": rows.get("Type", ""), "comment": rows.get("Commentaires", "")})


def main(pdf_path):
    doc = pymupdf.open(pdf_path)
    exporter = Exporter(doc)
    rooms = parse_rooms(doc, exporter)
    template = {
        "sourcePdf": Path(pdf_path).name,
        "property": {
            "reference": "T5 100m² Lorient Gal Leclerc",
            "address": "7 Boulevard du Général Leclerc",
            "postalCode": "56100",
            "city": "LORIENT",
            "description": "T5 100 m²",
            "cover": exporter.save(10, "couverture"),
        },
        "parties": {
            "landlord": "SARL C.FAMILY INVEST",
            "manager": "Romain Coudé",
            "executedBy": "Romain Coudé",
            # Donnees personnelles du locataire volontairement non reprises (modele potentiellement publie).
            "tenant": {"name": "", "phone": "", "email": "", "birthDate": "", "birthPlace": ""},
        },
        "dates": {"inspectionDate": "2024-01-20", "leaseStart": "2023-12-31", "moveInDate": "2024-01-27"},
        "keys": [
            {"label": "Entrée commune", "type": "Clé", "description": "Noire", "quantity": 4, "photos": [exporter.save(55, "cles-entree-commune")]},
            {"label": "Porte d'entrée", "type": "Clé", "description": "Noire", "quantity": 4, "photos": [exporter.save(56, "cles-porte-entree")]},
            {"label": "Boîte aux lettres", "type": "Clé", "description": "", "quantity": 1, "photos": [exporter.save(57, "cles-boite-aux-lettres")]},
        ],
        "meters": [
            {"kind": "electricite", "label": "Compteur d'électricité", "reference": "14848046268402", "provider": "EDF", "reading": "", "readingDate": "2024-01-20", "location": "", "photos": []},
            {"kind": "eau", "label": "Compteur d'eau", "reference": "", "provider": "Saur via copropriété", "reading": "1211827", "readingDate": "2024-01-20", "location": "Cuisine", "photos": [exporter.save(63, "compteur-eau")]},
        ],
        "rooms": rooms,
    }
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(template, ensure_ascii=False, indent=2))
    print(f"{len(rooms)} pieces, {exporter.count} photos -> {OUT_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    main(sys.argv[1])
