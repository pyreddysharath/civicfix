const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../android/app/src/main/assets/app.js'),'utf8').split('(async()=>{if(!DEMO_LOGIN')[0];
const context=vm.createContext({window:{},location:{origin:'http://localhost'},document:{addEventListener(){}},sessionStorage:{getItem(){return null}},setInterval(){},setTimeout(){},clearTimeout(){},console,Date,URLSearchParams,crypto:require('node:crypto').webcrypto});
vm.runInContext(source,context);
for(const [expression,expected] of [
 ["status({deadline:100,resolved:null},99)",'open'],
 ["status({deadline:100,resolved:null},100)",'overdue'],
 ["status({deadline:100,resolved:101},102)",'resolved'],
 ["status({deadline:100,resolved:99},100)",'resolved'],
 ["esc('<img src=x onerror=alert(1)>')",'&lt;img src=x onerror=alert(1)&gt;'],
 ["elapsed({created:100,resolved:90161})",'1d 1h']
])assert.equal(vm.runInContext(expression,context),expected,expression);
console.log('PASS: 6 status-boundary, elapsed-time and output-escaping assertions.');
