/* Penayang Facebook: mengambil SATU kiriman tertua dari daftar tunggu (antrian-papan.json) lalu menayangkannya ke Halaman Facebook
   lewat Graph API: unggah gambar (belum tayang) -> buat kiriman album + caption -> tulis komentar pertama (link).
   Dijalankan tiap 30 menit oleh GitHub Actions, jadi jarak antar kiriman otomatis terjaga dan tidak menumpuk.
   Butuh dua rahasia di GitHub (Settings > Secrets and variables > Actions): FB_PAGE_ID dan FB_PAGE_TOKEN. Token tidak pernah ditulis di kode.
   Pakai:  node fbpost.js          (tayang sungguhan bila token ada)
           node fbpost.js --uji    (hanya menampilkan apa yang akan dikirim, tanpa menayangkan) */
const fs=require('fs'),path=require('path');
const ANTRIAN=process.env.ANTRIAN||'antrian-papan.json';
const PAGE=process.env.FB_PAGE_ID||'',TOKEN=process.env.FB_PAGE_TOKEN||'';
const VER=process.env.FB_API_VERSION||'v21.0';
const GAP=+process.env.JEDA_MENIT||25;             /* jarak minimal antar kiriman */
const MAXDAY=+process.env.MAKS_PER_HARI||12;       /* batas kiriman per hari */
const MAXAGE=+process.env.MAX_UMUR_HARI||4;        /* kiriman lebih tua dari ini dibuang dari antrean */
const JAM=(process.env.JAM_TAYANG||'7-22').split('-').map(Number);   /* hanya tayang pada jam WIB ini */
const UJI=process.argv.includes('--uji');
const G=`https://graph.facebook.com/${VER}`;

const wib=d=>new Date(d.getTime()+7*3600e3);
const load=()=>{try{return JSON.parse(fs.readFileSync(ANTRIAN,'utf8'));}catch(e){return [];}};
const save=q=>fs.writeFileSync(ANTRIAN,JSON.stringify(q,null,1));

async function api(pathname,body,isForm){
  const r=await fetch(G+pathname,{method:'POST',body:isForm?body:new URLSearchParams(body)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok||j.error){const e=j.error||{};throw new Error(`Facebook menolak (${r.status}) ${pathname}: ${e.message||'tanpa pesan'} [kode ${e.code||'-'}${e.error_subcode?'/'+e.error_subcode:''}]`);}
  return j;
}
async function tayang(item){
  const cap=fs.readFileSync(path.join(item.dir,'caption.txt'),'utf8');
  const kom=fs.readFileSync(path.join(item.dir,'komentar_pertama.txt'),'utf8');
  let alts={};try{alts=JSON.parse(fs.readFileSync(path.join(item.dir,'alt_text.json'),'utf8'));}catch(e){}
  if(UJI){console.log('--- UJI (tidak dikirim) ---\nHalaman:',PAGE||'(belum diisi)','\nGambar:',item.files.join(', '),'\nCaption:\n'+cap,'\nKomentar pertama:\n'+kom);return {id:'uji'};}
  const ids=[];
  for(const f of item.files){
    const fd=new FormData();
    fd.append('source',new Blob([fs.readFileSync(path.join(item.dir,f))],{type:'image/png'}),f);
    fd.append('published','false');fd.append('temporary','false');if(alts[f])fd.append('alt_text_custom',alts[f].slice(0,900));
    fd.append('access_token',TOKEN);
    const r=await api(`/${PAGE}/photos`,fd,true);ids.push(r.id);
  }
  const body={message:cap,access_token:TOKEN};
  ids.forEach((id,i)=>{body[`attached_media[${i}]`]=JSON.stringify({media_fbid:id});});
  const post=await api(`/${PAGE}/feed`,body);
  let komOk=true;
  try{await api(`/${post.id}/comments`,{message:kom,access_token:TOKEN});}catch(e){komOk=false;console.error('[JOY] kiriman tayang, tetapi komentar pertama gagal: '+e.message);}
  return {id:post.id,komOk};
}
(async()=>{
  const q=load(),now=new Date();
  /* buang yang sudah basi */
  q.forEach(x=>{if(x.status==='baru'&&(now-Date.parse(x.iso+'T00:00:00+07:00'))/864e5>MAXAGE){x.status='kedaluwarsa';}});
  const baru=q.filter(x=>x.status==='baru');
  if(!baru.length){console.log('antrean kosong, tidak ada yang ditayangkan');save(q);return;}
  if(!PAGE||!TOKEN){if(!UJI){console.log('FB_PAGE_ID / FB_PAGE_TOKEN belum dipasang: '+baru.length+' kiriman menunggu di antrean (belum tayang)');return;}}
  const h=wib(now).getUTCHours();
  if(!UJI&&(h<JAM[0]||h>=JAM[1])){console.log('di luar jam tayang ('+JAM.join('-')+' WIB), ditunda');return;}
  const tdy=wib(now).toISOString().slice(0,10),done=q.filter(x=>x.status==='tayang');
  if(!UJI&&done.filter(x=>x.tayangAt&&wib(new Date(x.tayangAt)).toISOString().slice(0,10)===tdy).length>=MAXDAY){console.log('batas harian tercapai');return;}
  const last=done.map(x=>Date.parse(x.tayangAt||0)).sort().pop()||0;
  if(!UJI&&now-last<GAP*60e3){console.log('jeda antar kiriman belum cukup ('+Math.round((now-last)/6e4)+' menit), tunggu giliran berikutnya');return;}
  const item=baru[0];
  console.log('menayangkan:',item.id);
  try{
    const r=await tayang(item);
    if(!UJI){item.status='tayang';item.tayangAt=now.toISOString();item.fbId=r.id;item.komentar=r.komOk;save(q);}
    console.log('berhasil:',r.id);
  }catch(e){
    console.error('[JOY] gagal menayangkan '+item.id+': '+e.message);
    item.gagal=(item.gagal||0)+1;item.galatTerakhir=e.message.slice(0,300);
    if(item.gagal>=3)item.status='gagal';
    save(q);process.exitCode=1;
  }
})();
