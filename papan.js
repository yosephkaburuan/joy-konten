/* Mesin papan JOY: memotret papan di beranda saham.ijoy.co.id menjadi kartu Facebook 4:5 (album), lengkap dengan caption,
   komentar pertama (link UTM) dan teks alternatif. Semua isi dibaca dari website yang sedang tayang, tidak diketik manual.
   Pakai:  node papan.js                      (semua papan yang datanya baru)
           node papan.js --only kg,asing      (papan tertentu)
           node papan.js --force              (abaikan catatan "sudah tayang")
           node papan.js --mark               (catat tanggal data yang sudah dibuat, supaya tidak dobel)
           node papan.js --antri              (masukkan hasilnya ke daftar tunggu tayang antrian-papan.json)
   Papan: kg (Konglo Market Board), asing (Arus Asing Saham), sektor (Rotasi Sektor), lonjakan (Lonjakan Transaksi),
          inv (Top Tracked Investors), mv (Ownership Moves). */
const fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const SITES=(process.env.SITE||'https://saham.ijoy.co.id/').split(',').map(x=>x.trim()).filter(x=>/^https?:/.test(x));
if(SITES.some(x=>/saham\.ijoy\.co\.id/.test(x))&&!SITES.some(x=>/pages\.dev/.test(x)))SITES.push('https://joy-capital-radar.pages.dev/');
const OUT=process.env.OUT_DIR||'/home/claude/fbpack/papan-out';
const STATE=process.env.STATE_FILE||path.join(path.dirname(OUT),'posted-papan.json');
const ANTRIAN=process.env.ANTRIAN||path.join(path.dirname(OUT),'antrian-papan.json');   /* daftar tunggu tayang; dibaca fbpost.js */
const BASE='https://saham.ijoy.co.id/';
const UA='Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';
const MASK=(process.env.NAMA_PERORANGAN||'samarkan')!=='tampil';   /* nama pemegang perorangan di papan Ownership Moves diganti "Investor perorangan" */
const MAXAGE=+process.env.MAX_UMUR_HARI||4;                          /* data lebih tua dari ini (hari kalender) dianggap basi dan dilewati */
const SCALE=960/398;                                                 /* kartu papan selebar 398 px di layar 430 px -> 960 px di kanvas 1080 */
const LIM=480;                                                       /* tinggi maksimal satu panel (px CSS) supaya muat di kanvas 4:5 */
const ENTITY='\\b(PT|TBK|LTD|LIMITED|LLC|INC|CORP|CORPORATION|SEKURITAS|SECURITIES|BANK|FUND|FUNDS|ASSET|INVEST\\w*|CAPITAL|HOLDING\\w*|GROUP|TRUST|PENSION|DANA|ASURANSI|INSURANCE|LIFE|BV|PTE|PLC|AG|SA|CO|COMPANY|NOMINEES|NOMINEE|MANAGEMENT|PARTNERS|GLOBAL|INTERNATIONAL|KOPERASI|YAYASAN|PERSERO|NEGARA|REPUBLIK|PEMERINTAH|BPJS|TASPEN|DANANTARA|INDONESIA)\\b';

const BOARDS=[
 {key:'ti',card:'#hdTiC',judul:'Trading Idea JOY',em:'💡',hash:'#rekam-jejak',dateRule:'min',listN:5,listHead:'Daftar ide',
  intro:'Ide trading berbasis data penutupan terakhir, dihitung otomatis oleh model JOY.',sumber:'data penutupan bursa, model JOY (tahap pilot), dihitung otomatis',
  tag:'#TradingIdea #AnalisaSaham #SahamIndonesia #BEI'},
 {key:'kg',tab:'kg',judul:'Konglo Market Board',em:'🏛️',hash:'#konglo-xray',
  intro:'Grup konglomerasi mana yang bergerak paling kuat di bursa?',sumber:'data penutupan bursa dan arus asing, dihitung JOY. Wajah bulat = ilustrasi AI tokoh yang umum dikaitkan dengan grup, bukan foto resmi',
  tag:'#KongloMarket #GrupUsaha #SahamIndonesia #BEI'},
 {key:'asing',tab:'asing',judul:'Arus Asing Saham',em:'🌏',
  intro:'Saham yang paling banyak dibeli dan dijual investor asing dalam 5 hari bursa terakhir.',sumber:'data bursa; net asing = lembar net × harga penutupan (estimasi)',
  tag:'#ArusAsing #NetBeliAsing #NetJualAsing #SahamIndonesia #BEI'},
 {key:'sektor',tab:'sektor',judul:'Rotasi Sektor',em:'🧭',
  intro:'Sektor mana yang sedang diminati pasar, dan sektor mana yang ditinggalkan?',sumber:'data penutupan bursa, dihitung JOY',
  tag:'#RotasiSektor #SektorSaham #SahamIndonesia #BEI'},
 {key:'lonjakan',tab:'lonjakan',judul:'Lonjakan Transaksi',em:'⚡',
  intro:'Saham dengan nilai transaksi jauh di atas rata-rata hariannya.',sumber:'data transaksi bursa, dihitung JOY',
  tag:'#LonjakanTransaksi #SahamAktif #SahamIndonesia #BEI'},
 {key:'inv',tab:'own',os:'inv',judul:'Top Tracked Investors',em:'🏦',hash:'#investor-tracker',dateRule:'first',maxAge:45,
  intro:'Investor dan institusi dengan posisi terbesar di saham Indonesia.',sumber:'KSEI, pemegang ≥1% (posisi akhir bulan)',
  tag:'#InvestorBesar #KSEI #KepemilikanSaham #SahamIndonesia'},
 {key:'mv',tab:'own',os:'mv',judul:'Ownership Moves',em:'🔄',hash:'#ownership-moves',maxAge:7,list:false,
  intro:'Perubahan kepemilikan ≥5% terbaru. Ini perubahan posisi pemegang saham dalam laporan, belum tentu jual-beli di bursa.',sumber:'laporan kepemilikan ≥5%',
  tag:'#KepemilikanSaham #PemegangSaham #SahamIndonesia #BEI'}
];
const MON=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
const MONF=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const HARI=['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const tglPendek=iso=>{const [y,m,d]=iso.split('-').map(Number);return `${d} ${MON[m-1]} ${y}`;};
const tglPanjang=iso=>{const [y,m,d]=iso.split('-').map(Number);const w=new Date(Date.UTC(y,m-1,d)).getUTCDay();return `${HARI[w]}, ${d} ${MONF[m-1]} ${y}`;};
function parseDates(t){
  const out=[],re=/(\d{1,2})\s+(Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des)\w*\s+(\d{4})/g;let m;
  while((m=re.exec(t||''))){out.push(`${m[3]}-${String(MON.indexOf(m[2])+1).padStart(2,'0')}-${String(+m[1]).padStart(2,'0')}`);}
  return out;
}
const readState=()=>{try{return JSON.parse(fs.readFileSync(STATE,'utf8'));}catch(e){return {};}};

async function openSite(browser){
  for(const site of SITES){
    const ctx=await browser.newContext({viewport:{width:430,height:900},deviceScaleFactor:SCALE,isMobile:true,hasTouch:true,userAgent:UA,locale:'id-ID',timezoneId:'Asia/Jakarta'});
    const p=await ctx.newPage();
    try{
      await p.goto(site,{waitUntil:'domcontentloaded',timeout:60000});
      await p.waitForSelector('#joyDash .hd-kg',{timeout:60000});
      await p.waitForFunction(()=>{const e=document.querySelector('.hd-kg .joy-asof');return !!(window.__JOY_MARKET_DAILY__&&e&&e.textContent.trim());},null,{timeout:90000}).catch(()=>console.error('[JOY] data harga belum lengkap di '+site+', lanjut dengan yang ada'));
      await p.addStyleTag({content:'.st-fab,.joy-photo-btn,[id*=cookie i],[class*=cookie i],[class*=consent i]{display:none!important}.pp-hide{display:none!important}.hd-kg .hd-rt b{white-space:normal!important;text-overflow:clip!important;overflow:visible!important}#hdTiC .hd-tqs{flex-wrap:wrap!important;overflow:visible!important;margin-inline:0!important;padding:0!important}#hdTiC .hd-tqc{flex:0 0 100%!important}#hdTiC .hd-tqgo{display:none!important}'});
      console.log('[JOY] website terbuka: '+site);
      return {ctx,p,site};
    }catch(e){console.error('[JOY] gagal membuka '+site+' -> '+e.message.split('\n')[0]);await ctx.close();}
  }
  return null;
}
async function pick(p,b){
  if(b.card){await p.waitForFunction(c=>{const e=document.querySelector(c+' .hd-tqc');return !!e&&e.getBoundingClientRect().height>0;},b.card,{timeout:45000});await p.waitForTimeout(600);return;}
  await p.click(`[data-hd-kt="${b.tab}"]`,{timeout:20000});
  if(b.os){await p.waitForSelector('[data-hd-os]',{timeout:15000});await p.click(`[data-hd-os="${b.os}"]`,{timeout:15000});}
  await p.waitForFunction(t=>{const h=document.getElementById('hdKgH');return h&&h.textContent.trim()===t&&!!document.querySelector('#hdKg .kb-card,#hdKg li.hd-r,#hdKg tbody tr');},b.judul,{timeout:45000});
  await p.waitForTimeout(900);
}
async function prep(p,b){   /* gambar dimuat penuh, nama perorangan disamarkan */
  await p.evaluate(async ({mask,sel})=>{
    const k=document.querySelector(sel);k.scrollIntoView({block:'start'});
    const imgs=[...k.querySelectorAll('img')];imgs.forEach(i=>{i.loading='eager';});
    await Promise.all(imgs.map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r;setTimeout(r,8000);})));
    if(mask){const re=new RegExp(mask.re,'i');k.querySelectorAll('li.hd-mr .hd-rt b').forEach(b=>{if(!re.test(b.textContent)&&!b.__m){b.__m=1;b.textContent='Investor perorangan';}});}
  },{mask:MASK?{re:ENTITY}:null,sel:b.card||'.hd-kg'});
  await p.waitForTimeout(300);
}
async function extract(p,b){
  if(b.card)return p.evaluate(sel=>{
    const t=e=>(e?e.innerText:'').replace(/\s+/g,' ').trim(),k=document.querySelector(sel);
    const rows=[...k.querySelectorAll('.hd-tqc')].filter(r=>r.getBoundingClientRect().height>0).map(r=>(r.innerText||'').split(/[\n\t]+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean));
    return {judul:t(k.querySelector('.hd-tqh h2')),sub:t(k.querySelector('.hd-tqh small')),asof:t(k.querySelector('.hd-tqh small')),cards:[],rows,secHead:'',selTab:'',note:''};
  },b.card);
  return p.evaluate(()=>{
    const t=e=>(e?e.innerText:'').replace(/\s+/g,' ').trim();
    const k=document.querySelector('.hd-kg');
    const cards=[...k.querySelectorAll('#hdKg .kb-card')].map(c=>({l:t(c.querySelector('.kb-ct small')),n:t(c.querySelector('.kb-ct b')),v:t(c.querySelector('em'))}));
    const secs=[...k.querySelectorAll('#hdKg .hd-secs section')],scope=secs.length?secs[0]:k.querySelector('#hdKg');
    const rows=[...scope.querySelectorAll('li.hd-r,tbody tr')].filter(r=>!r.classList.contains('hd-xtra')&&r.getBoundingClientRect().height>0)
      .map(r=>(r.innerText||'').split(/[\n\t]+/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean));
    const sub=secs.length?t(secs[0].querySelector('.hd-sh')):'';
    const sel=t(k.querySelector('#hdKg .hd-mbs.on'));
    return {judul:t(document.getElementById('hdKgH')),sub:t(document.getElementById('hdKgSub')),asof:t(k.querySelector('.joy-asof')),cards,rows,secHead:sub,selTab:sel,note:t(k.querySelector('.hd-nt'))};
  });
}
/* panel = potongan papan yang dipotret. 'sorotan' = judul + kartu unggulan; 'daftar' = judul + peringkat (baris diperas sampai muat) */
async function shoot(p,mode,sel){
  sel=sel||'.hd-kg';
  await p.evaluate(({mode,LIM,sel})=>{
    const k=document.querySelector(sel),kg=(sel==='.hd-kg'?document.getElementById('hdKg'):null)||k,H=()=>k.getBoundingClientRect().height;
    k.querySelectorAll('.pp-hide').forEach(e=>e.classList.remove('pp-hide'));
    const hide=e=>e&&e.classList.add('pp-hide');
    hide(k.querySelector('.hd-kgbar'));k.querySelectorAll('.hd-all').forEach(hide);k.querySelectorAll('.hd-own .hd-mbsub').forEach(hide);k.querySelectorAll('.hd-ld').forEach(hide);
    if(mode==='sorotan'){
      const keep=kg.querySelector('.kb-cards');
      let n=keep;while(n&&n!==kg){[...n.parentElement.children].forEach(s=>{if(s!==n)hide(s);});n=n.parentElement;}
      const nt=k.querySelector('.hd-nt');if(nt)nt.classList.remove('pp-hide');   /* catatan metode tetap ikut */
      k.querySelectorAll('.hd-nt').forEach(e=>e.classList.remove('pp-hide'));
    }else{
      kg.querySelectorAll('.kb-cards').forEach(hide);
      const rows=[...kg.querySelectorAll('li.hd-r,tbody tr,.hd-tqc')].filter(r=>r.getBoundingClientRect().height>0);
      let vis=rows.length;
      while(vis>3&&H()>LIM){hide(rows[--vis]);}
      kg.querySelectorAll('section').forEach(s=>{if(![...s.querySelectorAll('li.hd-r,tbody tr')].some(r=>r.getBoundingClientRect().height>0))hide(s);});
    }
  },{mode,LIM,sel});
  await p.waitForTimeout(250);
  const card=await p.$(sel);
  const h=await card.evaluate(e=>Math.round(e.getBoundingClientRect().height));
  const buf=await card.screenshot({type:'png'});
  return {buf,h};
}
function compose(brand,imgs,iso,idx,total){
  const img=imgs.toString('base64');
  return `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=block"><style>
*{box-sizing:border-box;margin:0}body{width:1080px;height:1350px;background:#0f2f25;color:#f4f1e6;font-family:Inter,'DejaVu Sans',sans-serif;overflow:hidden}
.c{height:100%;padding:44px 60px 40px;display:flex;flex-direction:column;gap:26px}
.top{flex:none;display:flex;align-items:center;justify-content:space-between}.top img{height:54px}.top b{font-size:34px;font-weight:800;color:#c6f05a;letter-spacing:-.3px}
.mid{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}.mid img{max-width:960px;max-height:100%;border-radius:30px;box-shadow:0 10px 40px rgba(0,0,0,.35)}
.ft{flex:none;display:flex;align-items:center;justify-content:space-between;gap:20px;border-top:2px solid #25503f;padding-top:22px}
.ft .a{font-size:30px;font-weight:700;color:#f4f1e6;line-height:1.25}.ft .a em{font-style:normal;color:#c6f05a}.ft .b{font-size:23px;line-height:1.35;color:#9db8ab;margin-top:6px}.ft .n{flex:none;font-size:28px;font-weight:800;color:#0f2f25;background:#c6f05a;border-radius:999px;padding:8px 22px}
</style><div class="c"><div class="top"><img src="${brand}"><b>Data per ${tglPendek(iso)}</b></div>
<div class="mid"><img src="data:image/png;base64,${img}"></div>
<div class="ft"><div><div class="a">Detail lengkap tiap saham: <em>saham.ijoy.co.id</em></div><div class="b">Data dan edukasi, bukan ajakan membeli atau menjual.</div></div>${total>1?`<div class="n">${idx}/${total}</div>`:''}</div></div>`;
}
async function frame(browser,brand,png,iso,idx,total,file){
  const pg=await browser.newPage({viewport:{width:1080,height:1350}});
  await pg.setContent(compose(brand,png,iso,idx,total),{waitUntil:'load',timeout:30000});
  await pg.evaluate(()=>document.fonts&&document.fonts.ready).catch(()=>{});await pg.waitForTimeout(200);
  await pg.screenshot({path:file});await pg.close();
}
const sc=x=>{x=(x||'').trim();return x?x[0].toUpperCase()+x.slice(1).toLowerCase():x;};
function cleanRow(parts){
  let a=parts.slice();
  while(a.length>1&&(/^\d{1,2}$/.test(a[0])||(/^[A-Z0-9]{2}$/.test(a[0]))))a.shift();   /* nomor urut dan inisial logo */
  a=a.filter(x=>!/^dari rata-rata$/i.test(x)&&!/^[▲▼]\s*(Tambah|Kurang)$/i.test(x));
  if(a.length>3&&/^\d+ Nov|^\d+ \w{3} /.test(a[1])&&/^[+−-]\s?Rp/.test(a[2]))a=[a[0],'net asing 5 hari '+a[2]].concat(a.slice(4));   /* Arus Asing: ringkas */
  return a.join(' · ');
}
/* ---- penjelasan gambar: kalimat sederhana yang dirakit dari angka di papan (tanpa ajakan beli/jual) ---- */
const cardBy=(d,re)=>d.cards.find(c=>re.test(c.l||''));
const cj=c=>c?`${c.n} (${c.v})`:'';
const arr=r=>cleanRow(r).split(' · ');
function penjelasan(b,d,iso){
  const T=tglPanjang(iso),C=re=>cardBy(d,re),n=[];let cara='';
  if(b.key==='kg'){
    const a=C(/terkuat/i),z=C(/terlemah/i),k=C(/kapital/i),s=C(/asing/i);
    if(a&&z)n.push(`Pada ${T}, menurut perubahan harga 1 hari, grup paling kuat adalah ${cj(a)} dan paling lemah ${cj(z)}.`);
    if(k)n.push(`Grup dengan nilai pasar terbesar: ${cj(k)}.`);
    if(s)n.push(`Arus asing masuk terbesar ke grup ${cj(s)}.`);
    cara='Gambar 1: grup dan tokoh unggulan hari itu. Gambar 2: peringkat grup menurut kenaikan harga 1 hari; kolom paling kanan = arus asing (net beli atau net jual) dalam rupiah. Wajah bulat adalah ilustrasi AI, bukan foto resmi.';
  }else if(b.key==='asing'){
    const nb=C(/net beli/i),nj=C(/net jual/i),bb=C(/beli beruntun/i),jb=C(/jual beruntun/i);
    if(nb&&nj)n.push(`Dalam 5 hari bursa terakhir sampai ${T}, investor asing paling banyak membeli ${cj(nb)} dan paling banyak menjual ${cj(nj)}.`);
    if(bb&&jb)n.push(`${bb.n} dibeli asing ${bb.v} berturut-turut, sedangkan ${jb.n} dijual asing ${jb.v} berturut-turut.`);
    cara='Gambar 1: empat sorotan arus asing. Gambar 2: saham dengan net beli asing terbesar; bar hijau = besar net beli, label "Harga" = perubahan harga saham pada periode yang sama. Net asing dihitung dari lembar net × harga penutupan (estimasi).';
  }else if(b.key==='sektor'){
    const ai=C(/masuk/i),ao=C(/keluar/i),hk=C(/harga terkuat/i),hl=C(/harga terlemah/i);
    if(ai&&ao)n.push(`Dalam 5 hari bursa terakhir sampai ${T}, arus asing paling banyak masuk ke sektor ${cj(ai)} dan paling banyak keluar dari sektor ${cj(ao)}.`);
    if(hk&&hl)n.push(`Harga sektor terkuat 5 hari: ${cj(hk)}; terlemah: ${cj(hl)}.`);
    cara='Gambar 1: sorotan sektor. Gambar 2: peringkat sektor menurut arus asing; angka di kanan = net asing 5 hari dan perubahan harga rata-rata sektor. Bukan indeks sektor resmi.';
  }else if(b.key==='lonjakan'){
    const ls=C(/lonjakan/i),tb=C(/transaksi terbesar/i),nt=C(/naik/i),td=C(/turun/i);
    if(ls)n.push(`Pada ${T}, lonjakan transaksi terbesar terjadi di ${ls.n}: ${ls.v} dari rata-rata transaksi hariannya.`);
    const t2=[tb&&`nilai transaksi terbesar ${cj(tb)}`,nt&&`naik tertinggi ${cj(nt)}`,td&&`turun terdalam ${cj(td)}`].filter(Boolean);
    if(t2.length){const x=t2.join(', ');n.push(x[0].toUpperCase()+x.slice(1)+'.');}
    cara='Gambar 1: empat sorotan. Gambar 2: saham dengan transaksi paling jauh di atas rata-rata 19 hari terakhir; "4,8×" artinya 4,8 kali rata-rata. Lonjakan transaksi belum tentu berarti harga akan naik.';
  }else if(b.key==='ti'){
    const sesi=((d.sub.match(/Sesi\s+([^·]+?)\s*(?:·|$)/i)||[])[1]||'').trim();
    const tipe={BUY:'BUY',WEAKNESS:'BUY ON WEAKNESS',SPEC:'SPECULATIVE'};
    const g={};d.rows.forEach(r=>{const tg=r.find(x=>/^(BUY|WEAKNESS|SPEC)$/.test(x));const kd=r.find(x=>/^[A-Z]{4}$/.test(x)&&!/^(BUY|SPEC)$/.test(x));if(tg&&kd)(g[tg]=g[tg]||[]).push(kd);});
    const bag=Object.keys(g).map(k=>`${tipe[k]}: ${g[k].join(', ')}`);
    n.push(`Berdasarkan data penutupan ${tglPanjang(iso)}${sesi?', ide trading untuk sesi '+sesi:''} dihitung otomatis oleh model JOY.`);
    if(bag.length)n.push(`Saham yang masuk daftar hari ini: ${bag.join('; ')}.`);
    cara='Setiap kartu memuat kategori ide (BUY, BUY ON WEAKNESS, atau SPECULATIVE), kode saham, potensi kenaikan menuju target, dan area beli. Target dan batas rugi lengkap ada di website. Ini hasil hitungan model dari data penutupan, bukan ajakan membeli atau menjual; keputusan dan risiko ada pada Anda.';
  }else if(b.key==='inv'){
    const top=d.rows.slice(0,3).map(r=>{const a=r.slice();while(a.length>1&&/^\d{1,2}$/.test(a[0]))a.shift();const pos=a.find(x=>/^Posisi/i.test(x));return `${a[0]}${pos?' ('+pos.replace(/^Posisi\s*/i,'posisi ')+')':''}`;});
    if(top.length)n.push(`Per ${tglPendek(iso)} (data KSEI akhir bulan), investor atau institusi dengan posisi terbesar: ${top.map((x,i)=>`${i+1}) ${x}`).join(', ')}.`);
    const h=(d.rows[0]||[]).filter(x=>/^[A-Z]{4}\s+\d/.test(x));
    if(h.length)n.push(`Contoh: ${(d.rows[0].find(x=>!/^\d{1,2}$/.test(x))||'')} memegang ${h.join(', ')}.`);
    cara='Posisi = nilai seluruh saham yang dipegang (pemegang ≥1% di data KSEI). Angka kecil di bawah nama = tiga saham terbesar yang dipegang beserta persentase kepemilikannya.';
  }else if(b.key==='mv'){
    const top=d.rows.slice(0,3).map(r=>{const a=arr(r);return `${a[0]}: ${a[1]}, ${a.slice(2).join(', ').replace(/^\w/,x=>x.toLowerCase())}`;});
    if(top.length)n.push(`Perubahan kepemilikan ≥5% terbaru yang tercatat, antara lain ${top.join('; ')}.`);
    cara='Ini perubahan posisi pemegang saham ≥5% dalam laporan kepemilikan, belum tentu jual-beli di bursa. Nama sekuritas bisa berarti rekening gabungan nasabah.';
  }
  if(!n.length&&d.cards.length)n.push(`Sorotan ${b.judul} per ${T}: `+d.cards.map(c=>[sc(c.l),c.n,c.v].filter(Boolean).join(' ')).join('; ')+'.');
  return {narasi:n.join(' '),cara};
}
function caption(b,d,iso){
  const p=penjelasan(b,d,iso),L=[`${b.em} ${b.judul} · ${tglPanjang(iso)}`,''];
  L.push(p.narasi||b.intro,'');
  if(p.cara)L.push('Cara membaca gambar: '+p.cara,'');
  if(b.list!==false){
    const TP={BUY:'BUY',WEAKNESS:'BUY ON WEAKNESS',SPEC:'SPECULATIVE'};
    const top=d.rows.slice(0,b.listN||3).map(r=>{
      if(b.key==='ti'){const tg=r.find(x=>/^(BUY|WEAKNESS|SPEC)$/.test(x)),kd=r.find(x=>/^[A-Z]{4}$/.test(x)&&!/^(BUY|SPEC)$/.test(x)),up=r.find(x=>/^▲/.test(x)),bl=r.find(x=>/^Beli/i.test(x));
        if(tg&&kd)return `${kd} (${TP[tg]})${bl?' · area '+bl.replace(/^Beli\s*/i,'beli '):''}${up?' · potensi '+up.replace(/^▲\s*/,'+')+' ke target':''}`;}
      return cleanRow(r);});
    if(top.length){L.push((b.listHead?b.listHead:d.secHead?sc(d.secHead.replace(/\s*·\s*\d{1,2}\s+\w+$/,'')):(d.selTab?'Peringkat "'+d.selTab+'"':'Peringkat teratas'))+':');top.forEach((r,i)=>L.push(`${i+1}. ${r}`));L.push('');}
  }
  L.push('Daftar lengkap, target, dan detail tiap saham ada di website JOY. Link ada di komentar pertama 👇','',b.tag,'',`Sumber: ${b.sumber}. Data per ${tglPendek(iso)}. Data dan edukasi, bukan ajakan membeli atau menjual.`);
  return L.join('\n');
}
const utm=(b,iso)=>`${BASE}?utm_source=facebook&utm_medium=social&utm_campaign=papan-${b.key}&utm_content=analisasahamjoy_${b.key}_${iso}${b.hash||''}`;
const firstComment=(b,iso)=>`Papan ${b.judul} lengkap (data per ${tglPendek(iso)}), plus detail tiap saham: ${utm(b,iso)}\n\nData dan edukasi, bukan ajakan membeli atau menjual.`;
const alt=(b,d,iso)=>{
  const h=`Papan ${b.judul}${/JOY/.test(b.judul)?'':' JOY'}, data per ${tglPendek(iso)}.`,out={};
  const sor=d.cards.length?h+' Kartu sorotan: '+d.cards.map(c=>[sc(c.l),c.n,c.v].filter(Boolean).join(' ')).join('; ')+'.':'';
  const dft=h+(d.rows.length?' Peringkat teratas: '+d.rows.slice(0,3).map(cleanRow).join('; ')+'.':'');
  return {sorotan:sor,daftar:dft};
};

(async()=>{
  const a=process.argv.slice(2),FORCE=a.includes('--force'),MARK=a.includes('--mark');
  const oi=a.indexOf('--only'),only=oi>=0?a[oi+1].split(','):null;
  const todo=BOARDS.filter(b=>!only||only.includes(b.key));
  const state=readState(),browser=await chromium.launch();
  const brandBuf=await (async()=>{for(const s of SITES){try{const r=await fetch(s.replace(/\/?$/,'/')+'joy-logo.png',{headers:{'user-agent':UA}});if(r.ok)return Buffer.from(await r.arrayBuffer());}catch(e){}}return null;})();
  const brand=brandBuf?'data:image/png;base64,'+brandBuf.toString('base64'):'';
  const s=await openSite(browser);
  if(!s){console.error('[JOY] website tidak bisa dibuka dari semua alamat');await browser.close();process.exit(2);}
  fs.mkdirSync(OUT,{recursive:true});
  const index=[],today=Date.now();
  for(const b of todo){
    try{
      await pick(s.p,b);await prep(s.p,b);
      const d=await extract(s.p,b),dates=parseDates(d.asof);
      if(!dates.length){console.log('lewati',b.key,'(tanggal data tidak terbaca: "'+d.asof+'")');continue;}
      const iso=b.dateRule==='first'?dates[0]:b.dateRule==='min'?dates.sort()[0]:dates.sort().pop();
      const umur=Math.round((today-Date.parse(iso+'T00:00:00+07:00'))/864e5);
      if(umur>(b.maxAge||MAXAGE)&&!FORCE){console.log('lewati',b.key,'(data per',iso,'sudah basi,',umur,'hari)');continue;}
      if(state[b.key]&&state[b.key]>=iso&&!FORCE){console.log('lewati',b.key,'(data per',iso,'sudah pernah dibuat)');continue;}
      const dir=path.join(OUT,`${iso}_${b.key}`);fs.mkdirSync(dir,{recursive:true});
      const panels=[];
      if(d.cards.length)panels.push(['sorotan',await shoot(s.p,'sorotan',b.card)]);
      panels.push(['daftar',await shoot(s.p,'daftar',b.card)]);
      const files=[];
      for(let i=0;i<panels.length;i++){const f=`slide${i+1}_${panels[i][0]}.png`;await frame(browser,brand,panels[i][1].buf,iso,i+1,panels.length,path.join(dir,f));files.push(f);}
      fs.writeFileSync(path.join(dir,'caption.txt'),caption(b,d,iso));
      fs.writeFileSync(path.join(dir,'komentar_pertama.txt'),firstComment(b,iso));
      {const A=alt(b,d,iso),m={};files.forEach(f=>{m[f]=(/sorotan/.test(f)?A.sorotan:A.daftar).slice(0,900);});fs.writeFileSync(path.join(dir,'alt_text.json'),JSON.stringify(m,null,1));fs.writeFileSync(path.join(dir,'alt_text.txt'),Object.values(m).join('\n\n'));}
      fs.writeFileSync(path.join(dir,'data.json'),JSON.stringify({board:b.key,judul:b.judul,iso,asof:d.asof,site:s.site,...d},null,1));
      index.push({key:b.key,judul:b.judul,iso,dir,files});
      console.log('ok',b.key,iso,files.length+' gambar',panels.map(x=>x[1].h+'px').join('/'));
      /* kembalikan tampilan supaya papan berikutnya bersih */
      await s.p.evaluate(()=>document.querySelectorAll('.pp-hide').forEach(e=>e.classList.remove('pp-hide')));
    }catch(e){console.error('[JOY] papan '+b.key+' gagal: '+e.message.split('\n')[0]);}
  }
  await browser.close();
  if(index.length){
    fs.writeFileSync(path.join(OUT,'indeks.json'),JSON.stringify(index,null,1));
    const md=['# Paket papan Facebook ('+new Date().toISOString().slice(0,10)+')','','Cara pakai: unggah semua gambar sebagai satu postingan album, tempel caption, lalu tempel komentar pertama (berisi link) segera setelah tayang.',''];
    for(const i of index){const r=f=>fs.readFileSync(path.join(i.dir,f),'utf8');
      md.push('## '+i.judul+' (data per '+i.iso+')','','Gambar: '+i.files.map(f=>'`'+path.basename(i.dir)+'/'+f+'`').join(', '),'','**Caption**','','```',r('caption.txt'),'```','','**Komentar pertama**','','```',r('komentar_pertama.txt'),'```','');}
    fs.writeFileSync(path.join(OUT,'ringkasan-papan.md'),md.join('\n'));
  }
  if(MARK&&index.length){const st=readState();index.forEach(i=>{st[i.key]=i.iso;});fs.mkdirSync(path.dirname(STATE),{recursive:true});fs.writeFileSync(STATE,JSON.stringify(st,null,1));}
  if(a.includes('--antri')&&index.length){
    let q=[];try{q=JSON.parse(fs.readFileSync(ANTRIAN,'utf8'));}catch(e){}
    index.forEach(i=>{const id=path.basename(i.dir);if(!q.some(x=>x.id===id))q.push({id,key:i.key,judul:i.judul,iso:i.iso,dir:path.relative(process.cwd(),i.dir),files:i.files,status:'baru',dibuat:new Date().toISOString()});});
    fs.mkdirSync(path.dirname(ANTRIAN),{recursive:true});fs.writeFileSync(ANTRIAN,JSON.stringify(q,null,1));
  }
  console.log('selesai:',index.length,'papan dibuat');
})();
