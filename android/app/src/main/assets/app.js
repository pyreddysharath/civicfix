'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pending=new Map();
let config=window.Native?JSON.parse(Native.config()):{server:location.origin,user:{}};
const DEMO_LOGIN=true; // Temporary preview: no server authentication or account access.
let demoSession=false,demoIssues=[];
let currentUser=null, mode='login', active='report', report=null, selected=null, issues=[], reporter=null, listVersion=0;
let verifiedEmail='',verificationToken='',otpEmail='',resendAt=0,authBusy=false,reportBusy=false,resolveBusy=false;
let filters={status:'',country:'',city:'',street:''};
let webToken=sessionStorage.getItem('civicfix-session')||'';
window.nativeReply=(id,result,error)=>{const p=pending.get(id);if(!p)return;clearTimeout(p.timer);pending.delete(id);error?p.reject(Error(error)):p.resolve(result);};
function nativeCall(method,...args){return new Promise((resolve,reject)=>{const id=crypto.randomUUID();const timer=setTimeout(()=>{pending.delete(id);reject(Error('Request timed out. Please try again.'));},150000);pending.set(id,{resolve,reject,timer});Native[method](id,...args);});}
async function api(method,path,body={}){
 if(demoSession){
  if(method==='GET'&&path.startsWith('/issues?'))return {items:demoIssues,next_offset:null};
  if(method==='POST'&&path==='/issues'){
   const created=Date.now()/1000;
   const issue={...body,id:crypto.randomUUID(),user_id:currentUser.id,reporter:currentUser.name,created,deadline:created+body.eta_days*86400,resolved:null,thumbnail:body.photo,proofs:[]};
   demoIssues.unshift(issue);return issue;
  }
  const match=path.match(/^\/issues\/([^/]+)(\/resolve)?$/);
  if(match){const issue=demoIssues.find(i=>i.id===decodeURIComponent(match[1]));if(!issue)throw Error('Demo issue not found.');
   if(method==='POST'&&match[2]){issue.resolved=issue.resolved??Date.now()/1000;if(body.photo)issue.proofs=[{photo:body.photo,accepted:true}];}
   return {...issue};
  }
  if(path==='/auth/logout')return {};
  throw Error('This action requires a connected account.');
 }

 if(window.Native){if(!config.server)throw Error('Set the server address under Server connection to continue.');return nativeCall('request',method,path,JSON.stringify(body));}
 const response=await fetch(path,{method,headers:{'Content-Type':'application/json','Authorization':'Bearer '+webToken},...(method==='POST'?{body:JSON.stringify(body)}:{})});
 let data;try{data=await response.json();}catch{throw Error('The CivicFix server is not available.');}
 if(!response.ok)throw Error(data.error||'Request failed. Please retry.');
 if(data.token){webToken=data.token;sessionStorage.setItem('civicfix-session',webToken);}return data;
}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,6000);}
function status(issue,time=Date.now()/1000){return issue.resolved!==null&&issue.resolved!==undefined?'resolved':time>=issue.deadline?'overdue':'open';}
const labels={open:'Open',overdue:'Overdue',resolved:'Resolved'};
function badge(i){const s=status(i);return `<span class="badge ${s}"><i></i>${labels[s]}</span>`;}
function stamp(t){return new Date(t*1000).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});}
function elapsed(i){const seconds=Math.max(0,(i.resolved??Date.now()/1000)-i.created);const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600);return days?`${days}d ${hours}h`:hours?`${hours}h ${Math.floor(seconds%3600/60)}m`:`${Math.floor(seconds/60)}m`;}
function header(){return `<header><a class="brand" href="#" data-action="home"><span class="brand-icon">✓</span>CivicFix</a>${currentUser?'<button class="text-button" data-action="logout">Log out</button>':''}</header>`;}
function shell(html){$('#app').innerHTML=header()+`<main>${html}</main>`;}
function authPage(){
 currentUser=null;report=null;selected=null;issues=[];listVersion++;
 shell(`<section class="panel auth"><h1>${mode==='register'?'Create an account':'Welcome back'}</h1><p class="subtle">${mode==='register'?'Verify your email to get started.':'Log in to report and track local issues.'}</p>
 <form id="auth-form" ${DEMO_LOGIN&&mode==='login'?'novalidate':''}><label>Email ID<input id="email" name="email" type="email" autocomplete="email" maxlength="254" required></label>
 ${mode==='register'?`<div class="email-actions"><button type="button" class="secondary" id="send-code">Send OTP</button><span id="email-status" role="status"></span></div><div id="otp-section" hidden><label>Verification code<input id="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="6-digit OTP"></label><button type="button" class="secondary" id="verify-code">Verify email</button></div><label>Name<input id="name" autocomplete="name" maxlength="80" required></label>`:''}
 <label>Password<input id="password" name="password" type="password" autocomplete="${mode==='register'?'new-password':'current-password'}" ${mode==='register'?'minlength="10"':''} maxlength="200" required></label>
 ${mode==='register'?'<p class="hint">Use at least 10 characters.</p><label>Confirm password<input id="confirm-password" type="password" autocomplete="new-password" maxlength="200" required></label>':''}
 <p class="error" id="auth-error" role="alert"></p><button type="submit" class="primary full" id="auth-submit">${mode==='register'?'Create account':'Login'}</button></form>
 <button class="secondary full switch-auth" data-action="switch-auth">${mode==='register'?'Back to login':'Create an account'}</button>
 ${window.Native?`<details class="connection"><summary>Server connection</summary><form id="connection-form"><label>Server address<input id="server" type="url" placeholder="https://your-server.example" value="${esc(config.server)}" required></label><button class="secondary" type="submit">Save</button></form></details>`:''}</section>`);
 $('#auth-form').onsubmit=submitAuth;
 if(mode==='register'){
  $('#email').oninput=()=>{verifiedEmail='';verificationToken='';otpEmail='';$('#email-status').textContent='';$('#otp-section').hidden=true;};
  $('#send-code').onclick=sendCode;$('#verify-code').onclick=verifyCode;
 }
 if($('#connection-form'))$('#connection-form').onsubmit=e=>{e.preventDefault();const value=$('#server').value.trim().replace(/\/+$/,'');try{const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error();Native.setServer(value);config=JSON.parse(Native.config());if(config.server!==value)throw Error();toast('Server address saved.');}catch{toast('Enter a valid HTTPS server address.');}};
}
function setAuthBusy(value){authBusy=value;$('#auth-form').querySelectorAll('input,button').forEach(e=>e.disabled=value);}
async function sendCode(){
 if(authBusy)return;if(!$('#email').reportValidity())return;
 const email=$('#email').value.trim().toLowerCase();if(email===otpEmail&&Date.now()<resendAt){toast('Please wait one minute before requesting another code.');return;}
 setAuthBusy(true);$('#auth-error').textContent='';
 try{const result=await api('POST','/auth/send-otp',{email});otpEmail=email;resendAt=Date.now()+result.resend_after*1000;verifiedEmail='';verificationToken='';$('#otp-section').hidden=false;$('#email-status').textContent='OTP sent';$('#send-code').textContent='Resend OTP';toast(result.message);}
 catch(e){$('#auth-error').textContent=e.message;}finally{setAuthBusy(false);}
}
async function verifyCode(){
 if(authBusy)return;const email=$('#email').value.trim().toLowerCase(),code=$('#otp').value.trim();
 if(email!==otpEmail||!/^\d{6}$/.test(code)){toast('Send an OTP to this email and enter the 6-digit code.');return;}
 setAuthBusy(true);$('#auth-error').textContent='';
 try{const result=await api('POST','/auth/verify-otp',{email,code});verifiedEmail=email;verificationToken=result.verification_token;$('#email-status').textContent='✓ Email verified';$('#otp-section').hidden=true;}
 catch(e){$('#auth-error').textContent=e.message;}finally{setAuthBusy(false);}
}
async function submitAuth(event){
 event.preventDefault();if(authBusy)return;
 if(DEMO_LOGIN&&mode==='login'){demoSession=true;currentUser={id:'demo-user',name:'Demo User'};active='report';landing();toast('Login successful — demo mode.');return;}
 const email=$('#email').value.trim().toLowerCase(),password=$('#password').value;
 if(mode==='register'&&(verifiedEmail!==email||!verificationToken)){$('#auth-error').textContent='Verify your email before creating an account.';return;}
 if(mode==='register'&&password!==$('#confirm-password').value){$('#auth-error').textContent='Passwords do not match.';return;}
 const body=mode==='register'?{email,password,name:$('#name').value.trim(),verification_token:verificationToken}:{email,password};
 setAuthBusy(true);$('#auth-error').textContent='';
 try{const result=await api('POST',mode==='register'?'/auth/register':'/auth/login',body);currentUser=result.user;config.user=result.user;verificationToken='';verifiedEmail='';active='report';landing();}
 catch(e){$('#auth-error').textContent=e.message;}finally{authBusy=false;if($('#auth-form'))setAuthBusy(false);}
}
function landing(){
 shell(`<div class="welcome"><h1>Hello, ${esc(currentUser.name)}</h1><p class="subtle">Report a problem. Keep track of its progress.</p></div><div class="actions" aria-label="Issue actions"><button data-action="report" class="${active==='report'?'primary':'secondary'}" aria-pressed="${active==='report'}">Report an Issue</button><button data-action="mine" class="${active==='mine'?'primary':'secondary'}" aria-pressed="${active==='mine'}">My Reported Issues</button></div><div id="content"></div>${demoSession?'<p class="hint">Demo mode · Reports stay in this session and are cleared on logout or app restart.</p>':''}`);
 if(active==='report')renderReport();else loadIssues();
}
function saveReportFields(){if($('#report-form')&&report){report.title=$('#title').value;report.description=$('#description').value;report.eta_days=$('#eta').value;}}
function renderReport(){
 if(!report)report={request_id:crypto.randomUUID(),title:'',description:'',eta_days:7,photo:'',location:null};
 $('#content').innerHTML=`<section class="panel"><h2>Report an Issue</h2><form id="report-form"><label>Image <span class="required">*</span></label><div class="photo-box" id="report-photo">${report.photo?`<img src="${esc(report.photo)}" alt="Selected issue image">`:'<span>Add a photo of the issue</span>'}</div><div class="photo-actions"><button type="button" class="secondary" data-action="upload">Upload image</button>${window.Native?'<button type="button" class="text-button" data-action="camera">Take photo</button>':''}<input type="file" id="image-input" accept="image/jpeg,image/png,image/webp" hidden></div><label>Title <span class="required">*</span><input id="title" maxlength="160" value="${esc(report.title)}" placeholder="What needs to be fixed?" required></label><label>Description <span class="optional">(optional)</span><textarea id="description" maxlength="3000" rows="3" placeholder="Add any useful details">${esc(report.description)}</textarea></label><div class="section-heading"><h3>Location</h3><button type="button" class="text-button" id="refresh-location">Refresh GPS</button></div><p class="hint">Auto-detected from your current GPS location. Cannot be edited.</p><p id="location-status" class="hint" role="status"></p><div class="location-grid">${['country','state','city','street'].map(k=>`<label>${k==='street'?'Street name':k[0].toUpperCase()+k.slice(1)}<input id="${k}" readonly value="${esc(report.location?.[k]||'')}" placeholder="Detecting…"></label>`).join('')}</div><p class="hint" id="coordinates"></p><label>ETA<select id="eta">${Array.from(new Set([7,14,21,28,60,90,Number(report.eta_days)])).sort((a,b)=>a-b).map(d=>`<option value="${d}" ${Number(report.eta_days)===d?'selected':''}>${d%7===0?d/7+' week'+(d===7?'':'s'):d+' days'}${d===7?' (minimum)':''}</option>`).join('')}</select></label><p class="hint">At least one week from submission.</p><p id="report-error" class="error" role="alert"></p><button class="primary full" type="submit" id="submit-report">Submit issue</button></form></section>`;
 $('#report-form').onsubmit=submitReport;$('#refresh-location').onclick=detectLocation;$('#image-input').onchange=e=>pickWebImage(e.target.files[0],false);
 if(report.location)showLocation();else detectLocation();
}
let locating=false;
async function detectLocation(){
 if(locating)return;const target=report;locating=true;
 if($('#location-status')){$('#location-status').textContent='Detecting your location…';$('#refresh-location').disabled=true;}
 try{
  let loc;if(window.Native)loc=await nativeCall('location');else{
   const position=await new Promise((resolve,reject)=>navigator.geolocation?navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:25000,maximumAge:0}):reject(Error('Location is unavailable.')));
   loc={lat:position.coords.latitude,lon:position.coords.longitude,accuracy:position.coords.accuracy};
   Object.assign(loc,await api('POST','/location',loc));
  }
  if(target===report){report.location={...loc,captured:Date.now()/1000};showLocation();}
 }catch(e){if(target===report&&$('#location-status'))$('#location-status').textContent=(e.message||'Location unavailable.')+' Enable location access and retry.';}
 finally{locating=false;if($('#refresh-location'))$('#refresh-location').disabled=false;}
}
function showLocation(){if(!$('#country')||!report?.location)return;const l=report.location;for(const k of ['country','state','city','street']){$('#'+k).value=l[k]||'';$('#'+k).placeholder='Not available';}$('#coordinates').textContent=`GPS: ${Number(l.lat).toFixed(5)}, ${Number(l.lon).toFixed(5)} · Accuracy ±${Math.round(l.accuracy)} m`;$('#location-status').textContent=l.country&&l.city?'Location detected.':'Address unavailable for this location. Please refresh GPS before submitting.';}
async function selectNativePhoto(camera=false,proof=false){
 const target=proof?selected:report;
 try{const result=await nativeCall(camera?'capture':'choosePhoto');if(proof){if(target===selected){selected.latestPhoto=result.photo;showLatestPhoto();}}else if(target===report){report.photo=result.photo;$('#report-photo').innerHTML=`<img src="${esc(result.photo)}" alt="Selected issue image">`;}}
 catch(e){toast(e.message);}
}
async function pickWebImage(file,proof){
 if(!file)return;const target=proof?selected:report;
 try{
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Choose a JPEG, PNG or WebP image under 10 MB.');
  const raw=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(Error('Cannot read image.'));r.readAsDataURL(file);});
  const im=await new Promise((res,rej)=>{const image=new Image();image.onload=()=>res(image);image.onerror=()=>rej(Error('Cannot open image.'));image.src=raw;});
  if(Math.min(im.width,im.height)<160)throw Error('Choose an image at least 160 pixels wide and high.');
  const scale=Math.min(1,1600/Math.max(im.width,im.height)),canvas=document.createElement('canvas');canvas.width=Math.round(im.width*scale);canvas.height=Math.round(im.height*scale);canvas.getContext('2d').drawImage(im,0,0,canvas.width,canvas.height);const photo=canvas.toDataURL('image/jpeg',.85);
  if(proof){if(target===selected){selected.latestPhoto=photo;showLatestPhoto();}}else if(target===report){report.photo=photo;$('#report-photo').innerHTML=`<img src="${esc(photo)}" alt="Selected issue image">`;}
 }catch(e){toast(e.message);}
}
async function submitReport(event){
 event.preventDefault();if(reportBusy)return;saveReportFields();
 if(!report.photo){$('#report-error').textContent='Upload an image of the issue.';return;}
 if(!report.location?.country||!report.location?.city){$('#report-error').textContent='Wait for GPS and address detection, or tap Refresh GPS.';return;}
 const days=Number(report.eta_days);if(!Number.isInteger(days)||days<7){$('#report-error').textContent='ETA must be at least one week.';return;}
 reportBusy=true;$('#submit-report').disabled=true;$('#submit-report').textContent='Submitting…';$('#report-error').textContent='';
 try{await api('POST','/issues',{...report,...report.location,eta_days:days});report=null;active='mine';reporter=null;filters={status:'',country:'',city:'',street:''};landing();toast('Issue reported.');}
 catch(e){if($('#report-error'))$('#report-error').textContent=e.message;}finally{reportBusy=false;if($('#submit-report')){$('#submit-report').disabled=false;$('#submit-report').textContent='Submit issue';}}
}
async function loadIssues(){
 const version=++listVersion;selected=null;$('#content').innerHTML='<section class="panel"><p role="status">Loading your issues…</p></section>';
 try{
  let offset=0,all=[];do{const params=new URLSearchParams({limit:'50',offset:String(offset),...(reporter?{reporter_id:reporter.id}:{mine:'1'})});const data=await api('GET','/issues?'+params);if(version!==listVersion||active!=='mine')return;all.push(...data.items);offset=data.next_offset;}while(offset!==null&&offset!==undefined);
  issues=all;renderList();
 }catch(e){if(version===listVersion&&active==='mine')$('#content').innerHTML=`<section class="panel"><p class="error" role="alert">${esc(e.message)}</p><button class="secondary" data-action="retry-list">Retry</button></section>`;}
}
function options(field){return [...new Set(issues.map(i=>i[field]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));}
function renderList(){
 $('#content').innerHTML=`<section class="panel list-panel"><div class="section-heading"><h2>${reporter?'Issues raised by '+esc(reporter.name):'My Reported Issues'}</h2><button class="text-button" data-action="retry-list">Refresh</button></div><div class="filters" aria-label="Filter issues"><label>Status<select id="filter-status"><option value="">All statuses</option>${Object.entries(labels).map(([v,l])=>`<option value="${v}" ${filters.status===v?'selected':''}>${l}</option>`).join('')}</select></label>${['country','city','street'].map(k=>`<label>${k==='street'?'Street':k[0].toUpperCase()+k.slice(1)}<select id="filter-${k}"><option value="">All ${k==='country'?'countries':k==='city'?'cities':'streets'}</option>${options(k).map(v=>`<option value="${esc(v)}" ${filters[k]===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`).join('')}</div><div class="list-caption"><p class="hint" id="result-count"></p><button class="text-button" data-action="clear-filters">Clear filters</button></div><div id="issues-list"></div></section><div id="issue-detail"></div>`;
 for(const field of Object.keys(filters))$('#filter-'+field).onchange=e=>{filters[field]=e.target.value;selected=null;$('#issue-detail').innerHTML='';renderCards();};renderCards();
}
function renderCards(){
 if(!$('#issues-list'))return;const shown=issues.filter(i=>(!filters.status||status(i)===filters.status)&&['country','city','street'].every(k=>!filters[k]||i[k]===filters[k]));
 $('#result-count').textContent=`${shown.length} issue${shown.length===1?'':'s'}`;
 $('#issues-list').innerHTML=shown.length?shown.map(i=>`<article class="issue-card ${status(i)}"><button class="issue-open" data-action="detail" data-id="${esc(i.id)}" aria-expanded="${selected?.id===i.id}"><div class="issue-row"><img src="${esc(i.thumbnail)}" alt=""><div>${badge(i)}<h3>${esc(i.title)}</h3><p class="hint">${esc([i.street,i.city,i.country].filter(Boolean).join(', '))}</p></div></div><div class="issue-meta"><span>ETA: ${stamp(i.deadline)}</span><span>${i.resolved!==null?'Time taken':'Elapsed'}: ${elapsed(i)}</span></div></button><p class="raised">Raised by <button class="person" data-action="reporter" data-id="${esc(i.user_id)}" data-name="${esc(i.reporter)}">${esc(i.reporter)}</button></p></article>`).join(''):'<p class="empty">'+(issues.length?'No issues match these filters.':'You haven’t reported any issues yet.')+'</p>';
}
async function openIssue(id){
 selected={id};renderCards();$('#issue-detail').innerHTML='<section class="panel"><p role="status">Loading issue details…</p></section>';
 try{const issue=await api('GET','/issues/'+encodeURIComponent(id));if(selected?.id!==id)return;selected=issue;renderDetail();$('#issue-detail').scrollIntoView({behavior:'smooth',block:'start'});}catch(e){if(selected?.id===id)$('#issue-detail').innerHTML=`<section class="panel"><p class="error">${esc(e.message)}</p><button class="secondary" data-action="detail" data-id="${esc(id)}">Retry</button></section>`;}
}
function renderDetail(){
 const i=selected,canResolve=i.user_id===currentUser.id&&i.resolved===null;
 $('#issue-detail').innerHTML=`<section class="panel detail"><div class="section-heading"><h2>Issue details</h2><button class="text-button" data-action="close-detail">Close</button></div><div id="detail-status">${badge(i)}</div><h3>${esc(i.title)}</h3><figure><img class="detail-photo" src="${esc(i.photo)}" alt="Original issue photo"><figcaption>Original photo</figcaption></figure>${i.description?`<p class="description">${esc(i.description)}</p>`:'<p class="hint">No description provided.</p>'}<dl><dt>Raised by</dt><dd><button class="person" data-action="reporter" data-id="${esc(i.user_id)}" data-name="${esc(i.reporter)}">${esc(i.reporter)}</button></dd>${['country','state','city','street'].map(k=>`<dt>${k==='street'?'Street name':k[0].toUpperCase()+k.slice(1)}</dt><dd>${esc(i[k]||'Not available')}</dd>`).join('')}<dt>GPS location</dt><dd>${Number(i.lat).toFixed(5)}, ${Number(i.lon).toFixed(5)}</dd><dt>Raised on</dt><dd>${stamp(i.created)}</dd><dt>ETA</dt><dd>${stamp(i.deadline)} (${Math.round((i.deadline-i.created)/86400)} days)</dd><dt>${i.resolved!==null?'Time taken':'Elapsed'}</dt><dd id="detail-elapsed">${elapsed(i)}</dd>${i.resolved!==null?`<dt>Resolved on</dt><dd>${stamp(i.resolved)}</dd>`:''}</dl>${i.proofs?.filter(p=>p.accepted).map(p=>`<figure><img class="detail-photo" src="${esc(p.photo)}" alt="Latest issue photo"><figcaption>Latest photo</figcaption></figure>`).join('')||''}${canResolve?`<form id="resolve-form"><h3>Mark as resolved</h3><p class="hint">Confirm the issue has been fixed. A latest photo is optional.</p><div id="latest-photo"></div><button type="button" class="secondary" data-action="upload-proof">Add latest photo (optional)</button><input type="file" id="proof-input" accept="image/jpeg,image/png,image/webp" hidden><p id="resolve-error" class="error" role="alert"></p><button type="submit" class="primary full" id="resolve-submit">Mark as resolved</button></form>`:''}</section>`;
 if(canResolve){$('#proof-input').onchange=e=>pickWebImage(e.target.files[0],true);$('#resolve-form').onsubmit=resolveIssue;}
}
function showLatestPhoto(){if($('#latest-photo'))$('#latest-photo').innerHTML=`<img class="detail-photo" src="${esc(selected.latestPhoto)}" alt="Selected latest photo"><button type="button" class="text-button" data-action="remove-proof">Remove photo</button>`;}
async function resolveIssue(event){
 event.preventDefault();if(resolveBusy)return;resolveBusy=true;const id=selected.id;$('#resolve-submit').disabled=true;$('#resolve-submit').textContent='Saving…';
 try{const result=await api('POST','/issues/'+id+'/resolve',{photo:selected.latestPhoto||null});issues=issues.map(i=>i.id===id?result:i);if(selected?.id===id){selected=result;renderDetail();}renderCards();toast('Issue marked as resolved.');}
 catch(e){if($('#resolve-error'))$('#resolve-error').textContent=e.message;}finally{resolveBusy=false;if($('#resolve-submit')){$('#resolve-submit').disabled=false;$('#resolve-submit').textContent='Mark as resolved';}}
}
document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-action]');if(!button)return;event.preventDefault();const action=button.dataset.action;
 if(authBusy||reportBusy||resolveBusy)return;
 if(action==='switch-auth'){mode=mode==='login'?'register':'login';verifiedEmail='';verificationToken='';authPage();}
 if(action==='logout'){try{await api('POST','/auth/logout');}catch{}if(!demoSession){if(window.Native)Native.logout();webToken='';sessionStorage.removeItem('civicfix-session');}demoSession=false;demoIssues=[];currentUser=null;mode='login';authPage();}
 if(action==='report'||action==='home'){if(!currentUser)return;saveReportFields();active='report';listVersion++;selected=null;landing();}
 if(action==='mine'){saveReportFields();active='mine';reporter=null;filters={status:'',country:'',city:'',street:''};landing();}
 if(action==='retry-list')loadIssues();
 if(action==='clear-filters'){filters={status:'',country:'',city:'',street:''};selected=null;renderList();}
 if(action==='upload'||action==='camera'){saveReportFields();if(window.Native)selectNativePhoto(action==='camera');else $('#image-input').click();}
 if(action==='detail')openIssue(button.dataset.id);
 if(action==='close-detail'){selected=null;$('#issue-detail').innerHTML='';renderCards();}
 if(action==='reporter'){reporter={id:button.dataset.id,name:button.dataset.name};filters={status:'',country:'',city:'',street:''};loadIssues();}
 if(action==='upload-proof'){if(window.Native)selectNativePhoto(false,true);else $('#proof-input').click();}
 if(action==='remove-proof'){selected.latestPhoto='';$('#latest-photo').innerHTML='';}
});
window.appBack=()=>{if(selected){selected=null;$('#issue-detail').innerHTML='';renderCards();}else if(mode==='register'&&!currentUser){mode='login';authPage();}else if(currentUser&&active==='mine'){active='report';landing();}};
let lastTimeSignature='';
setInterval(()=>{if(active==='mine'&&currentUser){const signature=issues.map(i=>status(i)+elapsed(i)).join('|');if(signature!==lastTimeSignature){renderCards();lastTimeSignature=signature;}if(selected?.deadline&&$('#detail-status')){$('#detail-status').innerHTML=badge(selected);$('#detail-elapsed').textContent=elapsed(selected);}}},1000);
(async()=>{if(!DEMO_LOGIN&&(config.user?.id||webToken)){shell('<section class="panel"><p role="status">Signing in…</p></section>');try{currentUser=await api('GET','/me');landing();return;}catch{if(window.Native)Native.logout();webToken='';sessionStorage.removeItem('civicfix-session');}}authPage();})();
