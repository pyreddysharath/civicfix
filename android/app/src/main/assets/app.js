'use strict';
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pending=new Map();
let config=window.Native?JSON.parse(Native.config()):{server:location.origin,user:{}};
const DEMO_LOGIN=true; // Temporary preview: no server authentication or account access.
let demoSession=false,demoIssues=[];
let currentUser=null, mode='login', active='home', report=null, selected=null, issues=[], reporter=null, listVersion=0;
let verifiedEmail='',verificationToken='',otpEmail='',resendAt=0,authBusy=false,reportBusy=false,resolveBusy=false;
const categories=['Roads & Potholes','Electricity','Street Lighting','Cleaning & Waste','Drainage & Sewage','Water Supply','Construction & Debris','Footpaths & Accessibility','Parks & Public Spaces','Traffic Signs & Signals','Other'];
let issueScope='all',searchCenter=null,searchRadius=3,searchText='',locationPromise=null,locationVersion=0,screenVersion=0;
let picker=null,cropDialog=null,searchMode='distance',fieldQuery='';
let filters={status:'',category:'',country:'',city:''};
let webToken=sessionStorage.getItem('civicfix-session')||'';
window.nativeReply=(id,result,error)=>{const p=pending.get(id);if(!p)return;clearTimeout(p.timer);pending.delete(id);error?p.reject(Error(error)):p.resolve(result);};
function nativeCall(method,...args){return new Promise((resolve,reject)=>{const id=crypto.randomUUID();const timer=setTimeout(()=>{pending.delete(id);reject(Error('Request timed out. Please try again.'));},240000);pending.set(id,{resolve,reject,timer});Native[method](id,...args);});}
async function api(method,path,body={}){
 if(demoSession){
  if(method==='POST'&&path==='/me'){
   const name=String(body.name||'').trim();if(!name||name.length>80)throw Error('Enter a name (maximum 80 characters).');
   currentUser={...currentUser,name,username:body.email||currentUser.username||''};demoIssues.forEach(i=>{if(i.user_id===currentUser.id)i.reporter=name;});return {...currentUser};
  }
  if(method==='GET'&&path.startsWith('/issues?')){
   const q=new URLSearchParams(path.split('?')[1]);let items=demoIssues.filter(i=>(q.get('mine')!=='1'||i.user_id===currentUser.id)&&(!q.get('reporter_id')||i.user_id===q.get('reporter_id')));
   if(q.has('lat')){const lat=Number(q.get('lat')),lon=Number(q.get('lon')),radius=Number(q.get('radius'));items=items.filter(i=>kmBetween(lat,lon,i.lat,i.lon)<=radius).sort((a,b)=>kmBetween(lat,lon,a.lat,a.lon)-kmBetween(lat,lon,b.lat,b.lon));}
   if(q.get('q'))items=items.filter(i=>matchesKeywords([i.title,i.category,i.description,i.reporter,i.country,i.state,i.city,i.street].join(' '),q.get('q')));
   const offset=Number(q.get('offset')||0),limit=Number(q.get('limit')||50);return {items:items.slice(offset,offset+limit),total:items.length,next_offset:offset+limit<items.length?offset+limit:null};
  }
  if(method==='POST'&&path==='/issues'){
   const created=Date.now()/1000;
   const issue={...body,id:crypto.randomUUID(),user_id:currentUser.id,reporter:currentUser.name,title:body.category,created,deadline:created+body.eta_days*86400,resolved:null,thumbnail:body.photo,proofs:[]};
   demoIssues.unshift(issue);return issue;
  }
  const match=path.match(/^\/issues\/([^/]+)(\/resolve)?$/);
  if(match){const issue=demoIssues.find(i=>i.id===decodeURIComponent(match[1]));if(!issue)throw Error('Demo issue not found.');
   if(method==='POST'&&match[2]){issue.resolved=issue.resolved??Date.now()/1000;if(body.photo)issue.proofs=[{photo:body.photo,media_metadata:body.media_metadata,accepted:true}];}
   return {...issue};
  }
  if(path==='/auth/logout')return {};
  throw Error('This action requires a connected account.');
 }

 if(window.Native){if(!config.server)throw Error('Set the server address under Server connection to continue.');return nativeCall('request',method,path,JSON.stringify(body));}
 const response=await fetch(path,{method,headers:{'Content-Type':'application/json','Authorization':'Bearer '+webToken},...(method==='POST'?{body:JSON.stringify(body)}:{})});
 let data;try{data=await response.json();}catch{throw Error('The Nenu Saitham server is not available.');}
 if(!response.ok)throw Error(data.error||'Request failed. Please retry.');
 if(data.token){webToken=data.token;sessionStorage.setItem('civicfix-session',webToken);}return data;
}
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,6000);}
function status(issue,time=Date.now()/1000){return issue.resolved!==null&&issue.resolved!==undefined?'resolved':time>=issue.deadline?'overdue':'open';}
const labels={open:'Open',overdue:'Overdue',resolved:'Closed'};
function badge(i){const s=status(i);return `<span class="badge ${s}"><i></i>${labels[s]}</span>`;}
function stamp(t){return new Date(t*1000).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});}
function elapsed(i){const seconds=Math.max(0,(i.resolved??Date.now()/1000)-i.created);const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600);return days?`${days}d ${hours}h`:hours?`${hours}h ${Math.floor(seconds%3600/60)}m`:`${Math.floor(seconds/60)}m`;}
function initial(){return Array.from((currentUser?.name||'User').trim())[0]?.toUpperCase()||'U';}
function header(){return `<header><a class="brand" href="#" data-action="home"><span class="brand-title" lang="te">నేను సైతం</span><span class="brand-meaning" lang="en">I, too</span></a>${currentUser?`<div class="header-actions"><button class="avatar" data-action="profile" aria-label="Edit profile for ${esc(currentUser.name)}">${esc(initial())}</button></div>`:''}</header>`;}
function shell(html){closeCrop();closePicker();screenVersion++;$('#app').innerHTML=header()+`<main>${html}</main>`;}
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
 if(DEMO_LOGIN&&mode==='login'){demoSession=true;currentUser={id:'demo-user',name:'Demo User'};active='home';landing();toast('Login successful — demo mode.');return;}
 const email=$('#email').value.trim().toLowerCase(),password=$('#password').value;
 if(mode==='register'&&(verifiedEmail!==email||!verificationToken)){$('#auth-error').textContent='Verify your email before creating an account.';return;}
 if(mode==='register'&&password!==$('#confirm-password').value){$('#auth-error').textContent='Passwords do not match.';return;}
 const body=mode==='register'?{email,password,name:$('#name').value.trim(),verification_token:verificationToken}:{email,password};
 setAuthBusy(true);$('#auth-error').textContent='';
 try{const result=await api('POST',mode==='register'?'/auth/register':'/auth/login',body);currentUser=result.user;config.user=result.user;verificationToken='';verifiedEmail='';active='home';landing();}
 catch(e){$('#auth-error').textContent=e.message;}finally{authBusy=false;if($('#auth-form'))setAuthBusy(false);}
}
function landing(){
 shell(`<button data-action="report" class="primary full report-entry">Report an Issue</button><button data-action="issues" class="text-button full issues-entry">Issues</button><div id="content"></div>`);
 if(active==='report')renderReport();
}
function saveReportFields(){if($('#report-form')&&report){report.category=$('#category').value;report.description=$('#description').value;report.eta_days=$('#eta').value;}}
function renderReport(){
 if(!report)report={request_id:crypto.randomUUID(),category:'',description:'',eta_days:7,photo:'',location:null};
 $('#content').innerHTML=`<section class="panel"><h2>Report an Issue</h2><form id="report-form">
 <label>Category<select id="category" required><option value="">Select a category</option>${categories.map(c=>`<option ${report.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label>
 <label>Image or video</label><div class="photo-actions"><button type="button" class="secondary" data-action="camera">Capture</button><button type="button" class="secondary" data-action="upload">Upload</button><input type="file" id="image-input" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" hidden><input type="file" id="camera-input" accept="image/*" capture="environment" hidden></div>
 ${report.photo?`<div class="photo-box" id="report-photo">${mediaMarkup(report.photo,"report")}</div>${isVideo(report.photo)?'':'<button type="button" class="secondary" data-action="crop">Crop image</button>'}<div class="location-summary"><h3>GPS location</h3><p id="location-status" class="hint" role="status"></p><p id="coordinates" class="hint"></p><div class="photo-actions"><button type="button" class="text-button" id="refresh-location">Use current GPS</button><button type="button" class="text-button" data-action="pick-report">Select GPS on map</button></div></div>`:''}
 <p class="hint">Videos: maximum 10 seconds and 10 MB. Saved videos have no audio.</p><label>Description <span class="optional">(optional)</span><textarea id="description" maxlength="3000" rows="3" placeholder="Add any useful details">${esc(report.description)}</textarea></label>
 <label>ETA<select id="eta" required>${[7,14,21,28,60,90].map(d=>`<option value="${d}" ${Number(report.eta_days)===d?'selected':''}>${d%7===0?d/7+' week'+(d===7?'':'s'):d+' days'}${d===7?' (minimum)':''}</option>`).join('')}</select></label><p class="hint">At least one week from submission.</p>
 <p class="hint">${demoSession?'Demo: photos and videos are not scanned or uploaded and last only for this session.':'Photos and sampled video frames are screened before saving. Videos are saved without audio. Screening can miss content.'}</p><p id="report-error" class="error" role="alert"></p><button class="primary full" type="submit" id="submit-report">Submit issue</button></form></section>`;
 $('#report-form').onsubmit=submitReport;if($('#refresh-location'))$('#refresh-location').onclick=()=>detectLocation();$('#image-input').onchange=e=>pickWebImage(e.target.files[0],false);$('#camera-input').onchange=e=>pickWebImage(e.target.files[0],false,true);showLocation();
}
function closeCrop(){if(cropDialog){cropDialog.remove();cropDialog=null;}}
async function openCrop(){
 saveReportFields();const target=report,source=report?.photo;if(!source)return;
 const image=new Image();image.src=source;try{await image.decode();}catch{toast('Cannot open this image for cropping.');return;}
 if(report!==target||active!=='report')return;
 closeCrop();const dialog=cropDialog=document.createElement('dialog');dialog.className='map-dialog';
 dialog.innerHTML='<h2>Crop image</h2><canvas id="crop-preview" aria-label="Crop preview"></canvas><label>Keep image size (%)<input id="crop-size" type="range" min="10" max="100" value="100"></label><label>Horizontal position<input id="crop-x" type="range" min="0" max="100" value="50"></label><label>Vertical position<input id="crop-y" type="range" min="0" max="100" value="50"></label><div class="photo-actions"><button id="crop-save" class="primary">Apply crop</button><button id="crop-cancel" class="secondary">Cancel</button></div>';
 document.body.append(dialog);dialog.showModal();dialog.oncancel=closeCrop;
 const canvas=$('#crop-preview');let rect;
 const draw=()=>{const ratio=Math.max(160/Math.min(image.width,image.height),Number($('#crop-size').value)/100);const width=Math.round(image.width*ratio),height=Math.round(image.height*ratio);rect=[Math.round((image.width-width)*Number($('#crop-x').value)/100),Math.round((image.height-height)*Number($('#crop-y').value)/100),width,height];canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(image,...rect,0,0,width,height);};
 for(const id of ['crop-size','crop-x','crop-y'])$('#'+id).oninput=draw;
 $('#crop-cancel').onclick=closeCrop;$('#crop-save').onclick=()=>{if(report===target){report.photo=canvas.toDataURL('image/jpeg',.9);report.media_metadata={...report.media_metadata,cropped:true,saved_width:canvas.width,saved_height:canvas.height};closeCrop();renderReport();}};draw();
}
function validLocation(l){return l&&Number.isFinite(l.lat)&&Number.isFinite(l.lon)&&Math.abs(l.lat)<=90&&Math.abs(l.lon)<=180;}
function locationName(l){return [l?.city,l?.area,l?.street,l?.state,l?.country].filter(Boolean).join(', ')||(validLocation(l)?`${l.lat.toFixed(5)}, ${l.lon.toFixed(5)}`:'No location selected');}
function kmBetween(a,b,c,d){const rad=x=>x*Math.PI/180;const h=Math.sin(rad(c-a)/2)**2+Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(rad(d-b)/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))));}
function currentLocation(){
 if(!locationPromise)locationPromise=(async()=>{
  let l;if(window.Native)l=await nativeCall('location');else{const p=await new Promise((ok,no)=>navigator.geolocation?navigator.geolocation.getCurrentPosition(ok,no,{enableHighAccuracy:true,timeout:25000,maximumAge:0}):no(Error('GPS is unavailable. Select a location on the map.')));l={lat:p.coords.latitude,lon:p.coords.longitude,accuracy:p.coords.accuracy};}
  if(!validLocation(l))throw Error('GPS returned an invalid location.');return {...l,source:'gps',captured:Date.now()/1000};
 })().finally(()=>locationPromise=null);return locationPromise;
}
async function detectLocation(){
 const target=report,version=++locationVersion;if(!target)return;target.location=null;target.locating=true;showLocation();
 try{const l=await currentLocation();if(report===target&&version===locationVersion){target.location=l;}}
 catch(e){if(report===target&&version===locationVersion)target.locationError=e.message||'GPS unavailable. Select a point on the map.';}
 finally{if(report===target&&version===locationVersion){target.locating=false;showLocation();}}
}
function showLocation(){
 if(!$('#location-status')||!report)return;const l=report.location;
 $('#location-status').textContent=report.locating?'Detecting your current GPS…':validLocation(l)?['Country: '+(l.country||'Not available'),'State: '+(l.state||'Not available'),'City: '+(l.city||'Not available'),'Area: '+(l.area||'Not available'),'Street: '+(l.street||'Not available')].join(' · '):(report.locationError||'Capture a photo to detect GPS, use current GPS, or select a point on the map.');
 $('#coordinates').textContent=validLocation(l)?`${l.source==='map'?'Selected point':'Current GPS'}: ${l.lat.toFixed(5)}, ${l.lon.toFixed(5)}${l.source==='gps'?' · Accuracy ±'+Math.round(l.accuracy)+' m':''}`:'';
 $('#refresh-location').disabled=!!report.locating;
}
async function searchPlaces(query){
 const text=query.trim();if(text.length<2||text.length>200)throw Error('Enter a city, street or area (2–200 characters).');
 // Coordinate entry also works offline and in the web preview.
 const match=text.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
 if(match){const l={lat:Number(match[1]),lon:Number(match[2]),accuracy:0};if(!validLocation(l))throw Error('Invalid coordinates.');return [l];}
 if(!window.Native)throw Error('Place-name lookup is available on Android. Select a point on the map, or enter latitude, longitude.');
 const result=await nativeCall('geocode',text);return (result.items||[]).filter(validLocation);
}
function closePicker(){if(!picker)return;const old=picker;picker=null;old.map?.remove();old.dialog?.remove();old.restoreFocus?.focus();}
function openPicker(purpose){
 saveReportFields();closePicker();const target=purpose==='report'?report:null;
 const seed=(target?.location)||searchCenter;const dialog=document.createElement('dialog');dialog.className='map-dialog';
 dialog.innerHTML=`<div class="section-heading"><h2>Select ${purpose==='report'?'issue location':'search area'}</h2><button class="text-button" id="close-map" aria-label="Close map">✕</button></div><form id="map-search"><label>City, street or coordinates<input id="map-query" maxlength="200" placeholder="Search a place or latitude, longitude"></label><button class="secondary" type="submit">Search</button></form><div id="map-results"></div><p class="hint">Tap the map to place a pin. Drag to move; use + and − to zoom.</p><div id="picker-map" role="region" aria-label="Location selection map"></div><p id="map-status" class="hint" role="status">${validLocation(seed)?esc(locationName(seed)):'Select a point to continue.'}</p><button class="primary full" id="use-map" ${validLocation(seed)?'':'disabled'}>Use this location</button><p class="hint">Maps: OpenStreetMap. Viewing maps shares the viewed area with the tile provider. <a href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noopener">Privacy</a></p>`;
 document.body.append(dialog);const state=picker={purpose,target,dialog,chosen:validLocation(seed)?{...seed}:null,map:null,restoreFocus:document.activeElement,version:0};
 dialog.showModal();dialog.oncancel=e=>{e.preventDefault();closePicker();};$('#close-map').onclick=closePicker;
 if(window.L){
  const map=state.map=L.map('picker-map',{worldCopyJump:true}).setView(validLocation(seed)?[seed.lat,seed.lon]:[20,0],validLocation(seed)?14:2);
  const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  tiles.on('tileerror',()=>{if(picker===state)$('#map-status').textContent='Map tiles unavailable. Check your connection, or search for coordinates.';});
  const pin=L.marker(validLocation(seed)?[seed.lat,seed.lon]:[20,0],{icon:L.divIcon({className:'map-pin',html:'<span></span>',iconSize:[24,24],iconAnchor:[12,12]}),draggable:true});
  if(validLocation(seed))pin.addTo(map);
  state.setPoint=l=>{if(picker!==state)return;state.chosen={...l,lon:((l.lon+180)%360+360)%360-180};pin.setLatLng([state.chosen.lat,state.chosen.lon]).addTo(map);$('#map-status').textContent=locationName(state.chosen);$('#use-map').disabled=false;};
  map.on('click',e=>state.setPoint({lat:e.latlng.lat,lon:e.latlng.lng}));pin.on('dragend',()=>{const l=pin.getLatLng();state.setPoint({lat:l.lat,lon:l.lng});});
  setTimeout(()=>{if(picker===state)map.invalidateSize();},0);
 }else{$('#picker-map').textContent='Map could not load. You can still search for a place or coordinates.';state.setPoint=l=>{state.chosen=l;$('#map-status').textContent=locationName(l);$('#use-map').disabled=false;};}
 keywordInput($('#map-query'),'',(query,removed)=>{if(removed){$('#map-results').innerHTML='';if(query)$('#map-search').requestSubmit();}});
 $('#map-search').onsubmit=async e=>{e.preventDefault();const version=++state.version;$('#map-query').commitKeywords();$('#map-status').textContent='Searching…';try{const places=await searchPlaces($('#map-query').keywordValue());if(picker!==state||version!==state.version)return;renderPlaceResults($('#map-results'),places,l=>{state.setPoint(l);state.map?.setView([l.lat,l.lon],14);});$('#map-status').textContent=places.length?'Choose a search result.':'No matching places. Try a more specific name.';}catch(e){if(picker===state&&version===state.version)$('#map-status').textContent=e.message;}};
 $('#use-map').onclick=async()=>{
  if(!validLocation(state.chosen)||picker!==state)return;const point={...state.chosen};$('#use-map').disabled=true;$('#map-status').textContent='Reading address…';
  let address={};if(window.Native)try{address=await nativeCall('reverseGeocode',point.lat,point.lon);}catch{}
  if(picker!==state)return;const chosen={...point,...address,lat:point.lat,lon:point.lon,accuracy:0,source:'map',captured:Date.now()/1000};closePicker();
  if(purpose==='report'&&report===target){locationVersion++;target.locating=false;target.location=chosen;target.locationError='';showLocation();}
  else if(purpose==='search'){searchCenter=chosen;renderIssuesPage(false);}
 };
}
function renderPlaceResults(node,places,select){node.innerHTML='';for(const place of places){const b=document.createElement('button');b.type='button';b.className='place-result';b.textContent=locationName(place);b.onclick=()=>{select(place);node.innerHTML='';};node.append(b);}}
function keywords(value){return [...new Set(String(value||'').trim().split(/[\s,]+/u).filter(Boolean).map(x=>x.toLocaleLowerCase()))].slice(0,20);}
function matchesKeywords(value,query){const text=String(value||'').toLocaleLowerCase();return keywords(query).every(word=>text.includes(word));}
function keywordInput(input,initial,onChange){
 const place=['area-query','map-query'].includes(input.id);const parse=value=>place&&/^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/.test(value)?[value.trim()]:keywords(value);
 let tokens=parse(initial);const chips=document.createElement('div');chips.className='keyword-chips';input.before(chips);
 const draw=()=>{chips.innerHTML='';for(const token of tokens){const b=document.createElement('button');b.type='button';b.className='keyword-chip';b.textContent=token+' ×';b.setAttribute('aria-label','Remove '+token);b.onclick=()=>{tokens=tokens.filter(x=>x!==token);draw();onChange(tokens.join(' '),true);};chips.append(b);}};
 input.value='';input.placeholder='Type keywords; press Enter';
 input.keywordValue=()=>[...tokens,...parse(input.value)].join(' ');
 input.commitKeywords=()=>{tokens=parse(input.keywordValue());input.value='';draw();onChange(tokens.join(' '));return tokens.join(' ');};
 input.onkeydown=e=>{if(e.key==='Enter'||(!place&&e.key===',')){e.preventDefault();input.commitKeywords();if(input.form)input.form.requestSubmit();}};
 input.onblur=()=>{if(input.value.trim())input.commitKeywords();};
 draw();return input;
}
function showMediaInfo(target){
 let photo,meta={},place={};
 if(target==='report'){photo=report?.photo;meta=report?.media_metadata||{};place=report?.location||{};}
 else if(target==='latest'){photo=selected?.latestPhoto;meta=selected?.latestMetadata||{};}
 else if(target.startsWith('proof-')){const p=selected?.proofs?.[Number(target.slice(6))];photo=p?.photo;meta=p?.media_metadata||{};}
 else{photo=selected?.photo;meta=selected?.media_metadata||{};place=selected||{};}
 if(!photo)return;
 const labels={name:'Original filename',mime:'Original type',original_bytes:'Original file size (bytes)',width:'Original width (px)',height:'Original height (px)',saved_width:'Prepared width (px)',saved_height:'Prepared height (px)',duration_seconds:'Duration (seconds)',file_created:'Embedded date/time',last_modified:'File modified',selected_at:'Selected / captured',source:'Source',camera_make:'Camera make',camera_model:'Camera model',orientation:'EXIF orientation',rotation:'Video rotation',embedded_lat:'Embedded GPS latitude',embedded_lon:'Embedded GPS longitude',embedded_location:'Embedded video GPS',cropped:'Cropped',area:'Area',district:'District',postcode:'Postal code'};
 const rows=Object.entries(labels).map(([key,label])=>[label,key==='selected_at'&&Number.isFinite(Number(meta[key]))?stamp(Number(meta[key])):meta[key]??'Not available']);
 rows.push(['Current media type',photo.split(';')[0].slice(5)],['Current media size (bytes)',Math.floor((photo.split(',')[1]?.length||0)*3/4)-(photo.endsWith('==')?2:photo.endsWith('=')?1:0)]);
 for(const key of ['country','state','city','street','area','district','postcode','lat','lon','accuracy'])rows.push(['Report '+key,place[key]??meta[key]??'Not available']);
 const dialog=document.createElement('dialog');dialog.className='map-dialog media-dialog';dialog.innerHTML='<div class="section-heading"><h2>Media details</h2><button type="button" aria-label="Close media details">✕</button></div><p class="hint">Original file metadata, where available. Embedded GPS and dates are not verified and may differ from the report location. Missing metadata cannot be recovered.</p><dl>'+rows.map(([k,v])=>'<dt>'+esc(k)+'</dt><dd>'+esc(v)+'</dd>').join('')+'</dl>';
 dialog.querySelector('button').onclick=()=>dialog.remove();dialog.oncancel=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
}
function webMetadata(file,camera){return {name:file.name,mime:file.type,original_bytes:file.size,last_modified:new Date(file.lastModified).toISOString(),selected_at:Date.now()/1000,source:camera?'Camera':'Upload'};}

function isVideo(value){return typeof value==='string'&&value.startsWith('data:video/');}
function mediaMarkup(value,target="original"){
 return '<div class="media-with-info"><button type="button" class="media-info" data-action="media-info" data-target="'+esc(target)+'" aria-label="Media details">i</button>'+ (isVideo(value)?'<video class="detail-photo" style="width:100%;max-height:420px" src="'+esc(value)+'" controls muted playsinline preload="metadata"></video>':'<img class="detail-photo" src="'+esc(value)+'" alt="Issue photo">')+'</div>';
}
function chooseCapture(proof=false){
 const dialog=document.createElement('dialog');dialog.innerHTML='<h2>Capture</h2><button type="button" data-kind="photo">Photo</button> <button type="button" data-kind="video">Video (up to 10 seconds)</button> <button type="button" data-kind="cancel">Cancel</button>';
 document.body.append(dialog);dialog.showModal();dialog.addEventListener('cancel',()=>dialog.remove());
 dialog.onclick=e=>{
  const kind=e.target.dataset.kind;if(!kind)return;dialog.remove();if(kind==='cancel')return;
  if(window.Native){selectNativePhoto(true,proof,kind==='video');return;}
  const input=document.createElement('input');input.type='file';input.accept=kind==='video'?'video/mp4,video/webm,video/quicktime':'image/*';input.setAttribute('capture','environment');input.hidden=true;
  input.onchange=()=>{pickWebImage(input.files[0],proof,true);input.remove();};input.oncancel=()=>input.remove();document.body.append(input);input.click();
 };
}
async function pickWebVideo(file,proof,camera){
 if(!['video/mp4','video/webm','video/quicktime'].includes(file.type)||file.size>10*1024*1024)throw Error('Choose MP4, MOV or WebM under 10 MB.');
 const target=proof?selected:report,url=URL.createObjectURL(file),video=document.createElement('video');
 try{
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Cannot read video duration.')),10000);
   video.preload='metadata';video.onloadedmetadata=()=>{clearTimeout(timer);resolve();};video.onerror=()=>{clearTimeout(timer);reject(Error('This video format cannot be played.'));};video.src=url;
  });
  if(!Number.isFinite(video.duration)||video.duration<=0||video.duration>10)throw Error('Video must be 10 seconds or shorter.');
  const metadata={...webMetadata(file,camera),width:video.videoWidth,height:video.videoHeight,duration_seconds:video.duration};
  const photo=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Cannot read video.'));r.readAsDataURL(file);});
  if(proof){if(target===selected){selected.latestPhoto=photo;selected.latestMetadata=metadata;showLatestPhoto();}}
  else if(target===report){saveReportFields();report.photo=photo;report.media_metadata=metadata;renderReport();if(camera)await detectLocation();}
 }finally{video.removeAttribute('src');video.load();URL.revokeObjectURL(url);}
}

async function selectNativePhoto(camera=false,proof=false,video=false){
 const target=proof?selected:report;
 try{const result=await nativeCall(camera?(video?'captureVideo':'capture'):'choosePhoto');if(proof){if(target===selected){selected.latestPhoto=result.photo;selected.latestMetadata=result.media_metadata||{};showLatestPhoto();}}else if(target===report){report.photo=result.photo;report.media_metadata=result.media_metadata||{};renderReport();if(camera)await detectLocation();}}
 catch(e){toast(e.message);}
}
async function pickWebImage(file,proof,camera=false){
 if(!file)return;const target=proof?selected:report;
 try{
  if(file.type.startsWith('video/')){await pickWebVideo(file,proof,camera);return;}
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Choose a JPEG, PNG or WebP image under 10 MB.');
  const raw=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>rej(Error('Cannot read image.'));r.readAsDataURL(file);});
  const im=await new Promise((res,rej)=>{const image=new Image();image.onload=()=>res(image);image.onerror=()=>rej(Error('Cannot open image.'));image.src=raw;});
  if(Math.min(im.width,im.height)<160)throw Error('Choose an image at least 160 pixels wide and high.');
  const scale=Math.min(1,1600/Math.max(im.width,im.height)),canvas=document.createElement('canvas');canvas.width=Math.round(im.width*scale);canvas.height=Math.round(im.height*scale);canvas.getContext('2d').drawImage(im,0,0,canvas.width,canvas.height);const photo=canvas.toDataURL('image/jpeg',.85);const metadata={...webMetadata(file,camera),width:im.width,height:im.height,saved_width:canvas.width,saved_height:canvas.height};
  if(proof){if(target===selected){selected.latestPhoto=photo;selected.latestMetadata=metadata;showLatestPhoto();}}else if(target===report){saveReportFields();report.photo=photo;report.media_metadata=metadata;renderReport();if(camera)await detectLocation();}
 }catch(e){toast(e.message);}
}
async function submitReport(event){
 event.preventDefault();if(reportBusy)return;saveReportFields();
 if(!report.photo){$('#report-error').textContent='Capture or upload a photo or video of the issue.';return;}
 if(!categories.includes(report.category)){$('#report-error').textContent='Select a category.';return;}
 if(report.locating||!validLocation(report.location)){$('#report-error').textContent='Use current GPS or select the issue location on the map.';return;}
 const days=Number(report.eta_days);if(!Number.isInteger(days)||days<7){$('#report-error').textContent='ETA must be at least one week.';return;}
 reportBusy=true;$('#submit-report').disabled=true;$('#submit-report').textContent=demoSession?'Submitting…':'Screening and saving…';$('#report-error').textContent='';
 try{await api('POST','/issues',{...report,...report.location,eta_days:days,media_metadata:{...report.media_metadata,area:report.location?.area,district:report.location?.district,postcode:report.location?.postcode}});report=null;active='issues';issueScope='mine';reporter=null;filters={status:'',category:'',country:'',city:''};renderIssuesPage(false);toast('Issue reported.');}
 catch(e){if($('#report-error'))$('#report-error').textContent=e.message;}finally{reportBusy=false;if($('#submit-report')){$('#submit-report').disabled=false;$('#submit-report').textContent='Submit issue';}}
}
function renderIssuesPage(autoLocate=true){
 active='issues';shell(`<div class="section-heading"><h1>Issues</h1><button class="text-button" data-action="home">Home</button></div><div class="scope-buttons"><button data-action="scope-mine" class="${issueScope==='mine'?'primary':'secondary'}" aria-pressed="${issueScope==='mine'}">My reported Issues</button><button data-action="scope-all" class="${issueScope==='all'?'primary':'secondary'}" aria-pressed="${issueScope==='all'}">Search</button></div>
 ${issueScope==='all'?`<section class="panel search-panel"><fieldset class="search-radios"><legend>Search by</legend><label><input type="radio" name="search-mode" value="distance" ${searchMode==='distance'?'checked':''}>Distance</label><label><input type="radio" name="search-mode" value="location" ${searchMode==='location'?'checked':''}>Location</label></fieldset><div ${searchMode==='distance'?'':'hidden'}><form id="area-search"><label>Search city, street or area<input id="area-query" maxlength="200" placeholder="Enter a place or latitude, longitude"></label><button type="submit" class="secondary">Search</button></form><div id="area-results"></div><div class="photo-actions"><button class="text-button" id="near-me">Current location</button><button class="text-button" data-action="pick-search">Select on map</button></div><p id="area-status" class="hint" role="status">${searchCenter?esc(locationName(searchCenter)):'Finding your current location…'}</p><label>Distance (km)<input id="radius" type="number" min="0.1" max="200" step="0.1" value="${searchRadius}" inputmode="decimal"></label><p class="hint">Issues within this radius of the selected location. Default: 3 km.</p></div></section>`:''}<div id="content"></div>${demoSession?'<p class="hint demo-note">Demo mode · Only reports created in this session are available.</p>':''}`);
 const version=screenVersion;let areaVersion=0;
 if(issueScope==='all'){
  document.querySelectorAll('[name="search-mode"]').forEach(el=>el.onchange=e=>{searchMode=e.target.value;filters={status:'',category:'',country:'',city:''};renderIssuesPage();});
  $('#radius').onchange=e=>{const value=Number(e.target.value);if(!Number.isFinite(value)||value<.1||value>200){toast('Choose a distance between 0.1 and 200 km.');e.target.value=searchRadius;return;}searchRadius=value;loadIssues();};
  $('#near-me').onclick=locateIssues;
  keywordInput($('#area-query'),'',(query,removed)=>{if(removed){$('#area-results').innerHTML='';if(query)$('#area-search').requestSubmit();}});
  $('#area-search').onsubmit=async e=>{e.preventDefault();const query=$('#area-query').commitKeywords(),request=++areaVersion;$('#area-status').textContent='Searching…';try{const places=await searchPlaces(query);if(screenVersion!==version||request!==areaVersion)return;renderPlaceResults($('#area-results'),places,l=>{searchCenter={...l,source:'map'};$('#area-status').textContent=locationName(l);loadIssues();});$('#area-status').textContent=places.length?'Choose a place below.':'No places found. Try the map.';}catch(e){if(screenVersion===version&&request===areaVersion)$('#area-status').textContent=e.message;}};
 }
 if(issueScope==='all'&&searchMode==='distance'&&!searchCenter){$('#content').innerHTML='<section class="panel"><p class="empty">Choose a location to see nearby issues.</p></section>';if(autoLocate)locateIssues();}
 else loadIssues();
}
async function locateIssues(){
 const version=screenVersion;if($('#near-me'))$('#near-me').disabled=true;if($('#area-status'))$('#area-status').textContent='Detecting current GPS…';
 try{const l=await currentLocation();if(screenVersion!==version)return;searchCenter=l;$('#area-status').textContent=locationName(l);loadIssues();}
 catch(e){if(screenVersion===version&&$('#area-status'))$('#area-status').textContent=e.message+' You can select an area on the map.';}
 finally{if(screenVersion===version&&$('#near-me'))$('#near-me').disabled=false;}
}
async function loadIssues(){
 const version=++listVersion,screen=screenVersion;selected=null;issues=[];
 if(issueScope==='all'&&searchMode==='distance'&&!validLocation(searchCenter))return;
 $('#content').innerHTML='<section class="panel"><p role="status">Loading issues…</p></section>';
 try{
  const query=issueScope==='mine'?{mine:'1'}:reporter?{reporter_id:reporter.id}:searchMode==='location'?{}:{lat:String(searchCenter.lat),lon:String(searchCenter.lon),radius:String(searchRadius)};
  let offset=0,all=[];do{const params=new URLSearchParams({limit:'50',offset:String(offset),...query});const data=await api('GET','/issues?'+params);if(version!==listVersion||active!=='issues'||screen!==screenVersion)return;all.push(...data.items);offset=data.next_offset;}while(offset!==null&&offset!==undefined);
  issues=issueScope==='mine'?all.filter(i=>i.user_id===currentUser.id):all;renderList();
 }catch(e){if(version===listVersion&&active==='issues'&&screen===screenVersion)$('#content').innerHTML=`<section class="panel"><p class="error" role="alert">${esc(e.message)}</p><button class="secondary" data-action="retry-list">Retry</button></section>`;}
}
function renderList(){
 $('#content').innerHTML=`<section class="panel list-panel"><div class="section-heading"><h2>${reporter?'Issues raised by '+esc(reporter.name):issueScope==='mine'?'My reported issues':searchMode==='location'?'Location results':'Nearby issues'}</h2><button class="text-button" data-action="retry-list">Refresh</button></div><div id="issue-summary"></div><label class="all-toggle"><input id="show-all" type="checkbox" role="switch" ${!filters.status?'checked':''}>Show all issues</label><div class="column-filters">${['category','country','city'].map(k=>`<label>${k[0].toUpperCase()+k.slice(1)}<input id="filter-${k}" maxlength="200" placeholder="Enter ${k}" value="${esc(filters[k])}"></label>`).join('')}</div><div id="empty-search-keys"></div><p class="hint" id="result-count" role="status"></p><div id="issues-list"></div></section><div id="issue-detail"></div>`;
 $('#show-all').onchange=e=>{filters.status=e.target.checked?'':'unresolved';selected=null;$('#issue-detail').innerHTML='';renderCards();};
 for(const field of ['category','country','city'])keywordInput($('#filter-'+field),filters[field],query=>{filters[field]=query;selected=null;$('#issue-detail').innerHTML='';renderCards();});renderCards();
}
function renderCards(){
 if(!$('#issues-list'))return;
 const matching=issues.filter(i=>['category','country','city'].every(k=>matchesKeywords(i[k],filters[k])));
 const shown=matching.filter(i=>!filters.status||(filters.status==='unresolved'?i.resolved==null:status(i)===filters.status));
 renderSummary(matching);$('#show-all').checked=!filters.status;
 $('.column-filters').hidden=shown.length===0;$('.all-toggle').hidden=issues.length===0;
 const emptyKeys=$('#empty-search-keys');emptyKeys.innerHTML='';
 if(!shown.length){
  for(const field of ['category','country','city'])for(const token of keywords(filters[field])){
   const b=document.createElement('button');b.type='button';b.className='keyword-chip';b.textContent=field+': '+token+' ×';b.setAttribute('aria-label','Remove '+field+' '+token);
   b.onclick=()=>{filters[field]=keywords(filters[field]).filter(x=>x!==token).join(' ');renderList();};emptyKeys.append(b);
  }
 }

 $('#result-count').textContent=`${shown.length} ${filters.status==='unresolved'?'open ':filters.status==='resolved'?'closed ':''}issue${shown.length===1?'':'s'}`;
 $('#issues-list').innerHTML=shown.length?['open','overdue','resolved'].map(group=>{const rows=shown.filter(i=>status(i)===group);if(!rows.length)return '';return `<section class="status-group"><h3 class="badge ${group}">${labels[group]} (${rows.length})</h3><table class="issues-table"><thead><tr><th scope="col">Category</th><th scope="col">Country</th><th scope="col">City</th></tr></thead><tbody>${rows.map(i=>`<tr class="issue-card ${group}" data-action="detail" data-id="${esc(i.id)}"><td><button class="text-button" data-action="detail" data-id="${esc(i.id)}" aria-expanded="${selected?.id===i.id}">${esc(i.category||i.title||'Other')}</button></td><td>${esc(i.country||'Not available')}</td><td>${esc(i.city||'Not available')}</td></tr>`).join('')}</tbody></table></section>`;}).join(''):'<p class="empty">'+(issues.length?'No issues match your selection.':issueScope==='mine'?'You haven’t reported any issues yet.':'No issues found. Try another location or distance.')+'</p>';
}
function renderSummary(rows){
 const counts={open:0,overdue:0,resolved:0};rows.forEach(i=>counts[status(i)]++);const total=rows.length,open=counts.open+counts.overdue;
 let offset=0;const colors={open:'#d99a24',overdue:'#d13d37',resolved:'#2a9266'};
 const slices=Object.keys(counts).map(k=>{const size=total?counts[k]/total*100:0;const el=`<circle cx="21" cy="21" r="15.915494" fill="none" stroke="${colors[k]}" stroke-width="9" stroke-dasharray="${size} ${100-size}" stroke-dashoffset="${-offset}" transform="rotate(-90 21 21)"/>`;offset+=size;return el;}).join('');
 $('#issue-summary').innerHTML=`<div class="summary-stats"><button type="button" data-action="status-all" aria-pressed="${!filters.status}" class="stat total"><strong>${total}</strong><span>Total issues</span></button><button type="button" data-action="status-open" aria-pressed="${filters.status==='unresolved'}" class="stat open"><strong>${open}</strong><span>Open</span></button><button type="button" data-action="status-closed" aria-pressed="${filters.status==='resolved'}" class="stat closed"><strong>${counts.resolved}</strong><span>Closed</span></button></div><div class="chart-row"><svg class="pie-chart" viewBox="0 0 42 42" role="img" aria-label="${total} total issues: ${counts.open} open within ETA, ${counts.overdue} overdue, ${counts.resolved} closed"><circle cx="21" cy="21" r="15.915494" fill="none" stroke="#e6ece8" stroke-width="9"/>${slices}<text x="21" y="23" text-anchor="middle" font-size="6" fill="#243831">${total}</text></svg><div class="chart-legend"><p><i class="open"></i>Open within ETA <b>${counts.open}</b></p><p><i class="overdue"></i>Overdue <b>${counts.overdue}</b></p><p><i class="closed"></i>Closed <b>${counts.resolved}</b></p><span class="hint">${total?'Counts reflect the current list and filters.':'No issues to chart.'}</span></div></div>`;
}
async function openIssue(id){
 selected={id};renderCards();$('#issue-detail').innerHTML='<section class="panel"><p role="status">Loading issue details…</p></section>';
 try{const issue=await api('GET','/issues/'+encodeURIComponent(id));if(selected?.id!==id)return;selected=issue;renderDetail();$('#issue-detail').scrollIntoView({behavior:'smooth',block:'start'});}catch(e){if(selected?.id===id)$('#issue-detail').innerHTML=`<section class="panel"><p class="error">${esc(e.message)}</p><button class="secondary" data-action="detail" data-id="${esc(id)}">Retry</button></section>`;}
}
function renderDetail(){
 const i=selected,canResolve=i.user_id===currentUser.id&&i.resolved===null;
 $('#issue-detail').innerHTML=`<section class="panel detail"><div class="section-heading"><h2>Issue details</h2><button class="text-button" data-action="close-detail">Close</button></div><div id="detail-status">${badge(i)}</div><h3>${esc(i.title||i.category)}</h3><figure>${mediaMarkup(i.photo)}<figcaption>Original media</figcaption></figure>${i.description?`<p class="description">${esc(i.description)}</p>`:'<p class="hint">No description provided.</p>'}<dl><dt>Category</dt><dd>${esc(i.category||'Other')}</dd><dt>Raised by</dt><dd><button class="person" data-action="reporter" data-id="${esc(i.user_id)}" data-name="${esc(i.reporter)}">${esc(i.reporter)}</button></dd>${['country','state','city','street'].map(k=>`<dt>${k==='street'?'Street name':k[0].toUpperCase()+k.slice(1)}</dt><dd>${esc(i[k]||'Not available')}</dd>`).join('')}<dt>GPS location</dt><dd>${Number(i.lat).toFixed(5)}, ${Number(i.lon).toFixed(5)}</dd><dt>Raised on</dt><dd>${stamp(i.created)}</dd><dt>ETA</dt><dd>${stamp(i.deadline)} (${Math.round((i.deadline-i.created)/86400)} days)</dd><dt>${i.resolved!==null?'Time taken':'Elapsed'}</dt><dd id="detail-elapsed">${elapsed(i)}</dd>${i.resolved!==null?`<dt>Resolved on</dt><dd>${stamp(i.resolved)}</dd>`:''}</dl>${i.proofs?.map((p,index)=>p.accepted?`<figure>${mediaMarkup(p.photo,"proof-"+index)}<figcaption>Latest media</figcaption></figure>`:'').join('')||''}${canResolve?`<form id="resolve-form"><h3>Mark as resolved</h3><p class="hint">Confirm the issue has been fixed. A latest photo or video is optional.</p><div id="latest-photo"></div><button type="button" class="secondary" data-action="capture-proof">Capture latest media</button><button type="button" class="secondary" data-action="upload-proof">Upload latest media (optional)</button><input type="file" id="proof-input" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" hidden><p id="resolve-error" class="error" role="alert"></p><button type="submit" class="primary full" id="resolve-submit">Mark as resolved</button></form>`:''}</section>`;
 if(canResolve){$('#proof-input').onchange=e=>pickWebImage(e.target.files[0],true);$('#resolve-form').onsubmit=resolveIssue;}
}
function showLatestPhoto(){if($('#latest-photo'))$('#latest-photo').innerHTML=`${mediaMarkup(selected.latestPhoto,"latest")}<button type="button" class="text-button" data-action="remove-proof">Remove photo</button>`;}
async function resolveIssue(event){
 event.preventDefault();if(resolveBusy)return;resolveBusy=true;const id=selected.id;$('#resolve-submit').disabled=true;$('#resolve-submit').textContent='Saving…';
 try{const result=await api('POST','/issues/'+id+'/resolve',{photo:selected.latestPhoto||null,media_metadata:selected.latestMetadata||{}});issues=issues.map(i=>i.id===id?result:i);if(selected?.id===id){selected=result;renderDetail();}renderCards();toast('Issue marked as resolved.');}
 catch(e){if($('#resolve-error'))$('#resolve-error').textContent=e.message;}finally{resolveBusy=false;if($('#resolve-submit')){$('#resolve-submit').disabled=false;$('#resolve-submit').textContent='Mark as resolved';}}
}
function renderProfile(){
 active='profile';listVersion++;selected=null;
 shell(`<section class="panel profile-panel"><div class="section-heading"><h1>Your profile</h1><button class="text-button" data-action="home">Close</button></div><form id="profile-form"><label>Name<input id="profile-name" maxlength="80" value="${esc(currentUser.name)}" autocomplete="name" required></label><label>Email ID<input id="profile-email" type="email" maxlength="254" value="${esc(currentUser.username||'')}" autocomplete="email" ${demoSession?'':'required'}></label>${demoSession?'<p class="hint">Demo details apply only to this session.</p>':'<p class="hint">Changing your email requires verification of the new address.</p><button type="button" class="secondary" id="profile-send">Send OTP to new email</button><div id="profile-otp-section" hidden><label>Verification code<input id="profile-otp" inputmode="numeric" maxlength="6" pattern="[0-9]{6}"></label><button type="button" class="secondary" id="profile-verify">Verify email</button></div>'}<p id="profile-status" role="status" class="hint"></p><p id="profile-error" role="alert" class="error"></p><button class="primary full" type="submit">Save details</button></form><button class="secondary full switch-auth" data-action="logout">Log out</button></section>`);
 const screen=screenVersion,originalEmail=currentUser.username||'';let verification='',verified='',sent='',busy=false,cooldown=0;
 const email=()=>$('#profile-email').value.trim().toLowerCase();
 const locked=value=>{busy=value;if(screenVersion===screen)$('#profile-form').querySelectorAll('input,button').forEach(el=>el.disabled=value);};
 $('#profile-email').oninput=()=>{verification='';verified='';sent='';$('#profile-status').textContent='';if($('#profile-otp-section'))$('#profile-otp-section').hidden=true;};
 if(!demoSession){
  $('#profile-send').onclick=async()=>{
   if(busy||!$('#profile-email').reportValidity())return;const address=email();if(address===originalEmail){$('#profile-error').textContent='Enter a different email address first.';return;}
   if(Date.now()<cooldown){$('#profile-error').textContent='Wait one minute before requesting another code.';return;}
   locked(true);$('#profile-error').textContent='';
   try{const result=await api('POST','/auth/send-otp',{email:address});if(screen!==screenVersion)return;sent=address;verification='';verified='';cooldown=Date.now()+result.resend_after*1000;$('#profile-otp-section').hidden=false;$('#profile-status').textContent=result.message;}
   catch(e){if(screen===screenVersion)$('#profile-error').textContent=e.message;}finally{locked(false);}
  };
  $('#profile-verify').onclick=async()=>{
   if(busy)return;const address=email(),code=$('#profile-otp').value.trim();if(address!==sent||!/^\d{6}$/.test(code)){$('#profile-error').textContent='Send an OTP and enter the six-digit code.';return;}
   locked(true);$('#profile-error').textContent='';try{const result=await api('POST','/auth/verify-otp',{email:address,code});if(screen!==screenVersion)return;verification=result.verification_token;verified=address;$('#profile-status').textContent='Email verified.';$('#profile-otp-section').hidden=true;}
   catch(e){if(screen===screenVersion)$('#profile-error').textContent=e.message;}finally{locked(false);}
  };
 }
 $('#profile-form').onsubmit=async e=>{
  e.preventDefault();if(busy)return;const address=email(),name=$('#profile-name').value.trim();if(!name){$('#profile-error').textContent='Enter your name.';return;}
  if(!demoSession&&address!==originalEmail&&(!verification||verified!==address)){$('#profile-error').textContent='Verify the new email before saving.';return;}
  locked(true);$('#profile-error').textContent='';try{
   const user=await api('POST','/me',{name,...(address!==originalEmail?{email:address,verification_token:verification}:{})});if(screen!==screenVersion)return;currentUser=user;config.user=user;active='home';landing();toast('Profile updated.');
  }catch(e){if(screen===screenVersion)$('#profile-error').textContent=e.message;}finally{locked(false);}
 };
}

document.addEventListener('click',async event=>{
 const button=event.target.closest('[data-action]');if(!button)return;event.preventDefault();const action=button.dataset.action;
 if(authBusy||reportBusy||resolveBusy)return;
 if(action==='switch-auth'){mode=mode==='login'?'register':'login';verifiedEmail='';verificationToken='';authPage();}
 if(action==='logout'){try{await api('POST','/auth/logout');}catch{}if(!demoSession){if(window.Native)Native.logout();webToken='';sessionStorage.removeItem('civicfix-session');}demoSession=false;demoIssues=[];currentUser=null;searchCenter=null;reporter=null;mode='login';authPage();}
 if(action==='home'){if(!currentUser)return;saveReportFields();active='home';listVersion++;selected=null;landing();}
 if(action==='report'){if(!currentUser)return;saveReportFields();active='report';selected=null;landing();}
 if(action==='issues'){saveReportFields();reporter=null;issueScope='mine';searchText='';filters={status:'',category:'',country:'',city:''};renderIssuesPage();}
 if(action==='scope-mine'||action==='scope-all'){reporter=null;issueScope=action==='scope-mine'?'mine':'all';if(issueScope==='all')searchMode='distance';searchText='';filters={status:'',category:'',country:'',city:''};renderIssuesPage();}
 if(action==='pick-report')openPicker('report');
 if(action==='pick-search')openPicker('search');
 if(action==='profile'){saveReportFields();renderProfile();}
 if(['status-all','status-open','status-closed'].includes(action)){filters.status=action==='status-open'?'unresolved':action==='status-closed'?'resolved':'';selected=null;$('#issue-detail').innerHTML='';renderCards();}
 if(action==='retry-list')loadIssues();
 if(action==='clear-filters'){searchText='';filters={status:'',category:'',country:'',city:''};selected=null;renderList();}
 if(action==='camera'||action==='capture-proof'){saveReportFields();chooseCapture(action==='capture-proof');}
 if(action==='upload'){saveReportFields();if(window.Native)selectNativePhoto();else $('#image-input').click();}
 if(action==='crop')openCrop();
 if(action==='media-info')showMediaInfo(button.dataset.target);
 if(action==='detail')openIssue(button.dataset.id);
 if(action==='close-detail'){selected=null;$('#issue-detail').innerHTML='';renderCards();}
 if(action==='reporter'){issueScope='reporter';searchText='';reporter={id:button.dataset.id,name:button.dataset.name};filters={status:'',category:'',country:'',city:''};renderIssuesPage(false);}
 if(action==='upload-proof'){if(window.Native)selectNativePhoto(false,true);else $('#proof-input').click();}
 if(action==='remove-proof'){selected.latestPhoto='';$('#latest-photo').innerHTML='';}
});
window.appBack=()=>{if(cropDialog){closeCrop();return;}if(picker){closePicker();return;}if(selected){selected=null;$('#issue-detail').innerHTML='';renderCards();}else if(mode==='register'&&!currentUser){mode='login';authPage();}else if(currentUser){saveReportFields();active='home';landing();}};
let lastTimeSignature='';
setInterval(()=>{if(active==='issues'&&currentUser){const signature=issues.map(i=>status(i)+elapsed(i)).join('|');if(signature!==lastTimeSignature){renderCards();lastTimeSignature=signature;}if(selected?.deadline&&$('#detail-status')){$('#detail-status').innerHTML=badge(selected);$('#detail-elapsed').textContent=elapsed(selected);}}},1000);
(async()=>{if(!DEMO_LOGIN&&(config.user?.id||webToken)){shell('<section class="panel"><p role="status">Signing in…</p></section>');try{currentUser=await api('GET','/me');landing();return;}catch{if(window.Native)Native.logout();webToken='';sessionStorage.removeItem('civicfix-session');}}authPage();})();
