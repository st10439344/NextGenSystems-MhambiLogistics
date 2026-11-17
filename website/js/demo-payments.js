(()=>{'use strict';
const M=window.MhambiAPI;
const session=JSON.parse(sessionStorage.getItem('mhambi_session')||'null');
const result=document.getElementById('demoResult'),available=document.getElementById('quoteChoices'),history=document.getElementById('demoHistory');
const money=n=>new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'}).format(Number(n||0));
function say(message,good=false){result.textContent=message;result.className='demo-alert '+(good?'demo-good':'demo-warning');}
async function api(path,method='GET'){
 const r=await fetch(new URL(path,M.base()),{method,headers:{'Authorization':'Bearer '+session.token,'Accept':'application/json'}});
 const json=await r.json();if(!r.ok)throw new Error(json?.error?.message||json?.message||'Request failed');return json;
}
const node=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n};
function card(title,lines){const e=node('article','', 'demo-card');e.append(node('strong',title));lines.forEach(x=>e.append(node('p',x)));return e;}
async function refresh(){
 available.replaceChildren();history.replaceChildren();
 try{
  const payments=await api('demo-payments');
  const paid=new Set(payments.data.map(p=>p.quotationId));
  if(session.user.role==='client'){
   const quotes=await api('quotations?limit=200');
   const accepted=quotes.data.filter(q=>q.status==='accepted');
   if(!accepted.length)available.append(node('p','No accepted quotations yet. Request a quotation and accept its price first.'));
   accepted.forEach(q=>{
    const vat=Math.round(Number(q.quotedAmount)*15)/100,total=Math.round((Number(q.quotedAmount)+vat)*100)/100;
    const item=card(q.reference,[`${q.origin} → ${q.destination}`,`Full demo amount: ${money(total)} (including estimated 15% VAT)`]);
    const button=node('button',paid.has(q.id)?'Already simulated':'Simulate full payment', 'button button-small');
    button.type='button';button.disabled=paid.has(q.id);
    button.addEventListener('click',async()=>{
      if(!confirm(`DEMO ONLY — simulate a full payment of ${money(total)}? No money will be transferred.`))return;
      button.disabled=true;
      try{const response=await api(`demo-payments/${q.id}/simulate`,'POST');say(`${response.message} Reference: ${response.payment.reference}`,true);await refresh();}
      catch(e){say(e.message);button.disabled=false;}
    });item.append(button);available.append(item);
   });
  }else{available.append(node('p','Finance / Administrator view: simulated payments from client accounts are listed below. No real funds are recorded.'));}
  if(!payments.data.length)history.append(node('p','No simulated payments yet.'));
  payments.data.forEach(p=>history.append(card(`${p.reference} · ${money(p.amount)}`,[`Quotation ${p.quotationReference} · ${p.status}`,`Simulated ${new Date(p.paidAt).toLocaleString('en-ZA')} · no real funds received`])));
 }catch(e){say(e.message);}
}
if(!session?.token||!['client','finance','admin'].includes(session?.user?.role)){location.replace('../../public/login.html');return;}
document.getElementById('refreshDemo').addEventListener('click',refresh);refresh();
})();
