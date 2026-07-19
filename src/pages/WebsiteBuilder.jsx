// TargetOS V2 — Website Builder (CRM Admin)
// Edit every section of the public website from here
import React, { useState, useEffect, useRef } from 'react'
import { AddressAutocomplete } from '../components/AddressAutocomplete'
import { useNavigate } from 'react-router-dom'
import { useApp }  from '../context/AppContext'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { Btn } from '../components/UI'

const ff = 'Inter, system-ui, -apple-system, sans-serif'

const SECTIONS = [
  { id:'settings',     label:'⚙️ Site Settings',    desc:'Colors, phone, email, social links' },
  { id:'navbar',       label:'🧭 Navigation',        desc:'Menu links and logo text' },
  { id:'hero',         label:'🦸 Hero Section',      desc:'Headline, subheadline, search bar, CTA button' },
  { id:'about',        label:'ℹ️ About Section',      desc:'Story, stats, team photo' },
  { id:'testimonials', label:'⭐ Testimonials',       desc:'Client reviews and ratings' },
  { id:'contact',      label:'📬 Contact Info',       desc:'Contact page title and details' },
]

const DEFAULTS = {
  settings: { primaryColor:'#CC2200', secondaryColor:'#1B2B4B', fontFamily:'Inter, system-ui, sans-serif', phone:'845.424.1014', email:'info@targetreteam.com', address:'Monsey, NY', facebook:'thetargetteam', instagram:'thetargetteam', logoText:'TARGET TEAM', tagline:'Of Keller Williams Valley Realty' },
  hero: { headline:'Find Your Dream Home in Rockland County', subheadline:'The Target Team specializes in Monsey, Spring Valley, New City, Nanuet, and surrounding areas.', ctaText:'Search Homes', ctaUrl:'/public/listings', bgType:'gradient', bgImage:'', showSearch:true },
  about: { title:'About Target Team', body:'Target Team at Keller Williams Valley Realty is Rockland County\'s premier real estate team.\n\nWe specialize in residential properties across Monsey, Spring Valley, New City, Nanuet, Suffern, and surrounding communities.', stats:[{number:'500+',label:'Homes Sold'},{number:'$250M+',label:'In Sales Volume'},{number:'10+',label:'Years Experience'},{number:'5★',label:'Average Rating'}], image:'' },
  testimonials: [{name:'Chani R.',text:'Target Team made our home search effortless!',stars:5},{name:'Moshe K.',text:'Professional, knowledgeable, and always responsive.',stars:5},{name:'Rachel B.',text:'Sold our house above asking price in just 4 days!',stars:5}],
  contact: { title:'Get In Touch', subtitle:'Ready to buy or sell? We\'re here to help.' },
  navbar: { links:[{label:'Home',url:'/public/home'},{label:'Listings',url:'/public/listings'},{label:'Sold',url:'/public/sold'},{label:'About',url:'/public/about'},{label:'Contact',url:'/public/contact'}] },
}

function ImageUploader({ value, onChange, label }) {
  const ref = useRef(null)
  const [uploading, setUploading] = useState(false)

  async function upload(e) {
    const file = e.target.files[0]; if (!file) return
    setUploading(true)
    try {
      const path = 'website/' + Date.now() + '.' + file.name.split('.').pop()
      const { error } = await supabase.storage.from('website-assets').upload(path, file, { upsert: true })
      if (error) throw error
      const { data } = supabase.storage.from('website-assets').getPublicUrl(path)
      onChange(data.publicUrl)
    } catch(e) {
      toast('Upload failed: ' + e.message + ' — Create "website-assets" bucket in Supabase Storage (Public).', '#DC2626')
    } finally { setUploading(false) }
  }

  return (
    <div>
      <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:5 }}>{label}</div>
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <label style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:8, border:'1.5px dashed '+(value?'#10B981':'var(--border)'), cursor:'pointer', background:'var(--dim)', flex:1 }}>
          <input ref={ref} type="file" accept="image/*" onChange={upload} style={{ display:'none' }} />
          <span style={{ fontSize:16 }}>{value?'✅':'🖼'}</span>
          <span style={{ fontSize:12, color:'var(--muted)' }}>{uploading?'Uploading...':value?'Image uploaded':'Click to upload'}</span>
        </label>
        {value && (
          <>
            <img src={value} alt="" style={{ width:52, height:40, objectFit:'cover', borderRadius:7, border:'1px solid var(--border)' }} />
            <button onClick={() => onChange('')} style={{ background:'none', border:'none', cursor:'pointer', color:'#DC2626', fontSize:18 }}>×</button>
          </>
        )}
      </div>
      {value && (
        <input value={value} onChange={e => onChange(e.target.value)} placeholder="or paste image URL"
          style={{ marginTop:6, width:'100%', padding:'6px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--muted)', fontSize:11, fontFamily:ff, boxSizing:'border-box' }} />
      )}
    </div>
  )
}

export function WebsiteBuilder() {
  const { toast }  = useApp()
  const { agent, isAdmin } = useAuth()
  const navigate   = useNavigate()

  const [activeSection, setActiveSection] = useState('settings')
  const [content,       setContent]       = useState({})
  const [saving,        setSaving]        = useState(false)
  const [saved,         setSaved]         = useState({})  // { sectionId: true }

  useEffect(() => {
    supabase.from('website_content').select('section,content').then(({ data }) => {
      const loaded = {}
      ;(data || []).forEach(row => { loaded[row.section] = row.content })
      setContent(loaded)
    })
  }, [])

  function get(section) {
    return { ...(DEFAULTS[section] || {}), ...(content[section] || {}) }
  }

  function setField(section, key, value) {
    setContent(prev => ({
      ...prev,
      [section]: { ...(DEFAULTS[section]||{}), ...(prev[section]||{}), [key]: value }
    }))
  }

  async function saveSection(section) {
    setSaving(true)
    try {
      const data = { ...(DEFAULTS[section]||{}), ...(content[section]||{}) }
      // Check if exists
      const { data: existing } = await supabase.from('website_content').select('id').eq('section', section).maybeSingle()
      if (existing?.id) {
        const { error } = await supabase.from('website_content').update({ content: data, updated_at: new Date().toISOString() }).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('website_content').insert({ section, content: data, updated_at: new Date().toISOString() })
        if (error) throw error
      }
      setSaved(p => ({ ...p, [section]: true }))
      toast('✅ ' + section + ' saved')
      setTimeout(() => setSaved(p => ({ ...p, [section]: false })), 3000)
    } catch(e) { toast('Save failed: ' + e.message, '#DC2626') }
    finally { setSaving(false) }
  }

  const F = ({ label, children }) => (
    <div style={{ marginBottom:14 }}>
      <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:4 }}>{label}</div>
      {children}
    </div>
  )
  const I = ({ value, onChange, placeholder, type='text', disabled }) => (
    <input type={type} value={value||''} onChange={e=>onChange(e.target.value)} placeholder={placeholder} disabled={disabled}
      style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background: disabled?'var(--dim)':'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, boxSizing:'border-box' }} />
  )
  const TA = ({ value, onChange, rows=4, placeholder }) => (
    <textarea value={value||''} onChange={e=>onChange(e.target.value)} rows={rows} placeholder={placeholder}
      style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff, resize:'vertical', boxSizing:'border-box' }} />
  )

  const sec = get(activeSection)

  function renderEditor() {
    if (activeSection === 'settings') {
      return (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 20px' }}>
          <F label="Logo Text"><I value={sec.logoText} onChange={v=>setField('settings','logoText',v)} placeholder="TARGET TEAM" /></F>
          <F label="Tagline"><I value={sec.tagline} onChange={v=>setField('settings','tagline',v)} placeholder="Of KW Valley Realty" /></F>
          <F label="Phone"><I value={sec.phone} onChange={v=>setField('settings','phone',v)} placeholder="845.424.1014" /></F>
          <F label="Email"><I value={sec.email} onChange={v=>setField('settings','email',v)} placeholder="info@targetreteam.com" type="email" /></F>
          <F label="Office Address"><AddressAutocomplete value={sec.address} onChange={v=>setField('settings','address',v)} onSelect={s2=>setField('settings','address', s2.full || s2.street)} placeholder="Monsey, NY" /></F>
          <F label="Facebook handle"><I value={sec.facebook} onChange={v=>setField('settings','facebook',v)} placeholder="thetargetteam" /></F>
          <F label="Instagram handle"><I value={sec.instagram} onChange={v=>setField('settings','instagram',v)} placeholder="thetargetteam" /></F>
          <div />
          <F label="Primary Color (accent/buttons)">
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input type="color" value={sec.primaryColor||'#CC2200'} onChange={e=>setField('settings','primaryColor',e.target.value)}
                style={{ width:42, height:34, borderRadius:7, border:'1px solid var(--border)', cursor:'pointer', padding:2 }} />
              <I value={sec.primaryColor} onChange={v=>setField('settings','primaryColor',v)} />
            </div>
          </F>
          <F label="Secondary Color (nav/footer)">
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input type="color" value={sec.secondaryColor||'#1B2B4B'} onChange={e=>setField('settings','secondaryColor',e.target.value)}
                style={{ width:42, height:34, borderRadius:7, border:'1px solid var(--border)', cursor:'pointer', padding:2 }} />
              <I value={sec.secondaryColor} onChange={v=>setField('settings','secondaryColor',v)} />
            </div>
          </F>
          <div style={{ gridColumn:'1/-1' }}>
            <F label="Font Family">
              <select value={sec.fontFamily||'Inter, system-ui, sans-serif'} onChange={e=>setField('settings','fontFamily',e.target.value)}
                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--inp)', color:'var(--text)', fontSize:13, fontFamily:ff }}>
                <option value="Inter, system-ui, sans-serif">Inter (modern)</option>
                <option value="Georgia, 'Times New Roman', serif">Georgia (elegant)</option>
                <option value="Arial, Helvetica, sans-serif">Arial (clean)</option>
                <option value="Trebuchet MS, sans-serif">Trebuchet</option>
              </select>
            </F>
          </div>
        </div>
      )
    }

    if (activeSection === 'hero') {
      return (
        <div>
          <F label="Main Headline"><I value={sec.headline} onChange={v=>setField('hero','headline',v)} placeholder="Find Your Dream Home..." /></F>
          <F label="Sub-headline"><TA value={sec.subheadline} onChange={v=>setField('hero','subheadline',v)} rows={3} /></F>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0 16px' }}>
            <F label="CTA Button Text"><I value={sec.ctaText} onChange={v=>setField('hero','ctaText',v)} placeholder="Browse Listings" /></F>
            <F label="CTA Button Link"><I value={sec.ctaUrl} onChange={v=>setField('hero','ctaUrl',v)} placeholder="/public/listings" /></F>
          </div>
          <F label="Background">
            <div style={{ display:'flex', gap:8, marginBottom:10 }}>
              {[['gradient','Color Gradient'],['image','Background Image']].map(([v,l]) => (
                <button key={v} onClick={() => setField('hero','bgType',v)}
                  style={{ padding:'7px 16px', borderRadius:8, border:'1px solid '+(sec.bgType===v?'#CC2200':'var(--border)'), background:sec.bgType===v?'rgba(204,34,0,.1)':'var(--dim)', color:sec.bgType===v?'#CC2200':'var(--muted)', fontSize:12, fontWeight:sec.bgType===v?700:400, cursor:'pointer', fontFamily:ff }}>
                  {l}
                </button>
              ))}
            </div>
            {sec.bgType === 'image' && <ImageUploader value={sec.bgImage} onChange={v=>setField('hero','bgImage',v)} label="Hero background image" />}
          </F>
          <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, color:'var(--text)', cursor:'pointer' }}>
            <input type="checkbox" checked={sec.showSearch!==false} onChange={e=>setField('hero','showSearch',e.target.checked)} />
            Show property search bar in hero
          </label>
        </div>
      )
    }

    if (activeSection === 'about') {
      return (
        <div>
          <F label="Section Title"><I value={sec.title} onChange={v=>setField('about','title',v)} /></F>
          <F label="Body Text (use two blank lines for paragraphs)"><TA value={sec.body} onChange={v=>setField('about','body',v)} rows={8} /></F>
          <F label="Team Photo"><ImageUploader value={sec.image} onChange={v=>setField('about','image',v)} label="Team / office photo" /></F>
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--text)', marginBottom:10 }}>Stats (shown below hero)</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {(sec.stats||[]).map((stat, i) => (
                <div key={i} style={{ padding:12, background:'var(--dim)', borderRadius:9, border:'1px solid var(--border)' }}>
                  <F label={'Stat ' + (i+1) + ' Number'}>
                    <I value={stat.number} onChange={v=>{const s=[...(sec.stats||[])];s[i]={...s[i],number:v};setField('about','stats',s)}} placeholder="500+" />
                  </F>
                  <F label="Label">
                    <I value={stat.label} onChange={v=>{const s=[...(sec.stats||[])];s[i]={...s[i],label:v};setField('about','stats',s)}} placeholder="Homes Sold" />
                  </F>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    }

    if (activeSection === 'testimonials') {
      const tests = sec.length > 0 ? sec : (DEFAULTS.testimonials)
      return (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ fontSize:13, color:'var(--muted)' }}>Edit client reviews shown on homepage</div>
            <button onClick={() => {
              const t = Array.isArray(content.testimonials) ? [...content.testimonials] : [...DEFAULTS.testimonials]
              t.push({ name:'New Client', text:'Great experience with the team!', stars:5 })
              setContent(p => ({ ...p, testimonials: t }))
            }} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:ff }}>
              + Add Review
            </button>
          </div>
          {(Array.isArray(content.testimonials) ? content.testimonials : DEFAULTS.testimonials).map((t, i) => (
            <div key={i} style={{ background:'var(--dim)', borderRadius:10, border:'1px solid var(--border)', padding:'12px 14px', marginBottom:10 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                <F label={'Name'}>
                  <I value={t.name} onChange={v=>{const ts=[...(content.testimonials||DEFAULTS.testimonials)];ts[i]={...ts[i],name:v};setContent(p=>({...p,testimonials:ts}))}} placeholder="Client Name" />
                </F>
                <F label="Stars (1-5)">
                  <div style={{ display:'flex', gap:4 }}>
                    {[1,2,3,4,5].map(n => (
                      <button key={n} onClick={() => {const ts=[...(content.testimonials||DEFAULTS.testimonials)];ts[i]={...ts[i],stars:n};setContent(p=>({...p,testimonials:ts}))}}
                        style={{ fontSize:20, background:'none', border:'none', cursor:'pointer', color:n<=t.stars?'#F5A623':'#CBD5E1' }}>★</button>
                    ))}
                  </div>
                </F>
              </div>
              <F label="Review Text">
                <TA value={t.text} onChange={v=>{const ts=[...(content.testimonials||DEFAULTS.testimonials)];ts[i]={...ts[i],text:v};setContent(p=>({...p,testimonials:ts}))}} rows={2} />
              </F>
              <button onClick={() => {const ts=[...(content.testimonials||DEFAULTS.testimonials)];ts.splice(i,1);setContent(p=>({...p,testimonials:ts}))}}
                style={{ fontSize:11, color:'#DC2626', background:'none', border:'none', cursor:'pointer', fontFamily:ff }}>Remove</button>
            </div>
          ))}
        </div>
      )
    }

    if (activeSection === 'contact') {
      return (
        <div>
          <F label="Page Title"><I value={sec.title} onChange={v=>setField('contact','title',v)} /></F>
          <F label="Subtitle"><I value={sec.subtitle} onChange={v=>setField('contact','subtitle',v)} /></F>
          <div style={{ padding:'10px 14px', background:'var(--dim)', borderRadius:9, border:'1px solid var(--border)', fontSize:12, color:'var(--muted)', lineHeight:1.7, marginTop:8 }}>
            Phone, email, and address are pulled from <strong>⚙️ Site Settings</strong>. Contact form submissions go directly to the CRM Contacts board.
          </div>
        </div>
      )
    }

    if (activeSection === 'navbar') {
      const links = sec.links || DEFAULTS.navbar.links
      return (
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ fontSize:13, color:'var(--muted)' }}>Navigation menu links</div>
            <button onClick={() => {
              const l = [...(content.navbar?.links || DEFAULTS.navbar.links), { label:'New Page', url:'/public/home' }]
              setContent(p => ({ ...p, navbar: { ...p.navbar, links: l } }))
            }} style={{ padding:'6px 14px', borderRadius:8, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:ff }}>
              + Add Link
            </button>
          </div>
          {links.map((link, i) => (
            <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr auto', gap:8, alignItems:'end', marginBottom:8 }}>
              <F label={i===0?'Label':''}><I value={link.label} onChange={v=>{const l=[...links];l[i]={...l[i],label:v};setContent(p=>({...p,navbar:{...p.navbar,links:l}}))}} /></F>
              <F label={i===0?'URL':''}><I value={link.url} onChange={v=>{const l=[...links];l[i]={...l[i],url:v};setContent(p=>({...p,navbar:{...p.navbar,links:l}}))}} /></F>
              <button onClick={() => {const l=[...links];l.splice(i,1);setContent(p=>({...p,navbar:{...p.navbar,links:l}}))}}
                style={{ marginBottom:14, padding:'8px', borderRadius:7, border:'1px solid var(--border)', background:'var(--dim)', color:'#DC2626', cursor:'pointer', fontFamily:ff }}>×</button>
            </div>
          ))}
        </div>
      )
    }

    return <div style={{ color:'var(--muted)', fontSize:13 }}>Select a section to edit</div>
  }

  const activeSec = SECTIONS.find(s => s.id === activeSection)

  return (
    <div style={{ fontFamily:ff }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:900, color:'var(--text)' }}>🌐 Website Builder</div>
          <div style={{ fontSize:13, color:'var(--muted)', marginTop:2 }}>Edit every section of your public website. Changes go live instantly.</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => window.open('/public/home', '_blank')}
            style={{ padding:'8px 16px', borderRadius:9, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--text)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
            👁 Preview Site
          </button>
          <button onClick={() => window.open('/public/listings', '_blank')}
            style={{ padding:'8px 16px', borderRadius:9, border:'1px solid var(--border)', background:'var(--dim)', color:'var(--text)', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:ff }}>
            🏡 View Listings
          </button>
        </div>
      </div>

      {/* SQL reminder */}
      <div style={{ padding:'10px 16px', background:'rgba(59,130,246,.08)', borderRadius:10, border:'1px solid rgba(59,130,246,.2)', marginBottom:16, fontSize:12, color:'#1E40AF', lineHeight:1.6 }}>
        <strong>One-time setup:</strong> Run in Supabase SQL editor:
        <code style={{ display:'block', marginTop:4, fontFamily:'monospace', fontSize:11, background:'rgba(59,130,246,.1)', padding:'6px 10px', borderRadius:6 }}>
          create table if not exists website_content (id uuid default gen_random_uuid() primary key, section text unique not null, content jsonb, updated_at timestamptz default now()); alter table website_content enable row level security; create policy "Allow all" on website_content for all using (true);
        </code>
        Also create a Supabase Storage bucket named <strong>website-assets</strong> (Public) for images.
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'220px 1fr', gap:16 }}>
        {/* Left: section list */}
        <div>
          {SECTIONS.map(sec => (
            <div key={sec.id} onClick={() => setActiveSection(sec.id)}
              style={{ padding:'11px 14px', borderRadius:10, cursor:'pointer', marginBottom:4, border:'1.5px solid '+(activeSection===sec.id?'#CC2200':'transparent'), background:activeSection===sec.id?'rgba(204,34,0,.06)':'var(--dim)', transition:'all .12s' }}>
              <div style={{ fontSize:13, fontWeight:activeSection===sec.id?800:600, color:activeSection===sec.id?'#CC2200':'var(--text)' }}>{sec.label}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, lineHeight:1.3 }}>{sec.desc}</div>
              {saved[sec.id] && <div style={{ fontSize:10, color:'#10B981', fontWeight:700, marginTop:3 }}>✅ Saved</div>}
            </div>
          ))}
        </div>

        {/* Right: editor */}
        <div style={{ background:'var(--panel)', borderRadius:14, border:'1px solid var(--border)', overflow:'hidden' }}>
          <div style={{ padding:'13px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--dim)' }}>
            <div>
              <div style={{ fontSize:14, fontWeight:800, color:'var(--text)' }}>{activeSec?.label}</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>{activeSec?.desc}</div>
            </div>
            <Btn onClick={() => saveSection(activeSection)} loading={saving} style={{ minWidth:100 }}>
              {saved[activeSection] ? '✅ Saved!' : '💾 Save'}
            </Btn>
          </div>
          <div style={{ padding:18 }}>
            {renderEditor()}
          </div>
          <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)', display:'flex', justifyContent:'flex-end' }}>
            <Btn onClick={() => saveSection(activeSection)} loading={saving}>
              {saved[activeSection] ? '✅ Saved!' : '💾 Save Changes'}
            </Btn>
          </div>
        </div>
      </div>
    </div>
  )
}
