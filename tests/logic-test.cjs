const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../android/app/src/main/assets/app.js'),'utf8').replace("go('home').catch(e=>toast(e.message));",'');
const context=vm.createContext({window:{},document:{addEventListener(){}},localStorage:{getItem(){return null}},indexedDB:{open(){return {}}},setInterval(){},setTimeout(){},clearTimeout(){},console,Date,URLSearchParams,crypto:require('node:crypto').webcrypto});
vm.runInContext(source,context);
for(const [expression,expected] of [
 ["state({deadline:Date.now()/1000+3600,resolved:null})",'open'],
 ["state({deadline:Date.now()/1000-1,resolved:null})",'overdue'],
 ["state({deadline:100,resolved:101})",'resolved'],
 ["timeClass({deadline:100,resolved:101})",'late'],
 ["timeClass({deadline:100,resolved:100})",'timely'],
 ["esc('<img src=x onerror=alert(1)>')",'&lt;img src=x onerror=alert(1)&gt;'],
 ["duration(90061)",'1d 1h']
])assert.equal(vm.runInContext(expression,context),expected,expression);
console.log('PASS: 7 frontend status, deadline, elapsed-time and output-escaping assertions.');
