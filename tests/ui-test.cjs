// DOM integration with the real bundled Leaflet library and a simulated Android bridge.
// No mail, GPS, map tile requests or backend requests leave this test process.
const {JSDOM}=require('jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const source=fs.readFileSync(path.join(__dirname,'../android/app/src/main/assets/app.js'),'utf8');
const leaflet=fs.readFileSync(path.join(__dirname,'../android/app/src/main/assets/leaflet.js'),'utf8');
const photo='data:image/jpeg;base64,fixture';
const pause=()=>new Promise(r=>setTimeout(r,20));
function setup(demo=true){
 const dom=new JSDOM('<div id="app"></div><div id="toast" hidden></div>',{url:'https://app.civicfix.local/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;let gpsCalls=0,failLocation=false,hold=false;const requests=[];
 w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.Native={config:()=>JSON.stringify({server:'https://test.invalid',user:{}}),logout(){},setServer(){},
 request(id,method,url,json){requests.push({method,url,body:JSON.parse(json)});setTimeout(()=>{
  let r;if(url==='/auth/send-otp')r={message:'Verification code sent.',resend_after:60};
  else if(url==='/auth/verify-otp')r={verification_token:'verified-token'};
  else if(url==='/auth/register'||url==='/auth/login')r={user:{id:'user1',name:'Sharath',username:'sharath@example.com'},token:'session'};
  else if(url==='/me')r={id:'user1',name:JSON.parse(json).name,username:JSON.parse(json).email||'sharath@example.com'};
  else if(url.startsWith('/issues?'))r={items:[],next_offset:null};else r={};w.nativeReply(id,r,null);
 },0)},
 location(id){gpsCalls++;setTimeout(()=>w.nativeReply(id,failLocation?null:{lat:17.4,lon:78.3,accuracy:10,country:'India',state:'Telangana',city:'Hyderabad',street:'Main Street'},failLocation?'GPS denied':null),hold?100:0)},
 choosePhoto(id){setTimeout(()=>w.nativeReply(id,{photo,media_metadata:{name:'road.jpg',width:1200,height:800,original_bytes:45678}},null),0)},capture(id){this.choosePhoto(id)},
 geocode(id,query){setTimeout(()=>w.nativeReply(id,{items:query.toLowerCase()==='london'?[{lat:51.5,lon:-.12,city:'London',country:'UK',label:'London, UK'}]:[]},null),0)},
 reverseGeocode(id,lat,lon){setTimeout(()=>w.nativeReply(id,{lat,lon,accuracy:0,city:'Chosen city',country:'India'},null),0)}};
 w.eval(leaflet);w.eval((demo?source:source.replace('const DEMO_LOGIN=true','const DEMO_LOGIN=false'))+`\nwindow.testState={foreign(){demoIssues.push({...demoIssues[0],id:'foreign',user_id:'another-user',reporter:'Another person',city:'Vijayawada'});},seed(){demoIssues=[{...demoIssues[0],id:'near',resolved:null,lat:17.4,lon:78.3},{...demoIssues[0],id:'far',resolved:null,lat:17.44,lon:78.3},{...demoIssues[0],id:'late',resolved:null,deadline:Date.now()/1000-1,lat:17.4,lon:78.3},{...demoIssues[0],id:'closed',lat:17.4,lon:78.3}];},point(lat,lng){picker.map.fire('click',{latlng:{lat,lng}});}};`);
 const $=s=>w.document.querySelector(s);
 const click=async s=>{assert($(s),'Missing '+s);$(s).click();await pause();};
 const fill=(s,v)=>{
  if(s.startsWith('#filter-'))for(const b of [...$(s).parentElement.querySelectorAll('.keyword-chip')])b.click();
  $(s).value=v;$(s).dispatchEvent(new w.Event('input',{bubbles:true}));
  if(s.startsWith('#filter-'))$(s).dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 };
 const submit=async s=>{$(s).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause();};
 return {dom,w,$,click,fill,submit,requests,gps:()=>gpsCalls,deny:v=>failLocation=v,hold:v=>hold=v};
}
(async()=>{
 let t=setup();const {w,$,click,fill,submit}=t;
 try{
  await click('#auth-submit');assert($('.report-entry'));assert.equal($('.report-entry').textContent,'Report an issue');assert.equal($('.issues-entry').textContent,'Reported issues');assert($('.home-actions'));assert($('#report-form'));assert.equal($('#report-tab').getAttribute('aria-selected'),'true');assert.equal(t.gps(),1);assert($('[data-action="header-location"]'));assert.equal($('.avatar').textContent,'D');
  const homeButtons=$('.home-actions'),homeHeader=$('header');await click('[data-action="report"]');assert.equal($('.home-actions'),homeButtons);assert.equal($('header'),homeHeader);assert($('#report-form').closest('#home-sections'));assert.equal($('.report-entry').getAttribute('aria-selected'),'true');assert($('#report-form'));assert(!$('#title'));assert(!$('#report-photo'));assert(!$('#refresh-location'));assert(!$('.required'));assert(!$('.welcome'));
  assert($('#category').closest('.field-row'));assert($('#category').closest('.field-control'));assert.deepEqual([...$('#report-form').querySelectorAll('select,textarea')].map(x=>x.id),['category','description','eta']);assert.equal($('#eta').value,'7');
  fill('#category','Roads & Potholes');fill('#description','Draft retained');await click('[data-action="issues"]');assert.equal($('.home-actions'),homeButtons);await click('[data-action="report"]');assert.equal($('#description').value,'Draft retained');assert.equal($('#category').value,'Roads & Potholes');await click('[data-action="camera"]');await click('[data-kind="photo"]');await pause();assert.equal(t.gps(),2);assert.match($('#coordinates').textContent,/17.40000/);
  assert.match($('#location-status').textContent,/City: Hyderabad/);assert(!$('[data-action="crop"]'));assert($('.nenu-brand-logo'));
  await click('[data-action="media-info"]');assert.match($('.media-dialog').textContent,/road.jpg/);assert.match($('.media-dialog').textContent,/1200/);await click('[aria-label="Close media details"]');
  await submit('#report-form');assert.equal($('.stat.total strong').textContent,'1');assert.equal($('.stat.open strong').textContent,'1');assert.equal(t.requests.length,0);assert($('.stat.closed').disabled);const before=$('#issues-list');await click('[data-action="status-closed"]');assert.equal($('#issues-list'),before);assert(!$('#show-all'));assert(!$('.pie-chart'));
  await click('[data-action="detail"]');assert.match($('#issue-detail').textContent,/Roads & Potholes/);assert($('#issue-detail').closest('.expanded-row'));assert.equal($('.row-number').textContent,'1');
  await submit('#resolve-form');assert.match($('#resolve-error').textContent,/photo or video/);await click('[data-action="upload-proof"]');await submit('#resolve-form');assert.equal($('.stat.closed strong').textContent,'1');
  await click('[data-action="home"]');await click('[data-action="profile"]');fill('#profile-name','Sharath');fill('#profile-email','demo@example.com');await submit('#profile-form');assert.equal($('.avatar').textContent,'S');
  // Seed issues in both sides of the 3km boundary; all remain isolated to demo memory.
  w.testState.seed();
  await click('[data-action="issues"]');assert.equal($('.issues-entry').getAttribute('aria-selected'),'true');assert($('.home-actions'));assert(!$('#radius'));assert(!$('#search-issues-section').open);assert($('#my-issues-section').open);assert.equal($('[data-action=scope-all]').tagName,'SUMMARY');assert.equal($('.stat.total strong').textContent,'4');assert(!$('#filter-status'));assert(!$('#filter-street'));assert(!$('#issue-query'));
  await click('[data-action="status-open"]');assert.equal(w.document.querySelectorAll('.issues-table tbody tr').length,3);assert.equal($('.stat.total strong').textContent,'4');assert(!$('#show-all'));
  await click('[data-action="status-closed"]');assert.equal(w.document.querySelectorAll('.issues-table tbody tr').length,1);await click('[data-action="status-all"]');assert.equal(w.document.querySelectorAll('.issues-table tbody tr').length,4);
  await click('[data-action="scope-all"]');await pause();assert(!$('[name="search-mode"]'));assert.equal($('#radius').value,'3');assert.equal($('.stat.total strong').textContent,'3');assert.equal($('.stat.open strong').textContent,'2');assert.equal($('.stat.closed strong').textContent,'1');assert(!$('.pie-chart'));
  assert.equal($('#worldwide-total').textContent,'4');await click('[data-action=worldwide]');assert.equal($('.stat.total strong').textContent,'4');assert.match($('.list-panel h2').textContent,/Worldwide/);fill('#filter-city','hyderabad');assert.equal($('#worldwide-total').textContent,'4');await click('[data-action=worldwide]');assert.equal($('.stat.total strong').textContent,'3');
  assert($('#filter-category').closest('thead'));assert.equal(w.document.querySelectorAll('.issues-table').length,1);assert(!w.document.querySelector('h1'));assert(!$('[aria-label="Back to home"]'));assert($('.home-actions'));assert($('#issues-list').closest('#home-sections'));assert.equal($('.nenu-brand-logo').tagName,'IMG');assert.equal($('.nenu-brand-logo').getAttribute('src'),'nenu-saitham-logo.jpg');
  fill('#filter-q','sharath telangana road.jpg');assert.equal($('.stat.total strong').textContent,'3');assert.equal($('#filter-q').parentElement.querySelectorAll('.keyword-chip').length,3);fill('#filter-q','no-such-person');assert(!$('.summary-stats'));fill('#filter-q','');assert.equal($('.stat.total strong').textContent,'3');
  fill('#radius','5');$('#radius').dispatchEvent(new w.Event('change'));await pause();assert.equal($('.stat.total strong').textContent,'4');
  fill('#radius','0');$('#radius').dispatchEvent(new w.Event('change'));assert.equal($('#radius').value,'5');
  fill('#filter-category','not found');assert(!$('.pie-chart'));assert(!$('.summary-stats'));assert($('.column-filters').hidden);assert($('#empty-search-keys .keyword-chip'));fill('#filter-category','');
  fill('#filter-category','potholes roads');assert.equal($('.stat.total strong').textContent,'4');assert.equal($('#filter-category').parentElement.querySelectorAll('.keyword-chip').length,2);
  $('#filter-category').parentElement.querySelector('.keyword-chip').click();assert.equal($('.stat.total strong').textContent,'4');fill('#filter-category','');
  await click('[data-action="pick-search"]');assert($('#picker-map'));w.testState.point(0,0);await click('#use-map');assert(!w.document.querySelector('dialog'));assert(!$('.pie-chart'));assert(!$('.summary-stats'));
  assert.equal($('[data-action=pick-search]').getAttribute('aria-pressed'),'true');assert($('#location-search-controls').hidden);await click('[data-action="search-place"]');assert(!$('#location-search-controls').hidden);fill('#area-query','London');await submit('#area-search');await click('.place-result');assert.match($('#area-status').textContent,/London/);
  await click('[aria-label="Remove london"]');fill('#area-query','0,0');await submit('#area-search');await click('.place-result');assert.match($('#area-status').textContent,/0.00000/);
  await click('[data-action="scope-mine"]');assert(!$('#radius'));assert.equal($('.stat.total strong').textContent,'4');
  w.testState.foreign();await click('[data-action="retry-list"]');assert.equal($('.stat.total strong').textContent,'4');
  await click('[data-action="scope-all"]');const gpsBefore=t.gps();await click('#near-me');await pause();assert.equal(t.gps(),gpsBefore+1);assert.equal($('.stat.total strong').textContent,'5');fill('#filter-q','another vijayawada');assert.equal($('.stat.total strong').textContent,'1');fill('#filter-q','');fill('#filter-city','vijay');assert.equal($('.stat.total strong').textContent,'1');fill('#filter-country','india');assert.equal($('.stat.total strong').textContent,'1');fill('#filter-category','electric');assert(!$('.pie-chart'));assert(!$('.summary-stats'));
  await click('[data-action="scope-mine"]');assert.equal($('.stat.total strong').textContent,'4');
  await click('[data-action="home"]');await click('[data-action="report"]');fill('#category','Electricity');await click('[data-action="upload"]');t.deny(true);await click('#refresh-location');assert.match($('#location-status').textContent,/GPS denied/);
  await click('[data-action="pick-report"]');w.testState.point(0,0);await click('#use-map');assert.match($('#coordinates').textContent,/Selected point: 0.00000, 0.00000/);
  await submit('#report-form');assert.equal($('.stat.total strong').textContent,'5');
  // A late GPS response must not override a manually chosen point.
  await click('[data-action="home"]');await click('[data-action="report"]');await click('[data-action="upload"]');t.deny(false);t.hold(true);await click('#refresh-location');await click('[data-action="pick-report"]');w.testState.point(1,2);await click('#use-map');await new Promise(r=>setTimeout(r,120));assert.match($('#coordinates').textContent,/1.00000, 2.00000/);
  await click('[data-action="home"]');await click('[data-action="header-location"]');w.testState.point(3,4);await click('#use-map');assert.match($('#header-location-name').textContent,/Chosen city, India/);assert($('.home-actions'));
  await click('[data-action="profile"]');await click('[data-action="logout"]');await click('#auth-submit');await click('[data-action="issues"]');await click('[data-action="scope-mine"]');assert(!$('.pie-chart'));assert(!$('.summary-stats'));assert(!$('.column-filters'));assert.equal($('#content .empty').textContent,'You haven’t reported any issues yet.');assert.equal(t.requests.length,0);
 }finally{t.dom.window.close();}
 t=setup();
 try{
  const {$,click,fill,submit,w}=t;
  const video='data:video/mp4;base64,fixture';
  w.Native.captureVideo=id=>setTimeout(()=>w.nativeReply(id,{photo:video},null),0);
  w.Native.choosePhoto=w.Native.captureVideo;
  await click('#auth-submit');await click('[data-action="report"]');
  fill('#category','Roads & Potholes');await click('[data-action="camera"]');await click('[data-kind="video"]');await pause();
  assert($('#report-photo video'));assert(!$('[data-action="crop"]'));assert.equal(t.gps(),2);
  assert.match($('#report-form').textContent,/not scanned/);
  await submit('#report-form');await click('[data-action="detail"]');assert($('#issue-detail video'));
  await click('[data-action="upload-proof"]');assert($('#latest-photo video'));
  await submit('#resolve-form');assert.equal($('.stat.closed strong').textContent,'1');
  assert.equal(w.document.querySelectorAll('#issue-detail video').length,2);
 }finally{t.dom.window.close();}
 t=setup(false);
 try{
  const {$,click,fill,submit,requests}=t;
  await click('[data-action="switch-auth"]');fill('#email','sharath@example.com');fill('#password','secure-password');fill('#confirm-password','secure-password');fill('#name','Sharath');
  await submit('#auth-form');assert.match($('#auth-error').textContent,/Verify your email/);await click('#send-code');fill('#otp','123456');await click('#verify-code');await submit('#auth-form');assert($('.report-entry'));assert($('#report-form'));assert.equal($('#report-tab').getAttribute('aria-selected'),'true');
  await click('[data-action="profile"]');fill('#profile-email','new@example.com');await submit('#profile-form');assert.match($('#profile-error').textContent,/Verify the new email/);
  await click('#profile-send');fill('#profile-otp','123456');await click('#profile-verify');fill('#profile-email','other@example.com');await submit('#profile-form');assert.match($('#profile-error').textContent,/Verify/);
  fill('#profile-email','sharath@example.com');fill('#profile-name','Updated name');await submit('#profile-form');assert.equal($('.avatar').textContent,'U');assert(requests.some(r=>r.url==='/me'&&r.body.name==='Updated name'));
 }finally{t.dom.window.close();}
 console.log('PASS: video capture/upload/playback/proof and GPS, home, report field order, capture GPS, maps/pin/zero coordinates, GPS failure and race, 3km/5km radius, empty and populated chart totals, filters, search places, resolution, profile, OTP email-change gate, demo isolation and logout.');
})().catch(e=>{console.error(e);process.exitCode=1;});
