"""Turn a price catalogue PDF into page images and a searchable data.json.

Usage: python extract_price.py <catalogue.pdf> <out_dir> "<title>"
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import fitz

PAGE_WIDTH = 1100
THUMB_WIDTH = 320
COVER_MAX_CHARS = 260
COVER_FONT = 18
MODEL = re.compile(r"^[A-ZĐ][A-Z0-9Đ.\-/]*(?:\s+[A-Z0-9Đ.\-/x]+)*$")
NUMBERED = re.compile(r"^\d+\.\s+")
LAST_CELL_PAD = 30
PRICE = re.compile(r"^\d{1,3}(?:[.,]\d{3})+$")


def fold(text):
    """Lowercase and strip Vietnamese diacritics so 'den duong' matches 'Đèn đường'."""
    text = text.replace("Đ", "D").replace("đ", "d")
    text = unicodedata.normalize("NFD", text)
    return "".join(c for c in text if unicodedata.category(c) != "Mn").lower()


def clean(text):
    return re.sub(r"\s+", " ", text or "").strip()


def is_model(cell):
    cell = clean(cell)
    if not 4 <= len(cell) <= 40 or not MODEL.match(cell) or not re.search(r"\d", cell):
        return False
    return "/" in cell or "." in cell or re.search(r"\d+W\b", cell) is not None


def big_spans(page, size):
    return [s["text"].strip() for b in page.get_text("dict")["blocks"] for l in b.get("lines", [])
            for s in l["spans"] if s["size"] >= size and s["text"].strip()]


def cover_name(page):
    parts = []
    for text in big_spans(page, COVER_FONT):
        if text.isupper() and not re.match(r"^[\d°C W]+$", text) and text not in parts:
            parts.append(text)
    name = clean(" ".join(parts)).capitalize()
    return re.sub(r"\bled\b", "LED", name)


def cell_text(page, rect, is_last):
    """Read a cell with its spaces intact; the last column is padded because prices overflow it."""
    box = fitz.Rect(rect)
    if is_last:
        box.x1 += LAST_CELL_PAD
    return clean(page.get_textbox(box))


def table_rows(page):
    """Yield (labels, values) for every model row; merged cells inherit the value above."""
    for table in page.find_tables().tables:
        labels, previous = None, []
        for row in table.rows:
            last = len(row.cells) - 1
            cells = [cell_text(page, c, i == last) if c else None for i, c in enumerate(row.cells)]
            cells = [c if c is not None else (previous[i] if i < len(previous) else "")
                     for i, c in enumerate(cells)]
            first = NUMBERED.sub("", cells[0]) if cells else ""
            if first.lower() == "model":
                labels = cells
            elif labels and is_model(first):
                cells[0] = first
                previous = cells
                yield labels, cells


def text_models(page):
    lines = [clean(l) for l in page.get_text().splitlines()]
    seen = []
    for line in lines:
        line = NUMBERED.sub("", line)
        if is_model(line) and line not in seen:
            seen.append(line)
    return seen


def to_number(price):
    return int(re.sub(r"\D", "", price)) if PRICE.match(price) else None


def product_from_row(labels, cells, number, section):
    specs, price = [], ""
    for label, value in zip(labels[1:], cells[1:]):
        if not value:
            continue
        if label.lower().startswith("giá"):
            price = value
        else:
            specs.append([label, value])
    model = clean(cells[0])
    return {"m": model, "p": number, "s": section, "v": specs, "price": price, "n": to_number(price)}


def render(page, out, number):
    for folder, width, quality in (("pages", PAGE_WIDTH, 72), ("thumbs", THUMB_WIDTH, 60)):
        scale = width / page.rect.width
        page.get_pixmap(matrix=fitz.Matrix(scale, scale)).pil_save(
            out / folder / f"{number}.webp", format="WEBP", quality=quality)


def main(pdf, out, title):
    doc = fitz.open(pdf)
    out = Path(out)
    for folder in ("pages", "thumbs"):
        (out / folder).mkdir(parents=True, exist_ok=True)

    sections, pages, products, section = [], [], [], ""
    for index, page in enumerate(doc):
        number = index + 1
        render(page, out, number)
        text = page.get_text()
        if len(text.strip()) < COVER_MAX_CHARS and big_spans(page, COVER_FONT):
            section = cover_name(page)
            sections.append({"s": section, "p": number})

        found = [product_from_row(l, c, number, section) for l, c in table_rows(page)]
        known = {p["m"] for p in found}
        found += [{"m": m, "p": number, "s": section, "v": [], "price": "", "n": None}
                  for m in text_models(page) if m not in known]
        products += found
        pages.append({"n": number, "s": section, "m": [p["m"] for p in found],
                      "f": fold(section + " " + text)})
        print(f"\rpage {number}/{doc.page_count}", end="", file=sys.stderr)

    data = {"title": title, "pages": len(pages), "toc": sections, "pageList": pages, "products": products}
    (out / "data.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    priced = sum(1 for p in products if p["n"])
    print(f"\n{len(sections)} sections, {len(products)} models, {priced} with price", file=sys.stderr)


if __name__ == "__main__":
    main(*sys.argv[1:4])
