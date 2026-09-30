import json
import sys
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

NAVY = RGBColor(0x36, 0x5F, 0x91)
ACCENT = RGBColor(0x4F, 0x81, 0xBD)
MUTED = RGBColor(0x5A, 0x5A, 0x5A)


def set_font(run, size=None, bold=None, color=None):
    run.font.name = "Calibri"
    run._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    run._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    if size: run.font.size = Pt(size)
    if bold is not None: run.font.bold = bold
    if color: run.font.color.rgb = color


def field(paragraph, code):
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar"); begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText"); instr.set(qn("xml:space"), "preserve"); instr.text = code
    end = OxmlElement("w:fldChar"); end.set(qn("w:fldCharType"), "end")
    run._r.extend([begin, instr, end])


def heading(doc, text, level=1):
    p = doc.add_paragraph(style=f"Heading {level}")
    run = p.add_run(text)
    set_font(run, 14 if level == 1 else 13, True, NAVY if level == 1 else ACCENT)
    p.paragraph_format.space_before = Pt(24 if level == 1 else 10)
    p.paragraph_format.space_after = Pt(7)
    return p


def build(content, target):
    doc = Document()
    section = doc.sections[0]
    section.top_margin = Inches(1); section.bottom_margin = Inches(1)
    section.left_margin = Inches(1.25); section.right_margin = Inches(1.25)
    normal = doc.styles["Normal"]
    normal.font.name = "Calibri"; normal.font.size = Pt(10.5)
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.12
    header = section.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    set_font(header.add_run(f"{content['app_name']} System User Manual"), 9, False, MUTED)

    for _ in range(7): doc.add_paragraph()
    title = doc.add_paragraph(style="Title"); title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_font(title.add_run(content["app_name"]), 26, True)
    subtitle = doc.add_paragraph(); subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_font(subtitle.add_run(content["manual_title"]), 18, False, MUTED)
    doc.add_paragraph()
    meta = doc.add_paragraph(); meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_font(meta.add_run(f"Version {content['version']} | {content['date']}"), 10, False, MUTED)
    doc.add_page_break()

    heading(doc, "Table of Contents")
    toc = doc.add_paragraph(); field(toc, r'TOC \\o "1-2" \\h \\z \\u')
    note = doc.add_paragraph("In Word, right-click the table of contents and choose Update Field to show page numbers.")
    for run in note.runs: set_font(run, 9, False, MUTED); run.font.italic = True
    doc.add_page_break()

    heading(doc, "Introduction")
    for para in content["introduction"].split("\n\n"):
        doc.add_paragraph(para)
    doc.add_page_break()

    for feature in content["features"]:
        heading(doc, feature["title"])
        heading(doc, "What it is for", 2)
        audience = feature.get("audience", "Users with access to this work area")
        doc.add_paragraph(f"Who uses this: {audience}. {feature['purpose']}")
        heading(doc, "Where to find it", 2); doc.add_paragraph(feature["location"])
        heading(doc, "Screenshot guide", 2)
        guide = doc.add_table(rows=1, cols=1)
        guide.autofit = False
        cell = guide.cell(0, 0)
        cell.width = Inches(6)
        cell.text = f"Add an approved LoanStar screen capture for: {feature['location']}"
        cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
        cell.paragraphs[0].paragraph_format.space_before = Pt(34)
        cell.paragraphs[0].paragraph_format.space_after = Pt(34)
        for run in cell.paragraphs[0].runs:
            set_font(run, 9, False, MUTED); run.font.italic = True
        heading(doc, "Steps", 2)
        for step in feature["steps"]: doc.add_paragraph(step, style="List Number")
        if feature.get("tips"):
            heading(doc, "Tips and things to watch out for", 2)
            for tip in feature["tips"]: doc.add_paragraph(tip, style="List Bullet")

    doc.add_page_break(); heading(doc, "Appendix Items Needing Clarification")
    for item in content["needs_clarification"]:
        p = doc.add_paragraph(style="List Bullet"); set_font(p.add_run(item["item"]), bold=True)
        doc.add_paragraph(item["reason"])
    footer = section.footer.paragraphs[0]; footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer.add_run("Page "); field(footer, "PAGE"); footer.add_run(" of "); field(footer, "NUMPAGES")
    doc.save(target)


if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as source:
        build(json.load(source), sys.argv[2])
