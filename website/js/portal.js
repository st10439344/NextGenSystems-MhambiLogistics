(()=>{'use strict';document.addEventListener('DOMContentLoaded',()=>{
 const role=document.body.dataset.role,sessionText=sessionStorage.getItem('mhambi_session');let session;try{session=JSON.parse(sessionText)}catch{};
 if(!session?.token||!session?.user?.role||session.user.role!==role){location.replace('../../public/login.html');return;}
 document.getElementById('userName').textContent=session.user.name||session.user.email||'Account';
 document.getElementById('logout')?.addEventListener('click',async()=>{sessionStorage.removeItem('mhambi_session');location.replace('../../public/login.html');if(session.refreshToken){try{await fetch(new URL('auth/logout',window.MhambiAPI.base()),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken:session.refreshToken})});}catch{}}});
 const bar=document.querySelector('.portal-sidebar');document.querySelector('.sidebar-toggle')?.addEventListener('click',()=>bar.classList.toggle('open'));
 const module=document.body.dataset.module;
 if(module==='index.html')return;
 const status=document.querySelector('.module-status'),dataWrap=document.getElementById('moduleData');
 const routeMap={
  'admin/client-accounts.html':'companies','admin/user-management.html':'users','admin/reports.html':'reports',
  'client/client-track.html':'shipments','client/client-quote.html':'quotations','client/shipment-history.html':'shipments','client/documents.html':'documents','client/company-profile.html':'companies/me','client/support.html':'support',
  'dispatcher/load-board.html':'shipments','dispatcher/assign-shipments.html':'shipments',
  'driver/my-deliveries.html':'driver/deliveries','driver/delivery-history.html':'driver/deliveries',
  'warehouse/inventory-management.html':'inventory','warehouse/receiving.html':'receiving',
  'fleet/vehicle-management.html':'vehicles','fleet/maintenance-schedule.html':'maintenance',
  'finance/invoices.html':'invoices','finance/financial-reports.html':'reports/finance',
  'procurement/purchase-orders.html':'purchase-orders','procurement/suppliers.html':'suppliers'};
 const moduleRoute=routeMap[`${role}/${module}`];
 async function load(){status.textContent='Loading data…';dataWrap.replaceChildren();if(!moduleRoute){status.textContent='This workspace is ready for integration; no matching live API view is configured yet.';return;}try{
  // Endpoint paths are provisional; do not claim production integration before verifying backend routing.
  const u=new URL(moduleRoute,window.MhambiAPI.base());const r=await fetch(u,{headers:{Authorization:`Bearer ${session.token}`,Accept:'application/json'}});
  if(r.status===401||r.status===403){status.textContent=`Access denied (${r.status}). Check role permissions or sign in again.`;return;}
  if(!r.ok)throw Error(`Backend endpoint returned HTTP ${r.status}. Verify the matching route in backend/src.`);
  const payload=await r.json();const records=Array.isArray(payload)?payload:Array.isArray(payload.data)?payload.data:Array.isArray(payload.items)?payload.items:Array.isArray(payload.results)?payload.results:null;
  if(!records){status.textContent='API response received. Data preview:';const pre=document.createElement('pre');pre.textContent=JSON.stringify(payload,null,2).slice(0,5000);pre.style.whiteSpace='pre-wrap';pre.style.overflowWrap='anywhere';dataWrap.append(pre);return;}
  if(!records.length){status.textContent='No records returned by the API.';return;}
  const cols=Object.keys(records.find(x=>x&&typeof x==='object')||{}).slice(0,8);const table=document.createElement('table');table.className='data-table';const head=document.createElement('tr');for(const key of cols){const th=document.createElement('th');th.textContent=key;head.append(th);}table.append(head);
  for(const record of records.slice(0,100)){const tr=document.createElement('tr');for(const key of cols){const td=document.createElement('td');const v=record?.[key];td.textContent=v===null||v===undefined?'—':typeof v==='object'?JSON.stringify(v).slice(0,120):String(v).slice(0,160);tr.append(td);}table.append(tr);}dataWrap.append(table);status.textContent=`Showing ${Math.min(records.length,100)} of ${records.length} records from the backend.`;
 }catch(err){status.textContent=`Could not load data: ${err.message}`;}}
 document.getElementById('refreshModule')?.addEventListener('click',load);load();
});})();