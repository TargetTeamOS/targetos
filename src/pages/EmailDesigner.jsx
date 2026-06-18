import React, { useState, useRef } from 'react'
import { Btn } from '../components/UI'
import { sendEmail } from '../lib/emailService'
import { useApp } from '../context/AppContext'

// ── BLOCK TYPES ────────────────────────────────────────────────
const BLOCK_DEFS = [
  { type:'header',    icon:'🎯', label:'Header Banner',   cat:'Layout'   },
  { type:'text',      icon:'📝', label:'Text Block',      cat:'Content'  },
  { type:'button',    icon:'🔘', label:'Button / CTA',    cat:'Content'  },
  { type:'image',     icon:'🖼', label:'Image',           cat:'Media'    },
  { type:'spacer',    icon:'↕',  label:'Spacer',          cat:'Layout'   },
  { type:'divider',   icon:'─',  label:'Divider',         cat:'Layout'   },
  { type:'2col',      icon:'▥',  label:'2 Columns',       cat:'Layout'   },
  { type:'listing',   icon:'🏠', label:'Listing Card',    cat:'Real Estate'},
  { type:'agent',     icon:'👤', label:'Agent Card',      cat:'Real Estate'},
  { type:'stats',     icon:'📊', label:'Stats Row',       cat:'Real Estate'},
  { type:'quote',     icon:'💬', label:'Quote Block',     cat:'Content'  },
  { type:'footer',    icon:'📄', label:'Footer',          cat:'Layout'   },
]

const FONT_FAMILIES = ['Arial, sans-serif','Georgia, serif','Verdana, sans-serif','Trebuchet MS, sans-serif','Times New Roman, serif']
const FONT_SIZES = ['12px','13px','14px','15px','16px','18px','20px','24px','28px','32px','36px','40px','48px']
const ALIGNS = ['left','center','right']

// ── DEFAULT BLOCK DATA ─────────────────────────────────────────
function makeBlock(type) {
  const id = 'b' + Date.now() + Math.random().toString(36).slice(2,6)
  const defaults = {
    header:  { id, type, text:'Your Headline Here', subtext:'Supporting subtitle text', bgColor:'#1B2B4B', textColor:'#ffffff', subtextColor:'rgba(255,255,255,0.6)', align:'center', fontSize:'28px', font:'Arial, sans-serif', padding:'40px 32px', logo:true },
    text:    { id, type, text:'Write your message here. You can format this block with different fonts, sizes, colors and alignment.', textColor:'#334155', fontSize:'14px', font:'Arial, sans-serif', align:'left', lineHeight:'1.8', padding:'20px 32px', bgColor:'#ffffff' },
    button:  { id, type, label:'Click Here', url:'https://app.targetreteam.com', bgColor:'#CC2200', textColor:'#ffffff', align:'center', fontSize:'14px', font:'Arial, sans-serif', padding:'20px 32px', btnPad:'14px 36px', radius:'10px', width:'auto' },
    image:   { id, type, url:'', alt:'', align:'center', width:'100%', padding:'16px 32px', bgColor:'#ffffff', link:'' },
    spacer:  { id, type, height:'24px', bgColor:'transparent' },
    divider: { id, type, color:'#E2E8F0', thickness:'1px', style:'solid', padding:'8px 32px', bgColor:'#ffffff' },
    '2col':  { id, type, bgColor:'#ffffff', padding:'20px 16px', gap:'16px',
      left:  { text:'Left column content here', textColor:'#334155', fontSize:'14px', font:'Arial, sans-serif', bgColor:'#F8FAFC', padding:'16px', radius:'10px' },
      right: { text:'Right column content here', textColor:'#334155', fontSize:'14px', font:'Arial, sans-serif', bgColor:'#F8FAFC', padding:'16px', radius:'10px' },
    },
    listing: { id, type, address:'47 Prairie Ave, Suffern NY', price:'$599,000', beds:'4', baths:'2', sqft:'1,568', type_:'Single Family', bgColor:'#ffffff', padding:'16px 32px', accentColor:'#CC2200', mlsLink:'' },
    agent:   { id, type, name:'Agent Name', title:'Real Estate Agent', phone:'845.424.1014', email:'agent@targetreteam.com', bgColor:'#F8FAFC', padding:'20px 32px', accentColor:'#CC2200', photo:'' },
    stats:   { id, type, bgColor:'#F8FAFC', padding:'20px 32px', accentColor:'#CC2200',
      items:[{label:'Avg Sale Price',value:'$850K'},{label:'Days on Market',value:'32'},{label:'Active Listings',value:'127'},{label:'Sold',value:'48'}]
    },
    quote:   { id, type, text:'"Your next deal is one conversation away."', author:'Target Team', bgColor:'#ffffff', padding:'24px 32px', accentColor:'#CC2200', textColor:'#334155', fontSize:'17px', font:'Georgia, serif' },
    footer:  { id, type, bgColor:'#1B2B4B', textColor:'rgba(255,255,255,0.5)', text:'Target Team · Keller Williams Valley Realty\n845.424.1014 · targetreteam.com', fontSize:'12px', font:'Arial, sans-serif', align:'center', padding:'28px 32px', showUnsubscribe:true },
  }
  return defaults[type] || { id, type, text:'Block' }
}

// ── RENDER BLOCK TO HTML ───────────────────────────────────────
function renderBlock(b, settings) {
  const APP = 'https://app.targetreteam.com'
  switch(b.type) {
    case 'header': return `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.bgColor};">
        <tr><td style="padding:${b.padding};text-align:${b.align};">
          ${b.logo?`<div style="margin-bottom:16px;"><span style="font-size:22px;font-weight:900;color:#ffffff;font-family:${b.font};">Target<span style="color:#F5A623;">OS</span></span></div>`:''}
          <div style="font-size:${b.fontSize};font-weight:800;color:${b.textColor};line-height:1.2;font-family:${b.font};">${b.text}</div>
          ${b.subtext?`<div style="font-size:14px;color:${b.subtextColor};margin-top:10px;font-family:${b.font};line-height:1.6;">${b.subtext}</div>`:''}
        </td></tr>
      </table>`

    case 'text': return `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.bgColor};">
        <tr><td style="padding:${b.padding};text-align:${b.align};">
          <div style="font-size:${b.fontSize};color:${b.textColor};line-height:${b.lineHeight};font-family:${b.font};">${b.text.replace(/\n/g,'<br/>')}</div>
        </td></tr>
      </table>`

    case 'button': return `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:white;">
        <tr><td style="padding:${b.padding};text-align:${b.align};">
          <a href="${b.url}" style="display:inline-block;background:${b.bgColor};color:${b.textColor};text-decoration:none;font-size:${b.fontSize};font-weight:700;padding:${b.btnPad};border-radius:${b.radius};font-family:${b.font};">${b.label}</a>
        </td></tr>
      </table>`

    case 'image': return b.url ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.bgColor};">
        <tr><td style="padding:${b.padding};text-align:${b.align};">
          ${b.link?`<a href="${b.link}">`:''}
          <img src="${b.url}" alt="${b.alt}" width="${b.width}" style="max-width:100%;height:auto;display:block;${b.align==='center'?'margin:0 auto;':''}border-radius:8px;"/>
          ${b.link?'</a>':''}
        </td></tr>
      </table>` : `<table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:20px;background:#F1F5F9;text-align:center;border:2px dashed #CBD5E1;color:#94A3B8;font-family:Arial,sans-serif;font-size:13px;">🖼 Add an image URL</td></tr></table>`

    case 'spacer': return `<table width="100%" cellpadding="0" cellspacing="0" style="background:${b.bgColor};"><tr><td style="height:${b.height};font-size:0;">&nbsp;</td></tr></table>`

    case 'divider': return `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.bgColor};">
        <tr><td style="padding:${b.padding};"><hr style="border:none;border-top:${b.thickness} ${b.style} ${b.color};margin:0;"/></td></tr>
      </table>`

    case '2col': return `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.bgColor};">
        <tr><td style="padding:${b.padding};">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="48%" valign="top" style="background:${b.left.bgColor};padding:${b.left.padding};border-radius:${b.left.radius||'0'};">
                <div style="font-size:${b.left.fontSize};color:${b.left.textColor};font-family:${b.left.font};line-height:1.7;">${b.left.text.replace(/\n/g,'<br/>')}</div>
              </td>
              <td width="4%" style="font-size:0;">&nbsp;</td>
              <td width="48%" valign="top" style="background:${b.right.bgColor};padding:${b.right.padding};border-radius:${b.right.radius||'0'};">
                <div style="font-size:${b.right.fontSize};color:${b.right.textColor};font-family:${b.right.font};line-height:1.7;">${b.right.text.replace(/\n/g,'<br/>')}</div>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>`

    case 'listing': return `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.bgColor};">
        <tr><td style="padding:${b.padding};">
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
            <tr><td style="background:#1B2B4B;padding:16px 20px;">
              <div style="font-size:16px;font-weight:800;color:#ffffff;font-family:Arial,sans-serif;">${b.address}</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.5);font-family:Arial,sans-serif;margin-top:3px;">${b.type_||'Property'}</div>
            </td></tr>
            <tr><td style="padding:16px 20px;background:#ffffff;">
              <div style="font-size:28px;font-weight:900;color:${b.accentColor};font-family:Arial,sans-serif;margin-bottom:12px;">${b.price}</div>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  ${b.beds?`<td style="padding-right:20px;font-size:12px;color:#64748B;font-family:Arial,sans-serif;">🛏 <strong>${b.beds}</strong> Bed</td>`:''}
                  ${b.baths?`<td style="padding-right:20px;font-size:12px;color:#64748B;font-family:Arial,sans-serif;">🚿 <strong>${b.baths}</strong> Bath</td>`:''}
                  ${b.sqft?`<td style="font-size:12px;color:#64748B;font-family:Arial,sans-serif;">📐 <strong>${b.sqft}</strong> sqft</td>`:''}
                </tr>
              </table>
              ${b.mlsLink?`<div style="margin-top:14px;"><a href="${b.mlsLink}" style="background:${b.accentColor};color:#ffffff;text-decoration:none;font-size:12px;font-weight:700;padding:9px 20px;border-radius:8px;font-family:Arial,sans-serif;">View Listing →</a></div>`:''}
            </td></tr>
          </table>
        </td></tr>
      </table>`

    case 'agent': return `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.bgColor};">
        <tr><td style="padding:${b.padding};">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
            <tr>
              <td width="5" style="background:${b.accentColor};">&nbsp;</td>
              <td style="padding:20px 24px;">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    ${b.photo?`<td width="60" valign="middle" style="padding-right:16px;"><img src="${b.photo}" width="56" height="56" style="border-radius:50%;object-fit:cover;" alt="${b.name}"/></td>`:''}
                    <td valign="middle">
                      <div style="font-size:16px;font-weight:800;color:#1E293B;font-family:Arial,sans-serif;">${b.name}</div>
                      <div style="font-size:12px;color:${b.accentColor};font-weight:600;font-family:Arial,sans-serif;margin-top:2px;">${b.title}</div>
                      <div style="font-size:12px;color:#64748B;font-family:Arial,sans-serif;margin-top:6px;">
                        ${b.phone?`📞 ${b.phone}  `:''}${b.email?`✉ ${b.email}`:''}
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td></tr>
      </table>`

    case 'stats': return `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.bgColor};">
        <tr><td style="padding:${b.padding};">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${(b.items||[]).map(item=>`
              <td style="padding:0 6px;text-align:center;vertical-align:top;">
                <table width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;border:1px solid #E2E8F0;">
                  <tr><td style="padding:16px 12px;text-align:center;">
                    <div style="font-size:22px;font-weight:900;color:${b.accentColor};font-family:Arial,sans-serif;">${item.value}</div>
                    <div style="font-size:11px;color:#94A3B8;font-family:Arial,sans-serif;margin-top:4px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;">${item.label}</div>
                  </td></tr>
                </table>
              </td>`).join('')}
            </tr>
          </table>
        </td></tr>
      </table>`

    case 'quote': return `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.bgColor};">
        <tr><td style="padding:${b.padding};">
          <table cellpadding="0" cellspacing="0" width="100%">
            <tr>
              <td width="4" style="background:${b.accentColor};border-radius:2px;">&nbsp;</td>
              <td style="padding-left:20px;">
                <div style="font-size:${b.fontSize};color:${b.textColor};line-height:1.7;font-family:${b.font};font-style:italic;">${b.text}</div>
                ${b.author?`<div style="font-size:12px;color:#94A3B8;font-family:Arial,sans-serif;margin-top:8px;">— ${b.author}</div>`:''}
              </td>
            </tr>
          </table>
        </td></tr>
      </table>`

    case 'footer': return `
      <table width="100%" cellpadding="0" cellspacing="0" style="background:${b.bgColor};">
        <tr><td style="padding:${b.padding};text-align:${b.align};">
          <div style="font-size:${b.fontSize};color:${b.textColor};line-height:1.8;font-family:${b.font};">${b.text.replace(/\n/g,'<br/>')}</div>
          ${b.showUnsubscribe?`<div style="margin-top:10px;"><a href="${APP}" style="font-size:10px;color:rgba(255,255,255,0.2);font-family:Arial,sans-serif;">Unsubscribe</a></div>`:''}
        </td></tr>
      </table>`

    default: return `<table width="100%"><tr><td style="padding:16px;text-align:center;color:#94A3B8;font-family:Arial,sans-serif;">Block: ${b.type}</td></tr></table>`
  }
}

// ── BUILD FULL EMAIL HTML ──────────────────────────────────────
function buildHtml(blocks, settings) {
  const body = blocks.map(b => renderBlock(b, settings)).join('\n')
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${settings.subject||'Email'}</title></head>
<body style="margin:0;padding:0;background:${settings.bgColor||'#EEF2F7'};font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${settings.bgColor||'#EEF2F7'};padding:${settings.outerPad||'24px 12px 40px'};">
  <tr><td align="center">
    <table width="${settings.width||'580'}" cellpadding="0" cellspacing="0" style="max-width:${settings.width||'580'}px;width:100%;border-radius:${settings.radius||'16px'};overflow:hidden;box-shadow:${settings.shadow?'0 4px 24px rgba(0,0,0,0.10)':'none'};">
      <tr><td>${body}</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`
}

// ── PROPERTY PANEL ─────────────────────────────────────────────
function PropPanel({ block, onChange, onDelete }) {
  if(!block) return (
    <div style={{padding:'24px',textAlign:'center',color:'var(--muted)'}}>
      <div style={{fontSize:'28px',marginBottom:'10px'}}>👆</div>
      <div style={{fontSize:'12px',fontWeight:600}}>Click any block to edit it</div>
      <div style={{fontSize:'11px',marginTop:'4px',opacity:.7}}>Or drag blocks from the left panel</div>
    </div>
  )

  const set = (k,v) => onChange({...block,[k]:v})
  const setL = (k,v) => onChange({...block,left:{...block.left,[k]:v}})
  const setR = (k,v) => onChange({...block,right:{...block.right,[k]:v}})

  function ColorInput({ label, value, onChange: oc }) {
    return (
      <div style={{marginBottom:'10px'}}>
        <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>{label}</label>
        <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
          <input type="color" value={value||'#000000'} onChange={e=>oc(e.target.value)} style={{width:36,height:32,borderRadius:'6px',border:'1.5px solid var(--border)',cursor:'pointer',padding:'2px'}}/>
          <input type="text" value={value||''} onChange={e=>oc(e.target.value)} style={{flex:1,background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'6px',color:'var(--text)',fontSize:'11px',fontFamily:'Inter,system-ui,sans-serif',padding:'6px 8px',outline:'none'}}/>
        </div>
      </div>
    )
  }

  function TxtInput({ label, value, onChange: oc, type='text', rows }) {
    return (
      <div style={{marginBottom:'10px'}}>
        <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>{label}</label>
        {rows
          ? <textarea value={value||''} onChange={e=>oc(e.target.value)} rows={rows} style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'6px',color:'var(--text)',fontSize:'11px',fontFamily:'Inter,system-ui,sans-serif',padding:'6px 8px',outline:'none',resize:'vertical',boxSizing:'border-box',lineHeight:1.6}}/>
          : <input type={type} value={value||''} onChange={e=>oc(e.target.value)} style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'6px',color:'var(--text)',fontSize:'11px',fontFamily:'Inter,system-ui,sans-serif',padding:'7px 8px',outline:'none',boxSizing:'border-box'}}/>
        }
      </div>
    )
  }

  function SelectInput({ label, value, onChange: oc, options }) {
    return (
      <div style={{marginBottom:'10px'}}>
        <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>{label}</label>
        <select value={value||''} onChange={e=>oc(e.target.value)} style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'6px',color:'var(--text)',fontSize:'11px',fontFamily:'Inter,system-ui,sans-serif',padding:'7px 8px',outline:'none'}}>
          {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
        </select>
      </div>
    )
  }

  function Section({ title, children }) {
    const [open,setOpen] = useState(true)
    return (
      <div style={{marginBottom:'12px',border:'1px solid var(--border)',borderRadius:'8px',overflow:'hidden'}}>
        <div onClick={()=>setOpen(o=>!o)} style={{padding:'8px 12px',background:'var(--dim)',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:'11px',fontWeight:700,color:'var(--text)'}}>{title}</span>
          <span style={{color:'var(--muted)',fontSize:'11px'}}>{open?'▾':'▸'}</span>
        </div>
        {open&&<div style={{padding:'12px'}}>{children}</div>}
      </div>
    )
  }

  return (
    <div style={{padding:'12px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
        <div style={{fontSize:'12px',fontWeight:800,textTransform:'capitalize'}}>{block.type} Block</div>
        <button onClick={onDelete} style={{background:'rgba(220,38,38,.08)',border:'1px solid rgba(220,38,38,.2)',borderRadius:'6px',color:'#DC2626',fontSize:'11px',padding:'4px 9px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>🗑 Delete</button>
      </div>

      {/* Content fields */}
      {['header','text','quote'].includes(block.type) && (
        <Section title="Content">
          {block.type==='header'&&<TxtInput label="Headline" value={block.text} onChange={v=>set('text',v)}/>}
          {block.type==='header'&&<TxtInput label="Subtext" value={block.subtext} onChange={v=>set('subtext',v)}/>}
          {block.type==='header'&&<div style={{marginBottom:'10px'}}><label style={{fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginRight:'8px'}}>Show Logo</label><input type="checkbox" checked={!!block.logo} onChange={e=>set('logo',e.target.checked)}/></div>}
          {block.type==='text'&&<TxtInput label="Text Content" value={block.text} onChange={v=>set('text',v)} rows={5}/>}
          {block.type==='quote'&&<TxtInput label="Quote Text" value={block.text} onChange={v=>set('text',v)} rows={3}/>}
          {block.type==='quote'&&<TxtInput label="Author" value={block.author} onChange={v=>set('author',v)}/>}
        </Section>
      )}

      {block.type==='button'&&(
        <Section title="Button">
          <TxtInput label="Button Label" value={block.label} onChange={v=>set('label',v)}/>
          <TxtInput label="Link URL" value={block.url} onChange={v=>set('url',v)}/>
          <TxtInput label="Border Radius" value={block.radius} onChange={v=>set('radius',v)}/>
        </Section>
      )}

      {block.type==='image'&&(
        <Section title="Image">
          <TxtInput label="Image URL" value={block.url} onChange={v=>set('url',v)}/>
          <TxtInput label="Click Link (optional)" value={block.link} onChange={v=>set('link',v)}/>
          <TxtInput label="Alt Text" value={block.alt} onChange={v=>set('alt',v)}/>
          <TxtInput label="Width (e.g. 100% or 300px)" value={block.width} onChange={v=>set('width',v)}/>
          <SelectInput label="Align" value={block.align} onChange={v=>set('align',v)} options={ALIGNS}/>
        </Section>
      )}

      {block.type==='listing'&&(
        <Section title="Listing Details">
          <TxtInput label="Address" value={block.address} onChange={v=>set('address',v)}/>
          <TxtInput label="Price" value={block.price} onChange={v=>set('price',v)}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'6px'}}>
            <TxtInput label="Beds" value={block.beds} onChange={v=>set('beds',v)}/>
            <TxtInput label="Baths" value={block.baths} onChange={v=>set('baths',v)}/>
            <TxtInput label="Sqft" value={block.sqft} onChange={v=>set('sqft',v)}/>
          </div>
          <TxtInput label="Property Type" value={block.type_} onChange={v=>set('type_',v)}/>
          <TxtInput label="MLS Link (optional)" value={block.mlsLink} onChange={v=>set('mlsLink',v)}/>
        </Section>
      )}

      {block.type==='agent'&&(
        <Section title="Agent Info">
          <TxtInput label="Name" value={block.name} onChange={v=>set('name',v)}/>
          <TxtInput label="Title" value={block.title} onChange={v=>set('title',v)}/>
          <TxtInput label="Phone" value={block.phone} onChange={v=>set('phone',v)}/>
          <TxtInput label="Email" value={block.email} onChange={v=>set('email',v)}/>
          <TxtInput label="Photo URL" value={block.photo} onChange={v=>set('photo',v)}/>
        </Section>
      )}

      {block.type==='stats'&&(
        <Section title="Stats">
          {(block.items||[]).map((item,i)=>(
            <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr 24px',gap:'5px',marginBottom:'6px',alignItems:'center'}}>
              <input value={item.label} onChange={e=>set('items',block.items.map((x,j)=>j===i?{...x,label:e.target.value}:x))} placeholder="Label" style={{background:'var(--inp)',border:'1px solid var(--border)',borderRadius:'5px',color:'var(--text)',fontSize:'11px',padding:'5px 7px',outline:'none'}}/>
              <input value={item.value} onChange={e=>set('items',block.items.map((x,j)=>j===i?{...x,value:e.target.value}:x))} placeholder="Value" style={{background:'var(--inp)',border:'1px solid var(--border)',borderRadius:'5px',color:'var(--text)',fontSize:'11px',padding:'5px 7px',outline:'none'}}/>
              <button onClick={()=>set('items',block.items.filter((_,j)=>j!==i))} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',fontSize:'14px'}}>✕</button>
            </div>
          ))}
          <button onClick={()=>set('items',[...(block.items||[]),{label:'',value:''}])} style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'6px',color:'var(--text)',fontSize:'11px',padding:'5px 12px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>+ Add Stat</button>
        </Section>
      )}

      {block.type==='footer'&&(
        <Section title="Footer Text">
          <TxtInput label="Footer Content" value={block.text} onChange={v=>set('text',v)} rows={3}/>
          <div style={{marginBottom:'10px',display:'flex',alignItems:'center',gap:'7px'}}>
            <input type="checkbox" checked={!!block.showUnsubscribe} onChange={e=>set('showUnsubscribe',e.target.checked)} id="unsub"/>
            <label htmlFor="unsub" style={{fontSize:'11px',color:'var(--muted)',cursor:'pointer'}}>Show Unsubscribe link</label>
          </div>
        </Section>
      )}

      {block.type==='spacer'&&(
        <Section title="Spacer">
          <TxtInput label="Height" value={block.height} onChange={v=>set('height',v)}/>
        </Section>
      )}

      {block.type==='divider'&&(
        <Section title="Divider">
          <TxtInput label="Thickness" value={block.thickness} onChange={v=>set('thickness',v)}/>
          <SelectInput label="Style" value={block.style} onChange={v=>set('style',v)} options={['solid','dashed','dotted']}/>
        </Section>
      )}

      {/* Typography */}
      {['header','text','button','quote','footer'].includes(block.type)&&(
        <Section title="Typography">
          <SelectInput label="Font Family" value={block.font} onChange={v=>set('font',v)} options={FONT_FAMILIES}/>
          <SelectInput label="Font Size" value={block.fontSize} onChange={v=>set('fontSize',v)} options={FONT_SIZES}/>
          {['text','footer'].includes(block.type)&&<SelectInput label="Align" value={block.align} onChange={v=>set('align',v)} options={ALIGNS}/>}
          {block.type==='text'&&<TxtInput label="Line Height" value={block.lineHeight} onChange={v=>set('lineHeight',v)}/>}
        </Section>
      )}

      {/* Colors */}
      <Section title="Colors">
        {['header','text','spacer','button','listing','agent','stats','quote','footer','2col','divider'].includes(block.type)&&
          <ColorInput label="Background" value={block.bgColor} onChange={v=>set('bgColor',v)}/>}
        {['header','text','button','quote','footer'].includes(block.type)&&
          <ColorInput label="Text Color" value={block.textColor} onChange={v=>set('textColor',v)}/>}
        {block.type==='header'&&<ColorInput label="Subtext Color" value={block.subtextColor} onChange={v=>set('subtextColor',v)}/>}
        {['listing','agent','stats','quote'].includes(block.type)&&
          <ColorInput label="Accent Color" value={block.accentColor} onChange={v=>set('accentColor',v)}/>}
        {block.type==='divider'&&<ColorInput label="Line Color" value={block.color} onChange={v=>set('color',v)}/>}
      </Section>

      {/* Spacing */}
      {!['spacer'].includes(block.type)&&(
        <Section title="Spacing">
          <TxtInput label="Padding" value={block.padding} onChange={v=>set('padding',v)}/>
        </Section>
      )}

      {/* 2-col specific */}
      {block.type==='2col'&&(
        <>
          <Section title="Left Column">
            <TxtInput label="Content" value={block.left.text} onChange={v=>setL('text',v)} rows={3}/>
            <ColorInput label="Background" value={block.left.bgColor} onChange={v=>setL('bgColor',v)}/>
            <ColorInput label="Text Color" value={block.left.textColor} onChange={v=>setL('textColor',v)}/>
            <SelectInput label="Font Size" value={block.left.fontSize} onChange={v=>setL('fontSize',v)} options={FONT_SIZES}/>
          </Section>
          <Section title="Right Column">
            <TxtInput label="Content" value={block.right.text} onChange={v=>setR('text',v)} rows={3}/>
            <ColorInput label="Background" value={block.right.bgColor} onChange={v=>setR('bgColor',v)}/>
            <ColorInput label="Text Color" value={block.right.textColor} onChange={v=>setR('textColor',v)}/>
            <SelectInput label="Font Size" value={block.right.fontSize} onChange={v=>setR('fontSize',v)} options={FONT_SIZES}/>
          </Section>
        </>
      )}
    </div>
  )
}

// ── MAIN DESIGNER ──────────────────────────────────────────────
export function EmailDesigner({ onClose }) {
  const { toast } = useApp()
  const [blocks, setBlocks] = useState([
    makeBlock('header'),
    makeBlock('text'),
    makeBlock('button'),
    makeBlock('footer'),
  ])
  const [selected, setSelected] = useState(null)
  const [settings, setSettings] = useState({ subject:'', bgColor:'#EEF2F7', width:'580', radius:'16px', shadow:true, outerPad:'24px 12px 40px' })
  const [tab, setTab] = useState('blocks') // blocks | settings
  const [dragIdx, setDragIdx] = useState(null)
  const [dragOver, setDragOver] = useState(null)
  const [sendModal, setSendModal] = useState(false)
  const [sendTo, setSendTo] = useState('')
  const [sending, setSending] = useState(false)
  const [savedTemplates, setSavedTemplates] = useState([])
  const [templateName, setTemplateName] = useState('')

  const html = buildHtml(blocks, settings)
  const selectedBlock = blocks.find(b=>b.id===selected)

  function addBlock(type) {
    const nb = makeBlock(type)
    setBlocks(prev=>[...prev,nb])
    setSelected(nb.id)
  }

  function updateBlock(id, newBlock) {
    setBlocks(prev=>prev.map(b=>b.id===id?newBlock:b))
  }

  function deleteBlock(id) {
    setBlocks(prev=>prev.filter(b=>b.id!==id))
    setSelected(null)
  }

  function moveBlock(from, to) {
    if(to<0||to>=blocks.length) return
    const b=[...blocks]; const [m]=b.splice(from,1); b.splice(to,0,m); setBlocks(b)
  }

  function duplicate(id) {
    const b = blocks.find(x=>x.id===id)
    if(!b) return
    const nb = {...JSON.parse(JSON.stringify(b)), id:'b'+Date.now()}
    const idx = blocks.findIndex(x=>x.id===id)
    const arr = [...blocks]; arr.splice(idx+1,0,nb); setBlocks(arr)
    setSelected(nb.id)
  }

  function saveTemplate() {
    if(!templateName.trim()) return
    setSavedTemplates(prev=>[...prev,{name:templateName.trim(),blocks:JSON.parse(JSON.stringify(blocks)),settings:{...settings}}])
    setTemplateName('')
    toast('Template saved!')
  }

  function loadTemplate(t) {
    setBlocks(t.blocks.map(b=>({...b,id:'b'+Date.now()+Math.random().toString(36).slice(2,5)})))
    setSettings(t.settings)
    setSelected(null)
  }

  async function sendTestEmail() {
    if(!sendTo.trim()) return
    setSending(true)
    const result = await sendEmail({ to:sendTo.trim(), subject:settings.subject||'Test Email from TargetOS', html })
    setSending(false)
    if(result.success) { toast('✅ Test email sent to '+sendTo); setSendModal(false) }
    else toast('Send failed: '+result.error, '#DC2626')
  }

  function downloadHtml() {
    const b = new Blob([html],{type:'text/html'})
    const a = document.createElement('a'); a.href=URL.createObjectURL(b); a.download='email.html'; a.click()
  }

  const CATS = [...new Set(BLOCK_DEFS.map(d=>d.cat))]

  return (
    <div style={{position:'fixed',inset:0,background:'var(--bg)',zIndex:500,display:'flex',flexDirection:'column',fontFamily:'Inter,system-ui,sans-serif'}}>

      {/* Top toolbar */}
      <div style={{height:52,background:'var(--navy)',display:'flex',alignItems:'center',padding:'0 16px',gap:'10px',flexShrink:0,borderBottom:'1px solid rgba(255,255,255,.1)'}}>
        <img src="/logo.png" alt="" style={{width:28,height:28,objectFit:'contain'}}/>
        <span style={{color:'#fff',fontSize:'14px',fontWeight:800}}>Email Designer</span>
        <div style={{flex:1}}/>
        <input value={settings.subject} onChange={e=>setSettings(s=>({...s,subject:e.target.value}))}
          placeholder="Email subject line..."
          style={{background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.15)',borderRadius:'8px',color:'#fff',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'7px 13px',outline:'none',width:'260px'}}/>
        <div style={{display:'flex',gap:'6px'}}>
          <button onClick={()=>setSendModal(true)} style={{background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',borderRadius:'8px',color:'#fff',fontSize:'12px',fontWeight:600,padding:'7px 14px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>📤 Send Test</button>
          <button onClick={downloadHtml} style={{background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',borderRadius:'8px',color:'#fff',fontSize:'12px',fontWeight:600,padding:'7px 14px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>⬇ Download</button>
          {onClose&&<button onClick={onClose} style={{background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',borderRadius:'8px',color:'rgba(255,255,255,.7)',fontSize:'12px',fontWeight:600,padding:'7px 14px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>✕ Close</button>}
        </div>
      </div>

      <div style={{flex:1,display:'flex',overflow:'hidden'}}>

        {/* LEFT — Block library & settings */}
        <div style={{width:'220px',flexShrink:0,background:'var(--panel)',borderRight:'1px solid var(--border)',overflowY:'auto',display:'flex',flexDirection:'column'}}>
          {/* Tabs */}
          <div style={{display:'flex',borderBottom:'1px solid var(--border)'}}>
            {[['blocks','Blocks'],['settings','Settings'],['templates','Templates']].map(([k,l])=>(
              <button key={k} onClick={()=>setTab(k)} style={{flex:1,padding:'10px 4px',background:'transparent',border:'none',borderBottom:tab===k?'2px solid #CC2200':'2px solid transparent',fontFamily:'Inter,system-ui,sans-serif',fontSize:'10px',fontWeight:700,cursor:'pointer',color:tab===k?'#CC2200':'var(--muted)',textTransform:'uppercase',letterSpacing:'.5px'}}>{l}</button>
            ))}
          </div>

          {tab==='blocks' && (
            <div style={{padding:'10px',overflowY:'auto'}}>
              {CATS.map(cat=>(
                <div key={cat} style={{marginBottom:'12px'}}>
                  <div style={{fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.8px',marginBottom:'6px',paddingLeft:'2px'}}>{cat}</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'4px'}}>
                    {BLOCK_DEFS.filter(d=>d.cat===cat).map(def=>(
                      <button key={def.type} onClick={()=>addBlock(def.type)}
                        style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'8px',padding:'10px 6px',cursor:'pointer',transition:'all .1s',textAlign:'center',fontFamily:'Inter,system-ui,sans-serif'}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor='#CC2200';e.currentTarget.style.background='rgba(204,34,0,.05)'}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.background='var(--dim)'}}>
                        <div style={{fontSize:'18px',marginBottom:'4px'}}>{def.icon}</div>
                        <div style={{fontSize:'9px',fontWeight:600,color:'var(--text)',lineHeight:1.2}}>{def.label}</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab==='settings' && (
            <div style={{padding:'12px'}}>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'10px'}}>Email Settings</div>
              <div style={{marginBottom:'10px'}}>
                <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>Background Color</label>
                <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
                  <input type="color" value={settings.bgColor} onChange={e=>setSettings(s=>({...s,bgColor:e.target.value}))} style={{width:36,height:30,borderRadius:'6px',border:'1px solid var(--border)',cursor:'pointer',padding:'2px'}}/>
                  <input type="text" value={settings.bgColor} onChange={e=>setSettings(s=>({...s,bgColor:e.target.value}))} style={{flex:1,background:'var(--inp)',border:'1px solid var(--border)',borderRadius:'6px',color:'var(--text)',fontSize:'11px',padding:'6px 8px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}/>
                </div>
              </div>
              <div style={{marginBottom:'10px'}}>
                <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>Email Width (px)</label>
                <input type="number" value={settings.width} onChange={e=>setSettings(s=>({...s,width:e.target.value}))} style={{width:'100%',background:'var(--inp)',border:'1px solid var(--border)',borderRadius:'6px',color:'var(--text)',fontSize:'11px',padding:'7px 8px',outline:'none',fontFamily:'Inter,system-ui,sans-serif',boxSizing:'border-box'}}/>
              </div>
              <div style={{marginBottom:'10px'}}>
                <label style={{display:'block',fontSize:'9px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'4px'}}>Border Radius</label>
                <input value={settings.radius} onChange={e=>setSettings(s=>({...s,radius:e.target.value}))} style={{width:'100%',background:'var(--inp)',border:'1px solid var(--border)',borderRadius:'6px',color:'var(--text)',fontSize:'11px',padding:'7px 8px',outline:'none',fontFamily:'Inter,system-ui,sans-serif',boxSizing:'border-box'}}/>
              </div>
              <div style={{marginBottom:'10px',display:'flex',alignItems:'center',gap:'8px'}}>
                <input type="checkbox" checked={settings.shadow} onChange={e=>setSettings(s=>({...s,shadow:e.target.checked}))} id="shadow"/>
                <label htmlFor="shadow" style={{fontSize:'11px',color:'var(--muted)',cursor:'pointer'}}>Drop shadow</label>
              </div>
            </div>
          )}

          {tab==='templates' && (
            <div style={{padding:'12px'}}>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:'10px'}}>Saved Templates</div>
              <div style={{display:'flex',gap:'5px',marginBottom:'10px'}}>
                <input value={templateName} onChange={e=>setTemplateName(e.target.value)} placeholder="Template name..." style={{flex:1,background:'var(--inp)',border:'1px solid var(--border)',borderRadius:'6px',color:'var(--text)',fontSize:'11px',padding:'6px 8px',outline:'none',fontFamily:'Inter,system-ui,sans-serif'}}/>
                <button onClick={saveTemplate} style={{background:'#CC2200',border:'none',borderRadius:'6px',color:'#fff',fontSize:'11px',padding:'6px 10px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',fontWeight:700}}>Save</button>
              </div>
              {savedTemplates.length===0
                ? <div style={{fontSize:'11px',color:'var(--muted)',textAlign:'center',padding:'16px'}}>No saved templates yet</div>
                : savedTemplates.map((t,i)=>(
                  <div key={i} style={{background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'8px',padding:'9px 11px',marginBottom:'6px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:'12px',fontWeight:600}}>{t.name}</span>
                    <button onClick={()=>loadTemplate(t)} style={{background:'#CC2200',border:'none',borderRadius:'5px',color:'#fff',fontSize:'10px',padding:'3px 8px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif',fontWeight:700}}>Load</button>
                  </div>
                ))
              }
            </div>
          )}
        </div>

        {/* CENTER — Canvas */}
        <div style={{flex:1,overflow:'auto',background:'#CBD5E1',display:'flex',flexDirection:'column',alignItems:'center',padding:'24px 16px'}}>
          <div style={{width:'100%',maxWidth:'640px'}}>
            {/* Block list */}
            {blocks.map((block,idx)=>{
              const isSel = selected===block.id
              return (
                <div key={block.id}
                  draggable
                  onDragStart={()=>setDragIdx(idx)}
                  onDragOver={e=>{e.preventDefault();setDragOver(idx)}}
                  onDragEnd={()=>{if(dragIdx!==null&&dragOver!==null&&dragIdx!==dragOver){moveBlock(dragIdx,dragOver)};setDragIdx(null);setDragOver(null)}}
                  onClick={()=>setSelected(block.id)}
                  style={{position:'relative',cursor:'pointer',outline:isSel?'2px solid #CC2200':dragOver===idx?'2px dashed #94A3B8':'none',outlineOffset:'2px',borderRadius:'4px',marginBottom:'2px',transition:'outline .1s'}}>
                  {/* Block actions */}
                  {isSel&&(
                    <div style={{position:'absolute',top:-28,right:0,display:'flex',gap:'3px',zIndex:10}} onClick={e=>e.stopPropagation()}>
                      <BtnTiny onClick={()=>moveBlock(idx,idx-1)}>↑</BtnTiny>
                      <BtnTiny onClick={()=>moveBlock(idx,idx+1)}>↓</BtnTiny>
                      <BtnTiny onClick={()=>duplicate(block.id)}>⎘</BtnTiny>
                      <BtnTiny onClick={()=>deleteBlock(block.id)} danger>✕</BtnTiny>
                    </div>
                  )}
                  {/* Rendered block */}
                  <div dangerouslySetInnerHTML={{__html:renderBlock(block,settings)}}/>
                </div>
              )
            })}
            {/* Drop zone */}
            <div onClick={()=>addBlock('text')} style={{border:'2px dashed #94A3B8',borderRadius:'10px',padding:'20px',textAlign:'center',cursor:'pointer',color:'#94A3B8',fontSize:'12px',fontWeight:600,marginTop:'8px',transition:'all .15s'}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor='#CC2200';e.currentTarget.style.color='#CC2200'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='#94A3B8';e.currentTarget.style.color='#94A3B8'}}>
              + Click to add a block
            </div>
          </div>
        </div>

        {/* RIGHT — Properties */}
        <div style={{width:'250px',flexShrink:0,background:'var(--panel)',borderLeft:'1px solid var(--border)',overflowY:'auto'}}>
          <div style={{padding:'10px 12px',borderBottom:'1px solid var(--border)',fontSize:'11px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px'}}>
            {selectedBlock ? 'Block Properties' : 'Properties'}
          </div>
          <PropPanel
            block={selectedBlock}
            onChange={nb=>updateBlock(nb.id,nb)}
            onDelete={()=>deleteBlock(selected)}
          />
        </div>
      </div>

      {/* Send test modal */}
      {sendModal&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:600}}>
          <div style={{background:'var(--panel)',borderRadius:'16px',padding:'24px',width:'360px',boxShadow:'0 20px 60px rgba(0,0,0,.25)'}}>
            <div style={{fontSize:'16px',fontWeight:800,marginBottom:'14px'}}>📤 Send Test Email</div>
            <input value={sendTo} onChange={e=>setSendTo(e.target.value)} placeholder="recipient@email.com" type="email"
              style={{width:'100%',background:'var(--inp)',border:'1.5px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'13px',fontFamily:'Inter,system-ui,sans-serif',padding:'11px 13px',outline:'none',boxSizing:'border-box',marginBottom:'12px'}}
              onFocus={e=>e.target.style.borderColor='#CC2200'} onBlur={e=>e.target.style.borderColor='var(--border)'}/>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>setSendModal(false)} style={{flex:1,background:'var(--dim)',border:'1px solid var(--border)',borderRadius:'9px',color:'var(--text)',fontSize:'12px',fontWeight:600,padding:'11px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>Cancel</button>
              <button onClick={sendTestEmail} disabled={sending} style={{flex:2,background:'#CC2200',border:'none',borderRadius:'9px',color:'#fff',fontSize:'13px',fontWeight:700,padding:'11px',cursor:sending?'not-allowed':'pointer',fontFamily:'Inter,system-ui,sans-serif',opacity:sending?.7:1}}>
                {sending?'Sending…':'Send Test'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`.ed-active{outline:2px solid #CC2200!important;}`}</style>
    </div>
  )
}

function BtnTiny({ onClick, danger, children }) {
  return (
    <button onClick={onClick} style={{background:danger?'rgba(220,38,38,.15)':'rgba(0,0,0,.5)',border:'none',borderRadius:'5px',color:danger?'#FCA5A5':'#fff',fontSize:'11px',width:26,height:26,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
      {children}
    </button>
  )
}
