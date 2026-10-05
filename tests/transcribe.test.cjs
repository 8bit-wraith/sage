const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const {stripTypeScriptTypes} = require('node:module');
function fixture() {
 const source=fs.readFileSync(path.join(__dirname,'../index.ts'),'utf8');
 const body=source.slice(source.indexOf('function transcribe('),source.indexOf('\nclass TTSStream'));
 const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
 child.stdout.resume=()=>{};child.stderr.resume=()=>{};
 const reads=[];
 const context={CONFIG:{WHISPER:'synthetic',WHISPER_MODEL:'synthetic',TMP:'/synthetic'},spawn:()=>child,fs:{readFile:async(p)=>{reads.push(p);return 'synthetic transcript';}},cleanTranscript:x=>x};
 vm.createContext(context);vm.runInContext(stripTypeScriptTypes(body)+'\nthis.run=transcribe;',context);
 return {child,reads,run:context.run};
}
test('spawn errors reject without reading transcript',async()=>{
 const f=fixture();const promise=f.run('test');const rejection=assert.rejects(promise,/spawn failed/);
 f.child.emit('error',new Error('spawn failed'));f.child.emit('close',-2,null);await rejection;assert.equal(f.reads.length,0);
});
for(const [code,signal] of [[1,null],[null,'SIGTERM']])test(`failed exit ${code}/${signal} rejects`,async()=>{
 const f=fixture();const promise=f.run('test');const rejection=assert.rejects(promise,/Whisper/);
 f.child.stdout.emit('end');f.child.emit('close',code,signal);await rejection;assert.equal(f.reads.length,0);
});
test('stdout ending does not read transcript until successful close',async()=>{
 const f=fixture();const promise=f.run('test');f.child.stdout.emit('end');assert.equal(f.reads.length,0);
 f.child.emit('close',0,null);assert.equal(await promise,'synthetic transcript');assert.deepEqual(f.reads,['/synthetic/transcripts/test.txt']);
});

function realFixture(mode) {
 const source=fs.readFileSync(path.join(__dirname,'../index.ts'),'utf8');
 const body=source.slice(source.indexOf('function transcribe('),source.indexOf('\nclass TTSStream'));
 const reads=[];
 const context={CONFIG:{WHISPER:'synthetic',WHISPER_MODEL:'synthetic',TMP:'/synthetic'},
  spawn:()=> require('node:child_process').spawn(
   mode==='missing' ? path.join(__dirname,'nonexistent-test-whisper') : process.execPath,
   mode==='missing' ? [] : ['-e', mode==='failure' ? 'process.exit(7)' : "process.stderr.write('x'.repeat(200000)); process.exitCode=0"],
   {timeout:3000}),
  fs:{readFile:async(p)=>{reads.push(p);return 'synthetic transcript';}},cleanTranscript:x=>x};
 vm.createContext(context);vm.runInContext(stripTypeScriptTypes(body)+'\nthis.run=transcribe;',context);
 return {reads,run:context.run};
}
for (const mode of ['missing','failure']) test(`real child ${mode} rejects without reading`,{timeout:5000},async()=>{
 const f=realFixture(mode);await assert.rejects(f.run('test'));assert.equal(f.reads.length,0);
});
test('real successful child drains stderr then reads transcript',{timeout:5000},async()=>{
 const f=realFixture('success');assert.equal(await f.run('test'),'synthetic transcript');assert.equal(f.reads.length,1);
});
