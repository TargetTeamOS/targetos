"""
Target Team — Offer For Sale of Real Estate PDF Generator
Produces a pixel-accurate replica of the official form,
filled with the submitted offer data.
"""

from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import io, json, sys, os

W, H = letter  # 612 x 792 points

def fmt_money(v):
    if not v: return ''
    try:
        n = float(str(v).replace('$','').replace(',',''))
        return '${:,.0f}'.format(n)
    except: return str(v)

def fmt_date(v):
    if not v: return ''
    try:
        from datetime import datetime
        d = datetime.strptime(str(v), '%Y-%m-%d')
        return '{}/{}/{}'.format(d.month, d.day, d.year)
    except: return str(v)

def generate_offer_pdf(data: dict, output_path: str):
    c = canvas.Canvas(output_path, pagesize=letter)
    c.setTitle('Offer For Sale of Real Estate — ' + data.get('listing_addr',''))

    # ── BRAND COLORS ──────────────────────────────────────────────
    RED   = colors.HexColor('#CC2200')
    NAVY  = colors.HexColor('#1B2B4B')
    BLACK = colors.black
    GRAY  = colors.HexColor('#666666')
    LGRAY = colors.HexColor('#DDDDDD')

    def font(name='Helvetica', size=10):
        c.setFont(name, size)

    def text(x, y, txt, bold=False, size=10, color=BLACK):
        c.setFillColor(color)
        c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
        c.drawString(x, y, str(txt))

    def rtext(x, y, txt, bold=False, size=10, color=BLACK):
        """Right-aligned text"""
        c.setFillColor(color)
        c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
        c.drawRightString(x, y, str(txt))

    def ctext(x, y, txt, bold=False, size=10, color=BLACK):
        """Centered text"""
        c.setFillColor(color)
        c.setFont('Helvetica-Bold' if bold else 'Helvetica', size)
        c.drawCentredString(x, y, str(txt))

    def hline(x1, y, x2, width=0.5, color=BLACK):
        c.setStrokeColor(color)
        c.setLineWidth(width)
        c.line(x1, y, x2, y)

    def vline(x, y1, y2, width=0.5, color=BLACK):
        c.setStrokeColor(color)
        c.setLineWidth(width)
        c.line(x, y1, x, y2)

    def rect(x, y, w, h, fill=None, stroke=BLACK, lw=0.5):
        c.setLineWidth(lw)
        c.setStrokeColor(stroke)
        if fill:
            c.setFillColor(fill)
            c.rect(x, y, w, h, fill=1, stroke=1)
        else:
            c.rect(x, y, w, h, fill=0, stroke=1)

    def checkbox(x, y, checked=False, size=9):
        c.setStrokeColor(BLACK)
        c.setLineWidth(0.8)
        c.rect(x, y, size, size, fill=0, stroke=1)
        if checked:
            c.setStrokeColor(BLACK)
            c.setLineWidth(1.2)
            c.line(x+1, y+1, x+size-1, y+size-1)
            c.line(x+size-1, y+1, x+1, y+size-1)

    def field_line(x, y, width, value='', size=10):
        """Draw a filled line with value"""
        hline(x, y, x+width, 0.5)
        if value:
            text(x+2, y+2, str(value), size=size)

    margin_l = 0.55 * inch
    margin_r = W - 0.55 * inch
    y = H - 0.4*inch

    # ── RED TRIANGLE (top-left decoration) ──────────────────────
    c.setFillColor(RED)
    p = c.beginPath()
    p.moveTo(0, H)
    p.lineTo(1.1*inch, H)
    p.lineTo(0, H - 1.4*inch)
    p.close()
    c.drawPath(p, fill=1, stroke=0)

    # ── LOGOS ─────────────────────────────────────────────────────
    # TARGET TEAM text logo (center)
    c.setFillColor(NAVY)
    ctext(W/2, H - 0.45*inch, 'TARGET', bold=True, size=22, color=NAVY)
    ctext(W/2, H - 0.65*inch, 'TEAM', bold=True, size=16, color=NAVY)
    # KW VALLEY REALTY (right)
    c.setFillColor(RED)
    text(W - 2.3*inch, H - 0.42*inch, 'kw VALLEY REALTY', bold=True, size=11, color=RED)
    text(W - 2.3*inch, H - 0.58*inch, 'KELLERWILLIAMS.', size=8, color=NAVY)
    # Tagline
    ctext(W/2, H - 0.82*inch, 'M A K I N G   D E A L S   H A P P E N', size=7, color=GRAY)

    # ── TITLE ──────────────────────────────────────────────────────
    y = H - 1.05*inch
    ctext(W/2, y, 'OFFER FOR THE SALE OF REAL ESTATE', bold=True, size=14, color=NAVY)
    hline(margin_l, y - 3, margin_r, 1.5, NAVY)

    # ── DATE ──────────────────────────────────────────────────────
    y -= 0.28*inch
    text(W - 2.8*inch, y, 'Date', size=9)
    offer_date = fmt_date(data.get('offer_date',''))
    if offer_date:
        parts = offer_date.split('/')
        if len(parts) == 3:
            text(W - 2.4*inch, y, parts[0], size=9)
            text(W - 2.15*inch, y, parts[1], size=9)
            text(W - 1.85*inch, y, parts[2], size=9)
    hline(W - 2.5*inch, y-2, W - 2.3*inch, 0.5)
    text(W - 2.3*inch, y, '/', size=9)
    hline(W - 2.25*inch, y-2, W - 2.0*inch, 0.5)
    text(W - 2.0*inch, y, '/', size=9)
    hline(W - 1.95*inch, y-2, W - 1.55*inch, 0.5)

    # ── PROPERTY INFORMATION ──────────────────────────────────────
    y -= 0.22*inch
    text(margin_l, y, 'PROPERTY INFORMATION', bold=True, size=10, color=NAVY)

    y -= 0.22*inch
    text(margin_l, y, 'Address:', size=9)
    addr_x = margin_l + 0.55*inch
    field_line(addr_x, y - 2, 4.5*inch, data.get('listing_addr',''), size=9)

    text(W - 2.1*inch, y, 'MLS ID#', size=9)
    field_line(W - 1.55*inch, y - 2, 1.0*inch, data.get('mls_number',''), size=9)

    # ── BUYER | SELLER HEADERS ────────────────────────────────────
    y -= 0.3*inch
    col_mid = W / 2
    ctext(col_mid / 2 + margin_l / 2, y, 'BUYER', bold=True, size=11, color=NAVY)
    ctext((col_mid + margin_r) / 2, y, 'SELLER', bold=True, size=11, color=NAVY)
    hline(margin_l, y - 4, margin_r, 0.5, LGRAY)

    # Buyer / Seller rows
    y -= 0.25*inch
    text(margin_l, y, 'Buyer:', size=9)
    field_line(margin_l + 0.45*inch, y-2, col_mid - margin_l - 0.55*inch, data.get('buyer_name',''), size=9)
    text(col_mid + 0.1*inch, y, 'Seller:', size=9)
    field_line(col_mid + 0.55*inch, y-2, margin_r - col_mid - 0.65*inch, data.get('seller_name',''), size=9)

    y -= 0.22*inch
    text(margin_l, y, 'Co-Buyer:', size=9)
    field_line(margin_l + 0.62*inch, y-2, col_mid - margin_l - 0.72*inch, data.get('co_buyer_name',''), size=9)
    text(col_mid + 0.1*inch, y, 'Co-Seller:', size=9)
    field_line(col_mid + 0.68*inch, y-2, margin_r - col_mid - 0.78*inch, data.get('co_seller_name',''), size=9)

    # ── FINANCIAL BOX + SUBJECT TO ────────────────────────────────
    y -= 0.15*inch
    box_top = y
    box_h   = 1.85*inch
    box_mid = col_mid - 0.1*inch

    rect(margin_l - 2, y - box_h, box_mid - margin_l + 4, box_h, stroke=NAVY, lw=1)
    rect(box_mid + 2, y - box_h, margin_r - box_mid - 2, box_h, stroke=NAVY, lw=1)

    # Financial rows
    fin_rows = [
        ('Purchase Price', 'purchase_price', True),
        ('Deposit upon contract', 'deposit', False),
        ("Seller's Concession", 'sellers_concession', False),
        ('Net to Seller', 'net_to_seller', False),
        ('Mortgage Amount', 'mortgage_amount', False),
        ('Mortgage Amount', 'mortgage_pct', False),
        ('Balance at Closing', 'balance_at_closing', False),
    ]
    row_h = box_h / (len(fin_rows) + 1)
    fy = box_top - row_h * 0.6

    for i, (label, key, bold) in enumerate(fin_rows):
        ry = fy - i * row_h
        text(margin_l + 4, ry, label, bold=bold, size=8.5)
        # $ or % prefix
        is_pct = key == 'mortgage_pct'
        prefix = '%' if is_pct else '$'
        val = data.get(key, '')
        val_str = (str(val) + '%') if (is_pct and val) else fmt_money(val) if not is_pct else ''
        text(box_mid - 1.5*inch, ry, prefix, size=8.5)
        field_line(box_mid - 1.4*inch, ry-2, 1.3*inch, val_str, size=8.5)

    # Closing days
    ry = fy - len(fin_rows) * row_h
    text(margin_l + 4, ry, 'Closing time frame', size=8.5)
    field_line(box_mid - 1.4*inch, ry-2, 0.7*inch, data.get('closing_days','30'), size=8.5)
    text(box_mid - 0.6*inch, ry, 'DAYS', size=8.5)

    # Subject to (right box)
    sx = box_mid + 8
    sy = box_top - row_h * 0.5
    text(sx, sy, 'Subject to:', size=9)
    subjects = [
        ('subject_attorney',            'Attorney Approval',       True),
        ('subject_clear_title',         'Clear Title',             True),
        ('subject_mortgage',            'Mortgage',                False),
        ('subject_cash',                'Cash Deal',               False),
        ('subject_standard_inspection', 'Standard home inspections',False),
        ('subject_structural',          'Structural issues only',  False),
    ]
    for j, (key, label, bold) in enumerate(subjects):
        checked = bool(data.get(key, False))
        cy2 = sy - (j+1) * (row_h * 0.85)
        checkbox(sx, cy2 - 2, checked, 8)
        text(sx + 12, cy2, label, bold=bold, size=8.5)

    y = box_top - box_h - 0.18*inch

    # ── ADDITIONAL TERMS ──────────────────────────────────────────
    text(margin_l, y, 'Additional Terms:', size=9)
    additional = data.get('additional_terms','') or ''
    # Split into lines
    words = additional.split()
    lines_terms = []
    cur = ''
    for w in words:
        test = (cur + ' ' + w).strip()
        if len(test) < 95:
            cur = test
        else:
            lines_terms.append(cur)
            cur = w
    if cur: lines_terms.append(cur)
    lines_terms = lines_terms[:3] or ['']

    for k, lt in enumerate(lines_terms):
        ky = y - (k+1)*0.18*inch
        hline(margin_l, ky, margin_r, 0.5)
        if lt: text(margin_l + 2, ky + 2, lt, size=8)

    y -= (len(lines_terms) + 1) * 0.18*inch + 0.05*inch

    # ── BROKER PARAGRAPH ─────────────────────────────────────────
    buyers_ag = data.get('buyers_agent_name','') or ''
    commission = data.get('commission_pct','') or ''
    broker_text = (
        'The seller recognizes Keller Williams Valley Realty, LTD and '
        + buyers_ag.ljust(30, '_') + ' as the brokers who effected this '
        '"meeting of the minds," and agrees to pay a brokerage commission of '
        + (commission + '%').ljust(6,'_') + ' as per MLS or a separate agreement.'
    )
    from reportlab.lib.utils import simpleSplit
    lines_broker = simpleSplit(broker_text, 'Helvetica', 7.5, margin_r - margin_l)
    for li, lb in enumerate(lines_broker[:3]):
        text(margin_l, y - li * 0.14*inch, lb, size=7.5, color=GRAY)

    boilerplate = [
        'This document shall remain in full force and effect unless and until it is superseded by a more formal contract embodying the',
        'same terms and conditions outlined above. This offer is subject to attorney review by both the buyer\'s and the seller\'s attorneys.',
        'ALL CHECKS MUST BE ATTORNEY, BANK, OR CERTIFIED CHECKS.',
    ]
    y -= (len(lines_broker[:3]) + 0.5) * 0.14*inch
    for bi, bl in enumerate(boilerplate):
        style = 'Helvetica-Bold' if 'ALL CHECKS' in bl else 'Helvetica'
        c.setFont(style, 7.5)
        c.setFillColor(GRAY if 'ALL CHECKS' not in bl else BLACK)
        c.drawCentredString(W/2, y - bi * 0.14*inch, bl)

    y -= (len(boilerplate) + 0.3) * 0.14*inch

    # ── AGENTS LINE ───────────────────────────────────────────────
    text(margin_l, y, 'Sellers Agent', size=9)
    field_line(margin_l + 0.85*inch, y-2, 2.2*inch, data.get('sellers_agent_name',''), size=9)
    text(col_mid + 0.1*inch, y, 'Buyers Agent', size=9)
    field_line(col_mid + 0.9*inch, y-2, 2.2*inch, buyers_ag, size=9)

    y -= 0.3*inch

    # ── ATTORNEY SECTIONS ─────────────────────────────────────────
    atty_col_w = (margin_r - margin_l) / 2 - 0.1*inch
    for side, prefix, xoff in [
        ('PURCHASER\'S ATTORNEY', 'purchaser_attorney', margin_l),
        ('SELLER\'S ATTORNEY',    'seller_attorney',    col_mid + 0.1*inch),
    ]:
        ax = xoff
        ctext(ax + atty_col_w/2, y, side, bold=True, size=10, color=NAVY)
        ay = y - 0.2*inch
        for field_label, field_key in [
            ('Name:', prefix + '_name'),
            ('Address:', prefix + '_address'),
            ('Tel:', prefix + '_tel'),
            ('Email:', prefix + '_email'),
        ]:
            text(ax, ay, field_label, size=9)
            label_w = c.stringWidth(field_label, 'Helvetica', 9) + 4
            val = data.get(field_key, '') or ''
            field_line(ax + label_w, ay-2, atty_col_w - label_w, val, size=9)
            ay -= 0.19*inch

    y -= 0.22*inch + 4 * 0.19*inch

    # ── SIGNATURE LINES ───────────────────────────────────────────
    y -= 0.15*inch
    sig_labels = [('Buyer','x'), ('Buyer','x'), ('Agent','x')]
    for side_x in [margin_l, col_mid + 0.1*inch]:
        sy2 = y
        for prefix_lbl, role in sig_labels:
            text(side_x, sy2, 'x', size=9)
            hline(side_x + 0.12*inch, sy2-2, side_x + 2.2*inch, 0.5)
            ctext(side_x + 1.15*inch, sy2 - 0.14*inch,
                  'Buyer' if 'Buyer' in prefix_lbl else 'Seller' if 'Seller' in prefix_lbl else 'Agent',
                  size=7, color=GRAY)
            sy2 -= 0.35*inch

    # ── FOOTER ────────────────────────────────────────────────────
    footer_y = 0.4*inch
    rect(0, footer_y - 0.05*inch, W, 0.45*inch + 0.05*inch, fill=NAVY, stroke=NAVY)
    c.setFillColor(colors.white)

    # Map pin icon area
    text(margin_l, footer_y + 0.22*inch, '123 TICE BOULEVARD', bold=True, size=7.5, color=colors.white)
    text(margin_l, footer_y + 0.1*inch, 'WOODCLIFF LAKE NJ 07677', size=7, color=colors.white)

    ctext(W/2, footer_y + 0.22*inch, 'O: 845.580.4001', size=7.5, color=colors.white)
    ctext(W/2, footer_y + 0.1*inch, 'C: 845.538.6205', size=7.5, color=colors.white)

    rtext(margin_r, footer_y + 0.22*inch, 'ADMIN@TARGETRETEAM.COM', size=7.5, color=colors.white)
    rtext(margin_r, footer_y + 0.1*inch, 'WWW.TARGETRETEAM.COM', size=7.5, color=colors.white)

    c.save()
    print(f'PDF saved to {output_path}')

# ── TEST WITH SAMPLE DATA ──────────────────────────────────────────
if __name__ == '__main__':
    sample = {
        'offer_date': '2026-07-05',
        'listing_addr': '47 Prairie Lane, Monsey NY 10952',
        'mls_number': 'H6123456',
        'buyer_name': 'Moshe & Rivky Goldberg',
        'co_buyer_name': '',
        'seller_name': 'Yosef Cohen',
        'co_seller_name': '',
        'purchase_price': '685000',
        'deposit': '20000',
        'sellers_concession': '5000',
        'net_to_seller': '660000',
        'mortgage_amount': '548000',
        'mortgage_pct': '80',
        'balance_at_closing': '117000',
        'closing_days': '45',
        'subject_attorney': True,
        'subject_clear_title': True,
        'subject_mortgage': True,
        'subject_cash': False,
        'subject_standard_inspection': True,
        'subject_structural': False,
        'sellers_agent_name': 'Lazer Farkas',
        'buyers_agent_name': 'Mendy Jankovits',
        'commission_pct': '2.5',
        'additional_terms': 'Possession at closing. All appliances included. Seller to provide clean title.',
        'purchaser_attorney_name': 'David Weiss, Esq.',
        'purchaser_attorney_address': '45 Main St, Monsey NY 10952',
        'purchaser_attorney_tel': '(845) 555-1234',
        'purchaser_attorney_email': 'dweiss@weisslaw.com',
        'seller_attorney_name': 'Aron Fried, Esq.',
        'seller_attorney_address': '12 Park Ave, Suffern NY 10901',
        'seller_attorney_tel': '(845) 555-5678',
        'seller_attorney_email': 'afried@friedlaw.com',
    }
    generate_offer_pdf(sample, '/mnt/user-data/outputs/offer_sample.pdf')

# ── COMMAND LINE MODE (called from Node.js) ──────────────────────
import sys
if __name__ == '__main__' and len(sys.argv) >= 3:
    json_path   = sys.argv[1]
    output_path = sys.argv[2]
    with open(json_path) as f:
        data = json.load(f)
    generate_offer_pdf(data, output_path)
