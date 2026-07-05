"""
TargetOS V2 — Fill Offer For Sale PDF
Uses pdfrw to fill the original Target Team offer form fields.
Called from generate-offer-pdf.js
"""
import sys, json, os
import pdfrw

TEMPLATE = os.path.join(os.path.dirname(__file__), 'Offer_For_Sale_Form.pdf')

def fmt_money(v):
    if not v: return ''
    try:
        n = float(str(v).replace('$','').replace(',',''))
        return '${:,.0f}'.format(n)
    except: return str(v)

def fmt_date_part(date_str, part):
    """part: 0=month, 1=day, 2=year"""
    if not date_str: return ''
    try:
        parts = str(date_str).split('-')
        if len(parts) == 3:
            return [parts[1].lstrip('0'), parts[2].lstrip('0'), parts[0]][part]
    except: pass
    return ''

def split_terms(text, max_len=90):
    if not text: return ['', '', '']
    words, lines, cur = text.split(), [], ''
    for w in words:
        test = (cur + ' ' + w).strip()
        if len(test) <= max_len:
            cur = test
        else:
            lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    while len(lines) < 3: lines.append('')
    return lines[:3]

def fill_offer_pdf(data: dict, output_path: str):
    template = pdfrw.PdfReader(TEMPLATE)
    template.Root.AcroForm.update(
        pdfrw.PdfDict(NeedAppearances=pdfrw.PdfObject('true'))
    )

    buyers_agent = data.get('buyers_agent_name', '') or ''
    terms        = split_terms(data.get('additional_terms', '') or '')
    comm         = str(data.get('commission_pct', '') or '')
    if comm and not comm.endswith('%'): comm += '%'

    fields = {
        'Date':        fmt_date_part(data.get('offer_date', ''), 0),
        'undefined':   fmt_date_part(data.get('offer_date', ''), 1),
        'undefined_2': fmt_date_part(data.get('offer_date', ''), 2),
        'Address':     data.get('listing_addr', '') or '',
        'MLS ID':      data.get('mls_number', '') or '',
        'Buyer':       data.get('buyer_name', '') or '',
        'Seller':      data.get('seller_name', '') or '',
        'CoBuyer':     data.get('co_buyer_name', '') or '',
        'CoSeller':    data.get('co_seller_name', '') or '',
        'undefined_3': fmt_money(data.get('purchase_price', '')),
        'undefined_4': fmt_money(data.get('deposit', '')),
        'undefined_5': fmt_money(data.get('sellers_concession', '')),
        'undefined_6': fmt_money(data.get('net_to_seller', '')),
        'undefined_7': fmt_money(data.get('mortgage_amount', '')),
        'undefined_8': (str(data.get('mortgage_pct','') or '') + '%') if data.get('mortgage_pct') else '',
        'undefined_9': fmt_money(data.get('balance_at_closing', '')),
        'DAYS':        str(data.get('closing_days', '30') or '30'),
        'Additional Terms 1': terms[0],
        'Additional Terms 2': terms[1],
        'Additional Terms 3': terms[2],
        'The seller recognizes Keller Williams Valley Realty LTD and': buyers_agent,
        'effected this meeting of the minds and agrees to pay a brokerage commission of': comm,
        'Sellers Agent': data.get('sellers_agent_name', '') or '',
        'Buyers Agent':  buyers_agent,
        'Name':      data.get('purchaser_attorney_name', '') or '',
        'Address_2': data.get('purchaser_attorney_address', '') or '',
        'Tel':       data.get('purchaser_attorney_tel', '') or '',
        'Email':     data.get('purchaser_attorney_email', '') or '',
        'Name_2':    data.get('seller_attorney_name', '') or '',
        'Address_3': data.get('seller_attorney_address', '') or '',
        'Tel_2':     data.get('seller_attorney_tel', '') or '',
        'Email_2':   data.get('seller_attorney_email', '') or '',
    }

    checkboxes = {
        'Check Box1': bool(data.get('subject_attorney', True)),
        'Check Box2': bool(data.get('subject_clear_title', True)),
        'Check Box3': bool(data.get('subject_mortgage', False)),
        'Check Box4': bool(data.get('subject_cash', False)),
        'Check Box5': bool(data.get('subject_standard_inspection', True)),
        'Check Box6': bool(data.get('subject_structural', False)),
    }

    for page in template.pages:
        annots = page['/Annots']
        if not annots: continue
        for annot in annots:
            if annot['/Subtype'] != '/Widget': continue
            key = annot['/T']
            if not key: continue
            key = key[1:-1]  # strip parens
            if key in fields:
                annot.update(pdfrw.PdfDict(V='{}'.format(fields[key]), AP=''))
            elif key in checkboxes:
                v = pdfrw.PdfName('Yes') if checkboxes[key] else pdfrw.PdfName('Off')
                annot.update(pdfrw.PdfDict(AS=v, V=v))

    pdfrw.PdfWriter().write(output_path, template)

if __name__ == '__main__':
    if len(sys.argv) >= 3:
        with open(sys.argv[1]) as f:
            data = json.load(f)
        fill_offer_pdf(data, sys.argv[2])
    else:
        print('Usage: python fill_offer_pdf.py data.json output.pdf')
