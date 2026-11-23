/* Penayang Facebook untuk Halaman Jelas Berita dan Monas (dan Halaman lain di halaman.json).
   Membaca antrian-halaman.json, menayangkan kiriman yang sudah jatuh tempo (maksimal satu per Halaman tiap dijalankan),
   lalu menulis komentar pertama berisi tautan ke saham.ijoy.co.id. Dijalankan tiap 30 menit oleh GitHub Actions.
   Rahasia di GitHub: FB_PAGES = JSON {"ID_HALAMAN":"KUNCI_HALAMAN", ...}. Kunci tidak pernah ditulis di kode.
   Pakai:  node tayang.js          (tayang sungguhan)
           node tayang.js --uji    (hanya menampilkan yang akan tayang) */
const fs = require('fs');
const CFG = JSON.parse(fs.readFileSync(require('path').join(__dirname, 'halaman.json'), 'utf8'));
const QFILE = process.env.ANTRIAN_HALAMAN || 'antrian-halaman.json';
const VER = process.env.FB_API_VERSION || 'v27.0';
const JEDA = +process.env.JEDA_MENIT || 20;              /* jarak minimal antar kiriman pada Halaman yang sama */
const BASI = +process.env.BASI_JAM || 6;                 /* kiriman yang terlambat lebih dari ini tidak ditayangkan lagi */
const JAM = (process.env.JAM_TAYANG || '7-22').split('-').map(Number);
const UJI = process.argv.includes('--uji');
let PAGES = {}; try { PAGES = JSON.parse(process.env.FB_PAGES || '{}'); } catch (e) { console.error('[JOY] FB_PAGES bukan JSON yang valid'); }
const G = `https://graph.facebook.com/${VER}`;
const wib = d => new Date(d.getTime() + 7 * 3600e3);
const load = () => { try { return JSON.parse(fs.readFileSync(QFILE, 'utf8')); } catch (e) { return []; } };
const save = q => fs.writeFileSync(QFILE, JSON.stringify(q, null, 1));

async function api(p, body, isForm) {
  const r = await fetch(G + p, { method: 'POST', body: isForm ? body : new URLSearchParams(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) { const e = j.error || {}; const err = new Error(`Facebook menolak (${r.status}) ${p.replace(/\/\d+/, '/ID')}: ${e.message || 'tanpa pesan'} [kode ${e.code || '-'}${e.error_subcode ? '/' + e.error_subcode : ''}]`); err.kode = e.code; throw err; }
  return j;
}
async function tayang(item, h, token) {
  const ids = [];
  const fd = new FormData();
  fd.append('source', new Blob([fs.readFileSync(item.berkas)], { type: 'image/jpeg' }), require('path').basename(item.berkas));
  fd.append('published', 'false'); fd.append('temporary', 'false'); if (item.alt) fd.append('alt_text_custom', item.alt.slice(0, 900)); fd.append('access_token', token);
  const f = await api(`/${h.id}/photos`, fd, true); ids.push(f.id);
  const body = { message: item.caption, access_token: token };
  ids.forEach((id, i) => { body[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id }); });
  const post = await api(`/${h.id}/feed`, body);
  return post.id;
}
async function komentar(item, token) { await api(`/${item.fbId}/comments`, { message: item.komentar, access_token: token }); }

(async () => {
  const q = load(), now = new Date(), jam = wib(now).getUTCHours();
  let galatFatal = false;
  /* kiriman terlambat dibuang: isinya "hari ini" dan jadi basi */
  q.forEach(x => { if (x.status === 'baru' && (now - Date.parse(x.jadwal)) / 36e5 > BASI) { x.status = 'terlewat'; } });
  for (const h of CFG.halaman) {
    const token = PAGES[h.id];
    const milik = q.filter(x => x.halaman === h.kunci);
    /* coba ulang komentar yang tadi gagal */
    for (const x of milik.filter(x => x.status === 'tayang' && x.komentar_ok === false && (x.gagalKomentar || 0) < 3)) {
      if (UJI || !token) break;
      try { await komentar(x, token); x.komentar_ok = true; console.log(`[${h.nama}] komentar susulan terkirim: ${x.id}`); } catch (e) { x.gagalKomentar = (x.gagalKomentar || 0) + 1; console.error(`[${h.nama}] komentar susulan gagal ${x.id}: ${e.message}`); }
    }
    const baru = milik.filter(x => x.status === 'baru' && Date.parse(x.jadwal) <= now.getTime()).sort((a, b) => Date.parse(a.jadwal) - Date.parse(b.jadwal));
    if (!baru.length) { console.log(`[${h.nama}] tidak ada kiriman yang jatuh tempo (${milik.filter(x => x.status === 'baru').length} menunggu jam tayang)`); continue; }
    if (!token && !UJI) { console.log(`[${h.nama}] kunci Halaman belum ada di FB_PAGES, ${baru.length} kiriman menunggu`); continue; }
    if (!UJI && (jam < JAM[0] || jam >= JAM[1])) { console.log(`[${h.nama}] di luar jam tayang ${JAM.join('-')} WIB, ditunda`); continue; }
    const terakhir = milik.filter(x => x.status === 'tayang').map(x => Date.parse(x.tayangAt || 0)).sort().pop() || 0;
    if (!UJI && now - terakhir < JEDA * 60e3) { console.log(`[${h.nama}] jeda belum cukup (${Math.round((now - terakhir) / 6e4)} menit)`); continue; }
    const item = baru[0];
    if (UJI) { console.log(`--- UJI [${h.nama}] ${item.id}\n${item.caption}\n--- komentar:\n${item.komentar}`); continue; }
    if (!fs.existsSync(item.berkas)) { item.status = 'gagal'; item.galatTerakhir = 'berkas gambar tidak ada'; console.error(`[${h.nama}] gambar tidak ada: ${item.berkas}`); process.exitCode = 1; continue; }
    console.log(`[${h.nama}] menayangkan ${item.id} (${item.jenis}); ${baru.length - 1} lagi jatuh tempo`);
    try {
      item.fbId = await tayang(item, h, token); item.status = 'tayang'; item.tayangAt = now.toISOString(); save(q);
      try { await komentar(item, token); item.komentar_ok = true; } catch (e) { item.komentar_ok = false; console.error(`[${h.nama}] kiriman tayang, komentar pertama gagal: ${e.message}`); }
      console.log(`[${h.nama}] berhasil: ${item.fbId}`);
    } catch (e) {
      console.error(`[${h.nama}] gagal menayangkan ${item.id}: ${e.message}`);
      item.gagal = (item.gagal || 0) + 1; item.galatTerakhir = e.message.slice(0, 300); if (item.gagal >= 3) item.status = 'gagal';
      process.exitCode = 1; if (e.kode === 190) galatFatal = true;
    }
    if (galatFatal) break;
  }
  save(q);
  if (galatFatal) console.error('[JOY] kunci Halaman ditolak (kode 190). Kunci perlu dibuat ulang.');
})().catch(e => { console.error('[JOY] gagal: ' + (e.stack || e.message)); process.exit(1); });
