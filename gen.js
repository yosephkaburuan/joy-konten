/* Mesin konten JOY: "Siapa pemilik perusahaan ini?"
   Data -> kartu 4:5 dan 9:16 + caption + komentar pertama (UTM). Semua angka dibaca dari data situs, tidak diketik manual.
   Pakai:  node gen.js BBCA,BBRI,...   atau   node gen.js --auto 7   (pilih sendiri, hindari yang sudah tayang)  */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const SITE=process.env.SITE||process.env.SITE_DIR||'/home/claude/joy-site';   /* folder lokal atau https://saham.ijoy.co.id/ */
const OUT=process.env.OUT_DIR||'/home/claude/fbpack/out';
const STATE=process.env.STATE_FILE||path.join(path.dirname(OUT),'posted.json');
const BASE_URL='https://saham.ijoy.co.id/';
const PAGE_ID=process.env.FB_PAGE||'analisasahamjoy';
const IS_URL=/^https?:\/\//.test(SITE);
async function readBin(rel){
  try{
    if(IS_URL){const r=await fetch(SITE.replace(/\/?$/,'/')+rel,{headers:{'cache-control':'no-cache'}});if(!r.ok)return null;return Buffer.from(await r.arrayBuffer());}
    const f=path.join(SITE,rel);return fs.existsSync(f)?fs.readFileSync(f):null;
  }catch(e){return null;}
}
async function readJSON(rel){const b=await readBin(rel);if(!b)throw new Error('data tidak terbaca: '+rel);return JSON.parse(b.toString('utf8'));}
const MON=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const nf=(v,d=1)=>Number(v).toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d});
const dt=s=>{const [y,m,d]=s.split('-').map(Number);return `${d} ${MON[m-1]} ${y}`;};
const days=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/864e5);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let comp,stocks,monthly=null;
async function loadData(){
  comp=(await readJSON('ownership-composition.json')).byCode;
  stocks=Object.fromEntries((await readJSON('stocks.json')).stocks.map(s=>[s.code,s]));
  try{monthly=await readJSON('ownership-monthly.json');}catch(e){}
}

function build(code){
  const h=(comp[code]||[]).filter(x=>[x.foreignShare,x.retailLocalShare,x.localNonRetailShare].every(Number.isFinite)).sort((a,b)=>a.date<b.date?-1:1);
  const st=stocks[code];if(h.length<4||!st)return null;
  const last=h[h.length-1];
  /* pembanding: snapshot terdekat sekitar 90 hari sebelum data terbaru (minimal 60 hari) */
  const cand=h.filter(x=>days(x.date,last.date)>=60).sort((a,b)=>Math.abs(days(a.date,last.date)-90)-Math.abs(days(b.date,last.date)-90));
  const base=cand[0];if(!base)return null;
  const f=last.foreignShare,r=last.retailLocalShare,l=last.localNonRetailShare;
  const d={f:f-base.foreignShare,r:r-base.retailLocalShare,l:l-base.localNonRetailShare};
  let cov=null;const mh=monthly&&monthly.history&&monthly.history[code];
  if(mh){const m=mh.find(x=>x.date===last.date);if(m&&Number.isFinite(m.coverageOfIssued))cov=m.coverageOfIssued;}
  const spark=h.slice(-10).map(x=>({d:x.date,v:x.foreignShare}));
  return {code,name:st.name,sector:st.subsector||st.sector,mcap:st.marketCap||0,date:last.date,baseDate:base.date,months:Math.round(days(base.date,last.date)/30.4),f,r,l,d,cov,spark};
}
function archetype(x){
  if(x.f>=60)return `Lebih dari separuh dipegang investor asing (${nf(x.f)}%)`;
  if(x.r>=35)return `Investor individu lokal memegang ${nf(x.r)}%, porsi ritel termasuk besar`;
  if(x.l>=55)return `Lembaga lokal (korporasi, dana, dan sejenisnya) memegang ${nf(x.l)}%`;
  if(x.f>=x.r&&x.f>=x.l)return `Asing menjadi kelompok terbesar (${nf(x.f)}%)`;
  return `Kepemilikan terbagi cukup merata antar kelompok`;
}
function deltaText(x){
  const a=Math.abs(x.d.f);
  if(a<0.5)return `Porsi asing relatif tetap dalam ${x.months} bulan terakhir (${x.d.f>=0?'+':'−'}${nf(a)} poin).`;
  return `Dalam ${x.months} bulan terakhir (${dt(x.baseDate)} sampai ${dt(x.date)}) porsi asing ${x.d.f>0?'naik':'turun'} ${nf(a)} poin, dari ${nf(x.f-x.d.f)}% ke ${nf(x.f)}%.`+(a>=5?' Pergeseran sebesar ini bisa juga berasal dari pemindahan antar entitas, bukan hanya jual beli bersih.':'');
}
function covText(x){return x.cov!=null?`, yaitu sekitar ${nf(x.cov,0)}% dari seluruh saham yang beredar`:'';}
function caption(x){
  return `Siapa pemilik $${x.code}?

${archetype(x)}. ${deltaText(x)}

Posisi ${dt(x.date)}: Asing ${nf(x.f)}% · Ritel lokal ${nf(x.r)}% · Lembaga lokal ${nf(x.l)}%.

Catatan: persentase dihitung dari saham yang tercatat di KSEI${covText(x)}. Ritel lokal = individu lokal; lembaga lokal = pemegang lokal non-individu. Pola kepemilikan, bukan ajakan membeli atau menjual.

Daftar pemegang besar dan pergerakannya ada di website JOY. Link di komentar pertama.

#${x.code} #SahamIndonesia #KSEI #AnalisaSaham`;
}
function utm(x){return `${BASE_URL}?saham=${x.code}&utm_source=facebook&utm_medium=social&utm_campaign=siapa-pemilik&utm_content=${PAGE_ID}_${x.code.toLowerCase()}_${x.date}#kepemilikan`;}
function firstComment(x){return `Lihat pemegang besar $${x.code} dan pergerakannya (data KSEI ${dt(x.date)}): ${utm(x)}`;}
function alt(x){return `Grafik batang kepemilikan saham ${x.code} per ${dt(x.date)}: asing ${nf(x.f)} persen, ritel lokal ${nf(x.r)} persen, lembaga lokal ${nf(x.l)} persen, dihitung dari saham tercatat di KSEI.`;}

function spark(x,W,H){
  const p=x.spark,min=Math.min(...p.map(a=>a.v)),max=Math.max(...p.map(a=>a.v)),pad=(max-min)||1,top=70,bot=H-90,X=i=>40+i*(W-80)/(p.length-1),Y=v=>bot-(v-min)/pad*(bot-top);
  const pts=p.map((a,i)=>`${X(i).toFixed(1)},${Y(a.v).toFixed(1)}`).join(' ');
  const e=p[p.length-1],s=p[0],i1=p.length-1;
  const side=(a,nb)=>nb.v>a.v?Y(a.v)+42:Y(a.v)-24; /* label di sisi yang menjauhi garis */
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Porsi asing dari ${dt(s.d)} ke ${dt(e.d)}"><polyline points="${pts}" fill="none" stroke="#c6f05a" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>${p.map((a,i)=>`<circle cx="${X(i).toFixed(1)}" cy="${Y(a.v).toFixed(1)}" r="${i===i1?11:5}" fill="${i===i1?'#c6f05a':'#0f2f25'}" stroke="#c6f05a" stroke-width="3"/>`).join('')}<text x="${X(0)}" y="${side(s,p[1]).toFixed(1)}" font-size="30" fill="#cfe3d9" text-anchor="start">${nf(s.v)}%</text><text x="${X(i1)}" y="${side(e,p[i1-1]).toFixed(1)}" font-size="34" font-weight="800" fill="#c6f05a" text-anchor="end">${nf(e.v)}%</text><text x="${X(0)}" y="${H-4}" font-size="26" fill="#9db8ab" text-anchor="start">${dt(s.d)}</text><text x="${X(i1)}" y="${H-4}" font-size="26" fill="#9db8ab" text-anchor="end">${dt(e.d)}</text></svg>`;
}
const chg=v=>Math.abs(v)<0.05?'0,0':(v>0?'+':'−')+nf(Math.abs(v));
function html(x,H,logo,brand,sh){
  const tall=H>1500,seg=[['Asing',x.f,'#c6f05a','#0f2f25'],['Ritel lokal',x.r,'#f2b84b','#2a1c00'],['Lembaga lokal',x.l,'#7fd1b9','#06241c']];
  return `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}body{width:1080px;height:${H}px;background:#0f2f25;color:#f4f1e6;font-family:Inter,'DejaVu Sans',sans-serif;overflow:hidden}
.c{height:100%;padding:${tall?'230px 60px 330px':'48px 60px 44px'};display:flex;flex-direction:column;gap:${tall?44:26}px}
.top{display:flex;align-items:center;justify-content:space-between;color:#9db8ab;font-size:28px;font-weight:600}.top img{height:54px}
.id{flex:none;display:flex;align-items:center;gap:28px}.lg{width:130px;height:130px;border-radius:50%;background:#fff;object-fit:contain;padding:12px;flex:none}
.q{font-size:34px;color:#9db8ab;font-weight:600}.cd{font-size:112px;font-weight:900;letter-spacing:-3px;line-height:1;color:#fff}.nm{font-size:30px;color:#cfe3d9;margin-top:6px}
.h{flex:none;font-size:46px;font-weight:800;line-height:1.18;letter-spacing:-.5px}
.bar{flex:none;display:flex;height:128px;border-radius:20px;overflow:hidden;gap:4px}.bar>div{display:flex;align-items:center;justify-content:center;font-size:46px;font-weight:900}
.k{flex:none;display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.k>div{background:#16402f;border-radius:20px;padding:22px 24px}.k b{display:block;font-size:30px;color:#cfe3d9;font-weight:700}.k i{font-style:normal;display:block;font-size:56px;font-weight:900;margin-top:4px}.k small{font-size:26px;color:#9db8ab;font-weight:600}
.sp{flex:none;background:#16402f;border-radius:20px;padding:22px 24px 14px}.sp h3{font-size:30px;color:#cfe3d9;font-weight:700;margin-bottom:8px}
.ft{margin-top:auto;font-size:25px;line-height:1.4;color:#9db8ab;border-top:2px solid #25503f;padding-top:20px}.ft b{color:#cfe3d9}
</style><div class="c">
<div class="top"><img src="${brand}"><span>saham.ijoy.co.id</span></div>
<div class="id">${logo?`<img class="lg" src="${logo}">`:''}<div><div class="q">Siapa pemilik</div><div class="cd">$${x.code}</div><div class="nm">${esc(x.name)}</div></div></div>
<div class="h">${esc(archetype(x))}</div>
<div class="bar" role="img" aria-label="${esc(alt(x))}">${seg.map(s=>`<div style="flex:${Math.max(s[1],0.01)};background:${s[2]};color:${s[3]}">${s[1]>=10?nf(s[1],0)+'%':''}</div>`).join('')}</div>
<div class="k">${seg.map((s,i)=>`<div><b>${s[0]}</b><i style="color:${s[2]}">${nf(s[1])}%</i><small>${chg([x.d.f,x.d.r,x.d.l][i])} poin / ${x.months} bln</small></div>`).join('')}</div>
<div class="sp"><h3>Porsi asing, posisi akhir bulan</h3>${spark(x,960,sh||(tall?300:230))}</div>
<div class="ft"><b>Sumber: KSEI, posisi ${dt(x.date)}.</b> Persentase dari saham yang tercatat di KSEI${covText(x)}. Ritel lokal = individu lokal; lembaga lokal = pemegang lokal non-individu. Pola kepemilikan, bukan ajakan membeli atau menjual.</div>
</div>`;
}
const b64=async(rel,t)=>{const b=await readBin(rel);return b?`data:${t};base64,`+b.toString('base64'):'';};
async function render(browser,x,outDir){
  const logo=await b64('logo/'+x.code+'.webp','image/webp'),brand=await b64('joy-logo.png','image/png');
  fs.mkdirSync(outDir,{recursive:true});
  for(const [H,name] of [[1350,'kartu_4x5.png'],[1920,'kartu_9x16.png']]){
    const p=await browser.newPage({viewport:{width:1080,height:H}});
    // sesuaikan tinggi grafik sampai catatan sumber muat penuh (margin bawah aman)
    let sh=H>1500?300:230;
    for(let i=0;i<14;i++){
      await p.setContent(html(x,H,logo,brand,sh),{waitUntil:'load'});await p.waitForTimeout(120);
      const bottom=await p.evaluate(()=>document.querySelector('.ft').getBoundingClientRect().bottom);
      if(bottom<=H-(H>1500?330:44)+0.5||sh<=110)break;
      sh-=12;
    }
    await p.screenshot({path:path.join(outDir,name)});await p.close();
  }
  fs.writeFileSync(path.join(outDir,'caption.txt'),caption(x));
  fs.writeFileSync(path.join(outDir,'komentar_pertama.txt'),firstComment(x));
  fs.writeFileSync(path.join(outDir,'alt_text.txt'),alt(x));
  fs.writeFileSync(path.join(outDir,'data.json'),JSON.stringify(x,null,1));
}
function auto(n){
  const posted=fs.existsSync(STATE)?JSON.parse(fs.readFileSync(STATE,'utf8')):{};const now=Date.now();
  const ranked=Object.keys(stocks).map(c=>({c,m:stocks[c].marketCap||0})).sort((a,b)=>b.m-a.m).slice(0,80).map(o=>o.c);
  const cs=ranked.map(build).filter(Boolean).filter(x=>Math.abs(x.d.f)<10&&Math.abs(x.d.r)<10&&Math.abs(x.d.l)<10&&!(posted[x.code]&&now-posted[x.code]<60*864e5));
  cs.sort((a,b)=>(Math.abs(b.d.f)*2+Math.log10(b.mcap||1))-(Math.abs(a.d.f)*2+Math.log10(a.mcap||1)));
  return cs.slice(0,n).map(x=>x.code);
}
(async()=>{
  await loadData();
  let codes;const a=process.argv.slice(2);
  if(a[0]==='--auto')codes=auto(+a[1]||7);else codes=(a[0]||'BBCA,BBRI,BMRI,TLKM,ASII,BREN,HMSP').split(',');
  const browser=await chromium.launch();const index=[];
  for(const c of codes){const x=build(c);if(!x){console.log('lewati',c,'(data kurang)');continue;}
    const dir=path.join(OUT,`${x.date}_${c}`);await render(browser,x,dir);index.push({code:c,dir,date:x.date});console.log('ok',c,x.date,nf(x.f),nf(x.r),nf(x.l),'d',chg(x.d.f));}
  await browser.close();
  fs.writeFileSync(path.join(OUT,'indeks.json'),JSON.stringify(index,null,1));
  const md=['# Paket konten Facebook ('+new Date().toISOString().slice(0,10)+')','','Cara pakai: unggah gambar 4:5 sebagai postingan, tempel caption, lalu tempel komentar pertama (berisi link) segera setelah tayang. Kartu 9:16 untuk Story/Reels.',''];
  for(const i of index){const r=p=>fs.readFileSync(path.join(i.dir,p),'utf8');
    md.push('## $'+i.code+' (data KSEI '+i.date+')','',`Gambar: \`${path.basename(i.dir)}/kartu_4x5.png\` dan \`kartu_9x16.png\``,'','**Caption**','','```',r('caption.txt'),'```','','**Komentar pertama**','','```',r('komentar_pertama.txt'),'```','','**Teks alternatif gambar**: '+r('alt_text.txt'),'');}
  fs.writeFileSync(path.join(OUT,'ringkasan.md'),md.join('\n'));
  if(a[0]==='--auto'&&a.includes('--mark')){const p=fs.existsSync(STATE)?JSON.parse(fs.readFileSync(STATE,'utf8')):{};index.forEach(i=>p[i.code]=Date.now());fs.writeFileSync(STATE,JSON.stringify(p));}
})();
