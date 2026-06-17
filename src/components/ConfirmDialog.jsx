import React from 'react'

export function useConfirm() {
  const [dialog, setDialog] = React.useState(null)

  function confirm({ title, message, confirmLabel='Delete', confirmColor='#DC2626', onConfirm }) {
    setDialog({ title, message, confirmLabel, confirmColor, onConfirm })
  }

  function ConfirmDialog() {
    if(!dialog) return null
    return (
      <div onClick={e=>{ if(e.target===e.currentTarget){ setDialog(null) }}}
        style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,backdropFilter:'blur(4px)'}}>
        <div style={{background:'var(--panel)',border:'1px solid var(--border)',borderRadius:'18px',padding:'28px 28px 22px',width:'100%',maxWidth:'380px',boxShadow:'0 24px 64px rgba(0,0,0,.25)'}}>
          {/* Icon */}
          <div style={{width:52,height:52,borderRadius:'14px',background:'#FEF2F2',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'24px',margin:'0 auto 16px'}}>
            🗑
          </div>
          <div style={{fontSize:'17px',fontWeight:800,textAlign:'center',marginBottom:'8px',color:'var(--text)'}}>{dialog.title}</div>
          <div style={{fontSize:'13px',color:'var(--muted)',textAlign:'center',lineHeight:1.6,marginBottom:'22px'}}>{dialog.message}</div>
          <div style={{display:'flex',gap:'10px'}}>
            <button onClick={()=>setDialog(null)}
              style={{flex:1,background:'var(--dim)',border:'1.5px solid var(--border)',borderRadius:'10px',color:'var(--text)',fontSize:'13px',fontWeight:600,padding:'12px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
              Cancel
            </button>
            <button onClick={()=>{ dialog.onConfirm(); setDialog(null) }}
              style={{flex:1,background:dialog.confirmColor||'#DC2626',border:'none',borderRadius:'10px',color:'#fff',fontSize:'13px',fontWeight:700,padding:'12px',cursor:'pointer',fontFamily:'Inter,system-ui,sans-serif'}}>
              {dialog.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return { confirm, ConfirmDialog }
}
