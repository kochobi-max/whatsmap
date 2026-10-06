// fetch_adrc.js をクラウドから実サイトで試す試験台（スキルには上げない）。
// 準備: npm i jsdom（OneDrive配下に作らない）。ADRCは中間証明書を送らないので、
//   cat $SSL_CERT_FILE skills/ldi-cms-report/references/certs/globalsign_gcc_r3_dv_tls_ca_2020.pem > /tmp/adrc_ca.pem
// 実行: node skills/ldi-cms-report/dev/try_fetch_adrc.js skills/ldi-cms-report/scripts/fetch_adrc.js
// 結果: /tmp/adrc_result.json。検証は外していない（--cacert で鎖を補うだけ）。
// fetch_adrc.js を実サイトで試す。fetch は検証付き curl、DOMParser は jsdom。
const fs=require('fs'), {execFileSync}=require('child_process'), {JSDOM}=require('jsdom');
const CA='/tmp/adrc_ca.pem';
global.DOMParser = new JSDOM('').window.DOMParser;
global.fetch = async (url) => {
  const body = execFileSync('curl',['-sS','-m','30','--cacert',CA,'-A','Mozilla/5.0','-w','\n%{http_code}',url],{maxBuffer:64e6}).toString('latin1');
  const i=body.lastIndexOf('\n'); const code=+body.slice(i+1); const raw=Buffer.from(body.slice(0,i),'latin1');
  const charset=/charset=["']?([\w-]+)/i.exec(raw.toString('latin1').slice(0,3000));
  const txt=new TextDecoder((charset&&charset[1])||'utf-8').decode(raw);
  return {ok:code>=200&&code<300,status:code,text:async()=>txt};
};
const src=fs.readFileSync(process.argv[2],'utf8');
(async()=>{ const r=await eval(src); fs.writeFileSync('/tmp/adrc_result.json',JSON.stringify(r,null,1));
  console.log('list_count',r.list_count,'failures',r.failures);
  for(const x of r.rows) console.log(x.key, x.extract, (x.name||'').slice(0,40), '|', x.error||'', '| n=',x.reports.length, x.reports[0]?('| first: '+x.reports[0].date+' '+(x.reports[0].source||'')).slice(0,80):'');
})();
