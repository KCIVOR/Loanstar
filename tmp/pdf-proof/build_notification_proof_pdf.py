from pathlib import Path
import re
from html import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, KeepTogether,
)

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs/superpowers/plans/2026-09-22-notification-wiring-validation-proof.md"
OUTPUT = ROOT / "output/pdf/notification-wiring-validation-proof-2026-09-22.pdf"


def clean(value: str) -> str:
    replacements = {
        "\u2014": " - ", "\u2013": "-", "\u2018": "'", "\u2019": "'",
        "\u201c": '"', "\u201d": '"', "\u2026": "...", "\u2192": "->",
        "\u20b1": "PHP ", "\u00a0": " ",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    return value


def inline(value: str) -> str:
    value = escape(clean(value.strip()))
    value = re.sub(r"`([^`]+)`", r"<font name='Courier' size='7'>\1</font>", value)
    value = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", value)
    return value


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="TitleCustom", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=20, leading=24, textColor=colors.HexColor("#102a43"), spaceAfter=7,
))
styles.add(ParagraphStyle(
    name="Subtitle", parent=styles["Normal"], fontName="Helvetica",
    fontSize=9, leading=13, textColor=colors.HexColor("#486581"), spaceAfter=12,
))
styles.add(ParagraphStyle(
    name="HeadingCustom", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=13, leading=16, textColor=colors.HexColor("#102a43"),
    spaceBefore=14, spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="BodyCustom", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=8.6, leading=12.2, spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="BulletCustom", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=8.4, leading=11.5, leftIndent=12, firstLineIndent=-8, spaceAfter=3,
))
styles.add(ParagraphStyle(
    name="TableHead", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=6.7, leading=8.2, textColor=colors.white,
))
styles.add(ParagraphStyle(
    name="TableCell", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=6.45, leading=8.0,
))
styles.add(ParagraphStyle(
    name="Callout", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=8.7, leading=12.2, textColor=colors.HexColor("#7c2d12"),
))


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#d9e2ec"))
    canvas.line(doc.leftMargin, 13 * mm, A4[0] - doc.rightMargin, 13 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor("#627d98"))
    canvas.drawString(doc.leftMargin, 8 * mm, "Loan Star - Notification Wiring Validation Proof")
    canvas.drawRightString(A4[0] - doc.rightMargin, 8 * mm, f"Page {doc.page}")
    canvas.restoreState()


def parse_table(lines):
    rows = []
    for line in lines:
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if all(re.fullmatch(r"[-: ]+", cell) for cell in cells):
            continue
        rows.append(cells)
    if not rows:
        return None
    width = A4[0] - 32 * mm
    columns = len(rows[0])
    if columns == 2:
        widths = [width * .42, width * .58]
    elif columns == 4:
        widths = [width * .31, width * .16, width * .21, width * .32]
    else:
        widths = [width / columns] * columns
    data = []
    for row_number, row in enumerate(rows):
        row = row + [""] * (columns - len(row))
        style = styles["TableHead"] if row_number == 0 else styles["TableCell"]
        data.append([Paragraph(inline(cell), style) for cell in row[:columns]])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#243b53")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), .25, colors.HexColor("#bcccdc")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f0f4f8")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    return table


def build():
    markdown = SOURCE.read_text(encoding="utf-8").splitlines()
    story = []
    index = 0
    while index < len(markdown):
        line = markdown[index]
        if not line.strip() or line.strip() == "---":
            index += 1
            continue
        if line.startswith("# "):
            story.append(Paragraph(inline(line[2:]), styles["TitleCustom"]))
            story.append(Paragraph("Validated 22 September 2026 | Source and live-database validation", styles["Subtitle"]))
        elif line.startswith("## "):
            heading = line[3:].strip()
            if heading.startswith("Payment-proof authorization finding"):
                story.append(PageBreak())
            story.append(Paragraph(inline(heading), styles["HeadingCustom"]))
        elif line.startswith("|"):
            end = index
            block = []
            while end < len(markdown) and markdown[end].startswith("|"):
                block.append(markdown[end])
                end += 1
            table = parse_table(block)
            if table:
                story.append(table)
                story.append(Spacer(1, 7))
            index = end - 1
        elif re.match(r"^\d+\. ", line):
            number, content = line.split(". ", 1)
            story.append(Paragraph(f"{number}. {inline(content)}", styles["BulletCustom"]))
        elif line.startswith("- "):
            story.append(Paragraph(f"- {inline(line[2:])}", styles["BulletCustom"]))
        else:
            target_style = styles["Callout"] if "not production-ready" in clean(line).lower() else styles["BodyCustom"]
            story.append(Paragraph(inline(line), target_style))
        index += 1

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document = SimpleDocTemplate(
        str(OUTPUT), pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm,
        topMargin=15 * mm, bottomMargin=19 * mm, title="Notification Wiring Validation Proof",
        author="Loan Star",
    )
    document.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    build()
