// DOM integration checks. Uses a simulated Android bridge; no emails or reports are sent.
const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../android/app/src/main/assets/app.js'),'utf8');
const photo='data:image/jpeg;base64,fixture';
const t=Date.now()/1000;
const base={user_id:'user1',reporter:'Sharath',title:'Broken pavement',description:'',country:'India',state:'Telangana',city:'Hyderabad',street:'Main Street',lat:17.4,lon:78.3,created:t-1000,deadline:t+604800,resolved:null,thumbnail:photo,photo,proofs:[]};
let items=[{...base,id:'one'},{...base,id:'two',title:'Blocked drain',deadline:t-1,country:'UK',city:'London',street:'High Street'},{...base,id:'three',title:'Streetlight repaired',resolved:t-20}];
const requests=[];let loggedIn=false,failLocation=false;
const dom=new JSDOM('<div id="app"></div><div id="toast" hidden></div>',{url:'https://app.civicfix.local/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;
w.HTMLElement.prototype.scrollIntoView=function(){};
w.Native={config:()=>JSON.stringify({server:'https://test.invalid',user:{}}),logout(){loggedIn=false},setServer(){},
 request(id,method,url,json){setTimeout(()=>{
  const b=JSON.parse(json);requests.push({method,url,body:b});let result,error;
  if(url==='/auth/send-otp')result={message:'Verification code sent.',resend_after:60};
  else if(url==='/auth/verify-otp')result={verification_token:'verified-token'};
  else if(url==='/auth/register'||url==='/auth/login'){loggedIn=true;result={token:'session',user:{id:'user1',name:'Sharath',username:'sharath@example.com'}};}
  else if(url==='/auth/logout')result={ok:true};
  else if(url.startsWith('/issues?'))result={items:items,total:items.length,next_offset:null};
  else if(url==='/issues'&&method==='POST'){assert.equal(b.eta_days,7);assert.equal(b.description,'');result={...base,id:'new',title:b.title};items.unshift(result);}
  else if(url.endsWith('/resolve')){const i=items.find(i=>url.includes(i.id));i.resolved=Date.now()/1000;result={...i};}
  else if(url.startsWith('/issues/'))result={...items.find(i=>url.endsWith(i.id))};
  else error='Unexpected '+url;
  w.nativeReply(id,result,error);
 },0);},
 location(id){setTimeout(()=>w.nativeReply(id,failLocation?null:{lat:17.4,lon:78.3,accuracy:10,country:'India',state:'Telangana',city:'Hyderabad',street:'Main Street'},failLocation?'Location permission denied':null),0);},
 choosePhoto(id){setTimeout(()=>w.nativeReply(id,{photo},null),0)},capture(id){this.choosePhoto(id)}};
w.eval(source);
const $=s=>w.document.querySelector(s);
const pause=()=>new Promise(r=>setTimeout(r,15));
const click=async selector=>{$(selector).click();await pause()};
const submit=async selector=>{$(selector).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause()};
const fill=(selector,value)=>{$(selector).value=value;$(selector).dispatchEvent(new w.Event('input',{bubbles:true}));};
(async()=>{
 assert.equal($('#auth-submit').textContent,'Login');assert.equal(w.document.querySelectorAll('nav').length,0);
 await click('[data-action="switch-auth"]');fill('#email','sharath@example.com');fill('#password','secure-password');fill('#confirm-password','secure-password');fill('#name','Sharath');
 await submit('#auth-form');assert.match($('#auth-error').textContent,/Verify your email/);assert.equal(loggedIn,false);
 await click('#send-code');assert.equal($('#otp-section').hidden,false);fill('#otp','123456');await click('#verify-code');assert.match($('#email-status').textContent,/verified/);
 fill('#email','changed@example.com');assert.equal($('#email-status').textContent,'');await submit('#auth-form');assert.match($('#auth-error').textContent,/Verify/);
 fill('#email','sharath@example.com');await click('#send-code');fill('#otp','123456');await click('#verify-code');await submit('#auth-form');
 assert.equal(w.document.querySelectorAll('.actions button').length,2);assert.equal($('#eta').value,'7');assert.equal($('#country').readOnly,true);assert.equal($('#city').value,'Hyderabad');
 assert([...$('#eta').options].every(o=>Number(o.value)>=7));
 fill('#title','Pothole outside library');await submit('#report-form');assert.match($('#report-error').textContent,/Upload/);await click('[data-action="upload"]');await submit('#report-form');
 assert.equal($('.issue-card.open')!==null,true);assert.equal($('.issue-card.overdue')!==null,true);assert.equal($('.issue-card.resolved')!==null,true);
 $('#filter-status').value='overdue';$('#filter-status').dispatchEvent(new w.Event('change'));assert.equal(w.document.querySelectorAll('.issue-card').length,1);
 await click('[data-action="clear-filters"]');$('#filter-country').value='UK';$('#filter-country').dispatchEvent(new w.Event('change'));assert.equal(w.document.querySelectorAll('.issue-card').length,1);
 await click('[data-action="detail"]');assert.match($('#issue-detail').textContent,/Blocked drain/);assert.equal($('#resolve-submit').textContent,'Mark as resolved');
 await submit('#resolve-form');assert.equal($('#detail-status .resolved')!==null,true);assert.equal($('#resolve-form'),null);
 await click('#issue-detail [data-action="reporter"]');assert.match($('.list-panel h2').textContent,/Issues raised by Sharath/);assert(requests.some(r=>r.url.includes('reporter_id=user1')));
 await click('[data-action="logout"]');assert.equal($('#auth-submit').textContent,'Login');fill('#email','sharath@example.com');fill('#password','secure-password');await submit('#auth-form');assert($('.actions'));
 assert.equal(w.document.querySelectorAll('nav').length,0);
 console.log('PASS: login, OTP gate and changed-email invalidation, registration, two actions/no tabs, read-only GPS, minimum ETA, optional description, photo upload, report submission, three colours, filters, inline detail, optional-photo resolution, reporter navigation, logout and login.');
 dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exit(1)});
