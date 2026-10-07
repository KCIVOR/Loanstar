from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


OUTPUT = Path("output/pdf/loanstar-turnover-services.pdf")


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    styles = getSampleStyleSheet()
    title = ParagraphStyle(
        "TurnoverTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=22,
        leading=27,
        textColor=colors.HexColor("#113E57"),
        alignment=TA_LEFT,
        spaceAfter=4 * mm,
    )
    subtitle = ParagraphStyle(
        "TurnoverSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#5C6B73"),
        spaceAfter=10 * mm,
    )
    cell = ParagraphStyle(
        "Cell",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#1F2933"),
    )
    header = ParagraphStyle(
        "Header",
        parent=cell,
        fontName="Helvetica-Bold",
        textColor=colors.white,
    )

    rows = [
        [Paragraph("Service", header), Paragraph("Purpose", header)],
        [Paragraph("Vercel", cell), Paragraph("Hosts and deploys the LoanStar web application.", cell)],
        [Paragraph("Supabase", cell), Paragraph("Provides the database, user authentication, file storage, and scheduled system tasks.", cell)],
        [Paragraph("Domain / DNS Provider", cell), Paragraph("Manages the system's custom domain name and DNS settings.", cell)],
        [Paragraph("SMTP Email Provider", cell), Paragraph("Sends transactional emails such as account notifications, approval/decline emails, and reminders.", cell)],
        [Paragraph("OpenAI API", cell), Paragraph("Powers AI-generated reports and the reporting assistant.", cell)],
    ]

    document = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        leftMargin=22 * mm,
        rightMargin=22 * mm,
        topMargin=24 * mm,
        bottomMargin=22 * mm,
        title="LoanStar Turnover Services",
        author="LoanStar",
    )
    table = Table(rows, colWidths=[50 * mm, 116 * mm], repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0E7490")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CBD5E1")),
        ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F8FAFC")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#FFFFFF"), colors.HexColor("#F8FAFC")]),
        ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
    ]))
    document.build([
        Paragraph("LoanStar System", title),
        Paragraph("Service Requirements for Client Turnover", subtitle),
        table,
        Spacer(1, 8 * mm),
        Paragraph("Note: OpenAI API is only required when AI reporting features are enabled.", subtitle),
    ])


if __name__ == "__main__":
    main()
