import React, { useState, useRef } from 'react'
import { Btn, Modal, ModalTitle, Grid2 } from './UI'

// ── FIELD MAPS PER BOARD ───────────────────────────────────────
// Each board defines its fields with aliases for smart CSV mapping
export const BOARD_SCHEMAS = {
  contacts: {
    label: 'Contacts',
    fields: [
      { key:'first_name',   label:'First Name',     required:true,  aliases:['first','firstname','fname','first name'] },
      { key:'last_name',    label:'Last Name',       required:false, aliases:['last','lastname','lname','last name'] },
      { key:'phone',        label:'Phone',           required:false, aliases:['phone','mobile','cell','phone number','tel'] },
      { key:'phone2',       label:'Phone 2',         required:false, aliases:['phone2','mobile2','secondary phone','alt phone'] },
      { key:'email',        label:'Email',           required:false, aliases:['email','email address','e-mail'] },
      { key:'email2',       label:'Email 2',         required:false, aliases:['email2','secondary email','alt email'] },
      { key:'role',         label:'Type',            required:false, aliases:['type','role','contact type','buyer/seller'] },
      { key:'status',       label:'Status',          required:false, aliases:['status','lead status','stage'] },
      { key:'source',       label:'Lead Source',     required:false, aliases:['source','lead source','how did you hear'] },
      { key:'assigned_agent',label:'Agent',          required:false, aliases:['agent','assigned agent','assigned to'] },
      { key:'budget_max',   label:'Max Budget',      required:false, aliases:['budget','max budget','budget max','price max'] },
      { key:'budget_min',   label:'Min Budget',      required:false, aliases:['min budget','budget min','price min'] },
      { key:'preferred_areas',label:'Areas',         required:false, aliases:['area','areas','location','preferred area','neighborhood'] },
      { key:'city',         label:'City',            required:false, aliases:['city','town'] },
      { key:'birthday',     label:'Birthday',        required:false, aliases:['birthday','dob','date of birth','born'] },
      { key:'notes',        label:'Notes',           required:false, aliases:['notes','note','comments','comment'] },
      { key:'tag',          label:'Tag',             required:false, aliases:['tag','tags','label'] },
    ]
  },
  listings: {
    label: 'Listings',
    fields: [
      { key:'addr',     label:'Address',       required:true,  aliases:['address','addr','street','property address'] },
      { key:'city',     label:'City',          required:true,  aliases:['city','town'] },
      { key:'state',    label:'State',         required:false, aliases:['state','st'] },
      { key:'zip',      label:'ZIP',           required:false, aliases:['zip','zipcode','zip code','postal'] },
      { key:'price',    label:'List Price',    required:false, aliases:['price','list price','asking price','listing price'] },
      { key:'type',     label:'Property Type', required:false, aliases:['type','property type','style','home type'] },
      { key:'beds',     label:'Bedrooms',      required:false, aliases:['beds','bedrooms','bd','br'] },
      { key:'baths',    label:'Bathrooms',     required:false, aliases:['baths','bathrooms','ba'] },
      { key:'sqft',     label:'Sqft',          required:false, aliases:['sqft','sq ft','square feet','size'] },
      { key:'tax',      label:'Tax/Year',      required:false, aliases:['tax','taxes','annual tax','property tax'] },
      { key:'status',   label:'Status',        required:false, aliases:['status','listing status','mls status'] },
      { key:'agents',   label:'Agent',         required:false, aliases:['agent','agents','listing agent'] },
      { key:'lock',     label:'Lockbox',       required:false, aliases:['lockbox','lock','combo'] },
      { key:'mls',      label:'MLS Link',      required:false, aliases:['mls','mls link','mls url','listing url'] },
    ]
  },
  tasks: {
    label: 'Tasks',
    fields: [
      { key:'title',      label:'Title',       required:true,  aliases:['title','task','name','description'] },
      { key:'due_date',   label:'Due Date',    required:false, aliases:['due','due date','deadline','date'] },
      { key:'priority',   label:'Priority',    required:false, aliases:['priority','importance'] },
      { key:'status',     label:'Status',      required:false, aliases:['status','done','complete'] },
    ]
  },
  deals: {
    label: 'Production / Deals',
    fields: [
      { key:'addr',     label:'Address',        required:true,  aliases:['address','property','addr'] },
      { key:'agent',    label:'Agent',          required:false, aliases:['agent','agents'] },
      { key:'gci',      label:'GCI',            required:false, aliases:['gci','commission','gross commission'] },
      { key:'prod',     label:'Production',     required:false, aliases:['production','sale price','price','volume'] },
      { key:'side',     label:'Side',           required:false, aliases:['side','buyer/listing','type'] },
      { key:'stage',    label:'Stage',          required:false, aliases:['stage','status','deal status'] },
      { key:'aoDate',   label:'A/O Date',       required:false, aliases:['ao date','accepted offer date','contract date'] },
      { key:'source',   label:'Source',         required:false, aliases:['source','lead source','how'] },
    ]
  }
}

// ── SMART CSV MAPPER ───────────────────────────────────────────
function autoMap(csvHeaders, fields) {
  const mapping = {}
  csvHeaders.forEach(header => {
    const h = header.toLowerCase().trim()
    for(const field of fields) {
      if(field.key === h || field.label.toLowerCase() === h || field.aliases.some(a => a === h)) {
        mapping[header] = field.key
        break
      }
    }
  })
  return mapping
}

function parseCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  if(lines.length < 2) return { headers:[], rows:[] }
  
  // Handle quoted fields
  function parseLine(line) {
    const result = []
    let current = ''
    let inQuotes = false
    for(let i = 0; i < line.length; i++) {
      if(line[i] === '"') { inQuotes = !inQuotes }
      else if(line[i] === ',' && !inQuotes) { result.push(current.trim()); current = '' }
      else { current += line[i] }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(line => {
    const values = parseLine(line)
    const row = {}
    headers.forEach((h, i) => { row[h] = values[i] || '' })
    return row
  })
  return { headers, rows }
}

function applyMapping(rows, mapping, fields) {
  return rows.map(row => {
    const mapped = {}
    Object.entries(mapping).forEach(([csvCol, fieldKey]) => {
      if(fieldKey && fieldKey !== '__skip__') {
        mapped[fieldKey] = row[csvCol] || ''
      }
    })
    return mapped
  }).filter(row => {
    const required = fields.filter(f => f.required)
    return required.every(f => mapped[f.key] && mapped[f.key].trim())
  })
}

// ── MAIN BULK UPLOAD COMPONENT ─────────────────────────────────
export function BulkUpload({ board, onImport, onClose }) {
  const schema = BOARD_SCHEMAS[board]
  const [step, setStep] = useState(1) // 1=upload, 2=map, 3=preview, 4=done
  const [csvData, setCsvData] = useState(null) // {headers, rows}
  const [mapping, setMapping] = useState({})
  const [preview, setPreview] = useState([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const fileRef = useRef()

  function handleFile(file) {
    if(!file) return
    const reader = new FileReader()
    reader.onload = e => {
      const { headers, rows } = parseCSV(e.target.result)
      setCsvData({ headers, rows })
      // Auto-map columns
      const autoMapped = autoMap(headers, schema.fields)
      // Set unmapped to __skip__
      const fullMapping = {}
      headers.forEach(h => { fullMapping[h] = autoMapped[h] || '__skip__' })
      setMapping(fullMapping)
      setStep(2)
    }
    reader.readAsText(file)
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if(file && (file.name.endsWith('.csv') || file.type === 'text/csv')) handleFile(file)
  }

  function goToPreview() {
    const mapped = applyMapping(csvData.rows, mapping, schema.fields)
    setPreview(mapped)
    setStep(3)
  }

  async function doImport() {
    setImporting(true)
    const result = await onImport(preview)
    setResult(result)
    setImporting(false)
    setStep(4)
  }

  const mappedCount = Object.values(mapping).filter(v => v && v !== '__skip__').length
  const requiredMapped = schema.fields.filter(f => f.required).every(f => Object.values(mapping).includes(f.key))

  return (
    <Modal onClose={onClose} maxWidth={640}>
      <ModalTitle onClose={onClose}>Bulk Import — {schema.label}</ModalTitle>

      {/* Progress steps */}
      <div style={{display:'flex',gap:'0',marginBottom:'22px'}}>
        {['Upload','Map Fields','Preview','Done'].map((s,i)=>(
          <div key={s} style={{flex:1,textAlign:'center'}}>
            <div style={{width:28,height:28,borderRadius:'50%',background:step>i+1?'#16A34A':step===i+1?'#CC2200':'var(--dim)',color:step>=i+1?'#fff':'var(--muted)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:700,margin:'0 auto 4px'}}>
              {step>i+1?'✓':i+1}
            </div>
            <div style={{fontSize:'10px',fontWeight:600,color:step===i+1?'#CC2200':'var(--muted)'}}>{s}</div>
            {i<3&&<div style={{height:2,background:step>i+1?'#16A34A':'var(--border)',position:'relative',top:'-18px',zIndex:-1,margin:'0 14px'}}/>}
          </div>
        ))}
      </div>

      {/* ── STEP 1: UPLOAD ── */}
      {step===1 && (
        <div>
          <div
            onDrop={handleDrop} onDragOver={e=>e.preventDefault()}
            onClick={()=>fileRef.current.click()}
            style={{border:'2px dashed var(--border)',borderRadius:'14px',padding:'40px 24px',textAlign:'center',cursor:'pointer',background:'var(--dim)',transition:'border-color .15s'}}
            onMouseEnter={e=>e.currentTarget.style.borderColor='#CC2200'} onMouseLeave={e=>e.currentTarget.style.borderColor='var(--border)'}>
            <div style={{fontSize:'40px',marginBottom:'12px'}}>📁</div>
            <div style={{fontSize:'15px',fontWeight:700,marginBottom:'4px'}}>Drop your CSV file here</div>
            <div style={{color:'var(--muted)',fontSize:'13px',marginBottom:'16px'}}>or click to browse</div>
            <Btn size="sm" variant="ghost">Choose CSV File</Btn>
            <input ref={fileRef} type="file" accept=".csv,text/csv" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>
          </div>

          {/* Template download */}
          <div style={{marginTop:'16px',background:'var(--dim)',borderRadius:'10px',padding:'13px'}}>
            <div style={{fontSize:'12px',fontWeight:700,marginBottom:'6px'}}>📋 CSV Template — {schema.label}</div>
            <div style={{fontSize:'11px',color:'var(--muted)',marginBottom:'10px'}}>Download a ready-made template with all the right column headers</div>
            <Btn size="sm" variant="ghost" onClick={()=>{
              const headers = schema.fields.map(f=>f.label).join(',')
              const example = schema.fields.map(f=>{
                if(f.key==='first_name') return 'John'
                if(f.key==='last_name') return 'Smith'
                if(f.key==='phone') return '845-555-1234'
                if(f.key==='email') return 'john@email.com'
                if(f.key==='role') return 'Buyer'
                if(f.key==='status') return 'New'
                if(f.key==='addr') return '47 Main St'
                if(f.key==='city') return 'Suffern'
                return ''
              }).join(',')
              const b = new Blob([headers+'\n'+example],{type:'text/csv'})
              const a = document.createElement('a'); a.href=URL.createObjectURL(b); a.download=board+'_template.csv'; a.click()
            }}>⬇ Download Template</Btn>
          </div>

          {/* Accepted formats */}
          <div style={{marginTop:'12px',fontSize:'11px',color:'var(--muted)',textAlign:'center'}}>
            Accepts .csv files · Any column order · Unmapped columns are skipped
          </div>
        </div>
      )}

      {/* ── STEP 2: MAP FIELDS ── */}
      {step===2 && csvData && (
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
            <div>
              <div style={{fontSize:'13px',fontWeight:700}}>{csvData.rows.length} rows detected · {csvData.headers.length} columns</div>
              <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>{mappedCount} columns mapped · Green = auto-detected</div>
            </div>
            {!requiredMapped && <div style={{fontSize:'11px',color:'#DC2626',fontWeight:600}}>⚠ Map required fields first</div>}
          </div>

          <div style={{maxHeight:'380px',overflowY:'auto'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 24px 1fr',gap:'8px',alignItems:'center',padding:'8px 0',borderBottom:'2px solid var(--border)',marginBottom:'8px'}}>
              <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px'}}>CSV Column</div>
              <div/>
              <div style={{fontSize:'10px',fontWeight:700,color:'var(--muted)',textTransform:'uppercase',letterSpacing:'.7px'}}>Maps To</div>
            </div>

            {csvData.headers.map(header => {
              const isAutoMapped = mapping[header] && mapping[header] !== '__skip__'
              const isMapped = mapping[header] && mapping[header] !== '__skip__'
              const field = schema.fields.find(f=>f.key===mapping[header])
              const isRequired = field?.required

              return (
                <div key={header} style={{display:'grid',gridTemplateColumns:'1fr 24px 1fr',gap:'8px',alignItems:'center',marginBottom:'6px'}}>
                  {/* CSV column name */}
                  <div style={{background:'var(--dim)',borderRadius:'8px',padding:'9px 12px',fontSize:'12px',fontWeight:600,border:'1px solid var(--border)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                    {header}
                    {csvData.rows[0] && <div style={{fontSize:'10px',color:'var(--muted)',marginTop:'2px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>e.g. {csvData.rows[0][header]}</div>}
                  </div>

                  {/* Arrow */}
                  <div style={{textAlign:'center',color:isMapped?'#16A34A':'var(--muted)',fontSize:'14px',fontWeight:700}}>→</div>

                  {/* Field selector */}
                  <select value={mapping[header]||'__skip__'} onChange={e=>setMapping(m=>({...m,[header]:e.target.value}))}
                    style={{background:isMapped?'rgba(22,163,74,.06)':'var(--inp)',border:'1.5px solid '+(isMapped?'#16A34A':isRequired?'#FCA5A5':'var(--border)'),borderRadius:'8px',color:'var(--text)',fontSize:'12px',fontFamily:'Inter,system-ui,sans-serif',padding:'9px 10px',outline:'none'}}>
                    <option value="__skip__">— Skip this column —</option>
                    {schema.fields.map(f=>(
                      <option key={f.key} value={f.key}>{f.label}{f.required?' *':''}</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>

          <div style={{display:'flex',gap:'8px',justifyContent:'space-between',marginTop:'14px'}}>
            <Btn variant="ghost" onClick={()=>setStep(1)}>← Back</Btn>
            <Btn onClick={goToPreview} disabled={!requiredMapped}>Preview Import →</Btn>
          </div>
        </div>
      )}

      {/* ── STEP 3: PREVIEW ── */}
      {step===3 && (
        <div>
          <div style={{background:preview.length>0?'rgba(22,163,74,.06)':'#FEF2F2',border:'1px solid '+(preview.length>0?'#86EFAC':'#FECACA'),borderRadius:'10px',padding:'12px 14px',marginBottom:'14px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:'13px',fontWeight:700,color:preview.length>0?'#16A34A':'#DC2626'}}>{preview.length} records ready to import</div>
              <div style={{fontSize:'11px',color:'var(--muted)',marginTop:'2px'}}>
                {csvData.rows.length - preview.length > 0 && (csvData.rows.length - preview.length) + " rows skipped (missing required fields)"}
              </div>
            </div>
            <div style={{fontSize:'24px',fontWeight:900,color:preview.length>0?'#16A34A':'#DC2626'}}>{preview.length}</div>
          </div>

          {preview.length > 0 && (
            <div style={{maxHeight:'300px',overflowY:'auto',overflowX:'auto',marginBottom:'14px'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'11px'}}>
                <thead>
                  <tr style={{background:'var(--dim)'}}>
                    <th style={{padding:'8px 10px',textAlign:'left',fontWeight:700,color:'var(--muted)',borderBottom:'1px solid var(--border)'}}>
                      #
                    </th>
                    {schema.fields.filter(f=>Object.values(mapping).includes(f.key)).map(f=>(
                      <th key={f.key} style={{padding:'8px 10px',textAlign:'left',fontWeight:700,color:'var(--muted)',borderBottom:'1px solid var(--border)',whiteSpace:'nowrap'}}>
                        {f.label}{f.required&&<span style={{color:'#CC2200'}}>*</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0,10).map((row,i)=>(
                    <tr key={i} style={{borderBottom:'1px solid var(--border)'}} onMouseEnter={e=>e.currentTarget.style.background='var(--hov)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <td style={{padding:'8px 10px',color:'var(--muted)',fontWeight:600}}>{i+1}</td>
                      {schema.fields.filter(f=>Object.values(mapping).includes(f.key)).map(f=>(
                        <td key={f.key} style={{padding:'8px 10px',maxWidth:'150px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{row[f.key]||'—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 10 && <div style={{padding:'10px',textAlign:'center',color:'var(--muted)',fontSize:'11px'}}>...and {preview.length-10} more records</div>}
            </div>
          )}

          <div style={{display:'flex',gap:'8px',justifyContent:'space-between'}}>
            <Btn variant="ghost" onClick={()=>setStep(2)}>← Back</Btn>
            <Btn onClick={doImport} disabled={importing||preview.length===0} variant="green">
              {importing ? 'Importing...' : "Import " + (preview.length) + " Records →"}
            </Btn>
          </div>
        </div>
      )}

      {/* ── STEP 4: DONE ── */}
      {step===4 && result && (
        <div style={{textAlign:'center',padding:'20px 0'}}>
          <div style={{fontSize:'52px',marginBottom:'14px'}}>{result.errors===0?'🎉':'⚠️'}</div>
          <div style={{fontSize:'20px',fontWeight:900,marginBottom:'6px',color:result.errors===0?'#16A34A':'#D97706'}}>
            {result.errors===0 ? 'Import Complete!' : 'Import Finished with Issues'}
          </div>
          <div style={{color:'var(--muted)',fontSize:'13px',marginBottom:'20px'}}>
            <strong style={{color:'#16A34A'}}>{result.imported} records imported</strong>
            {result.errors > 0 && <span> · <strong style={{color:'#DC2626'}}>{result.errors} failed</strong></span>}
            {result.updated > 0 && <span> · <strong style={{color:'#0EA5E9'}}>{result.updated} updated</strong></span>}
          </div>
          {result.errorDetails && result.errorDetails.length > 0 && (
            <div style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:'10px',padding:'12px',marginBottom:'16px',textAlign:'left',maxHeight:'120px',overflowY:'auto'}}>
              {result.errorDetails.slice(0,5).map((e,i)=>(
                <div key={i} style={{fontSize:'11px',color:'#DC2626',marginBottom:'3px'}}>Row {e.row}: {e.error}</div>
              ))}
            </div>
          )}
          <Btn style={{width:'100%'}} onClick={onClose}>Done</Btn>
        </div>
      )}
    </Modal>
  )
}
