/* Pembuat antrean harian untuk Halaman Facebook selain Bursa Saham Indonesia (Jelas Berita, Monas).
   Setiap hari membuat kiriman (caption + gambar kartu + komentar pertama) dan menaruhnya di antrian-halaman.json
   dengan jam tayang yang tersebar. Penayangan dilakukan tayang.js.
   Jenis isi tahap 1: edukasi (dari artikel Academy JOY) dan ringkasan pasar (dari data harian website JOY).
   Aturan: tiap kiriman wajib punya angka, tanggal, sumber, dan batasan; kiriman kembar (14 hari) dan data basi tidak dibuat.
   Pakai:  node buat.js                      (buat antrean hari ini)
           node buat.js --uji                (hanya tampilkan caption, tanpa gambar dan tanpa menulis antrean)
           node buat.js --tgl=2026-11-24     (tanggal lain)   --data=FOLDER (pakai data lokal)   --ulang (buat ulang kiriman hari ini yang belum tayang) */
const fs = require('fs'), path = require('path');
const A = process.argv.slice(2), arg = (k, d) => { const m = A.find(x => x.startsWith('--' + k + '=')); return m ? m.slice(k.length + 3) : d; };
const UJI = A.includes('--uji'), ULANG = A.includes('--ulang');
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'halaman.json'), 'utf8'));
const SITE = (process.env.SITE || CFG.situs).replace(/\/$/, '');
const DATA = arg('data', process.env.DATA_DIR || '');
const QFILE = process.env.ANTRIAN_HALAMAN || 'antrian-halaman.json';
const SFILE = process.env.STATUS_HALAMAN || 'status-halaman.json';
const OUT = process.env.OUT_HALAMAN || 'halaman';

/* ---------- format ---------- */
const wib = d => new Date(d.getTime() + 7 * 3600e3);
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BLN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const tgl = iso => { const d = new Date(iso + 'T00:00:00Z'); return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BLN[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const tglP = iso => { const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCDate()} ${BLN[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`; };
const tglPanjang = iso => { const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCDate()} ${BLN[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
const n = (x, d = 0) => x.toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = p => (p > 0.0499 ? '+' : p < -0.0499 ? '−' : '') + n(Math.abs(p), 1) + '%';
const rp = x => 'Rp' + n(x);
const besar = x => { const a = Math.abs(x), s = x < 0 ? '−' : ''; return a >= 1e12 ? `${s}Rp${n(a / 1e12, 2)} T` : a >= 1e9 ? `${s}Rp${n(a / 1e9, a >= 1e11 ? 0 : 1)} M` : `${s}Rp${n(a / 1e6, 0)} jt`; };
const dayDiff = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5);
const tambahHari = (iso, k) => new Date(Date.parse(iso + 'T00:00:00Z') + k * 864e5).toISOString().slice(0, 10);
const SEKTOR = { IDXENERGY: 'Energi', IDXBASIC: 'Bahan Baku', IDXINDUST: 'Perindustrian', IDXNONCYC: 'Konsumer Primer', IDXCYCLIC: 'Konsumer Non-Primer', IDXHEALTH: 'Kesehatan', IDXFINANCE: 'Keuangan', IDXPROPERT: 'Properti', IDXTECHNO: 'Teknologi', IDXINFRA: 'Infrastruktur', IDXTRANS: 'Transportasi dan Logistik' };

const utm = (campaign, content, query = '', hash = '') => `${SITE}/${query ? '?' + query + '&' : '?'}utm_source=facebook&utm_medium=social&utm_campaign=${campaign}&utm_content=${content}${hash}`;
const load = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const muat = async nama => {
  if (DATA) return JSON.parse(fs.readFileSync(path.join(DATA, nama), 'utf8'));
  const r = await fetch(`${SITE}/${nama}`, { headers: { 'user-agent': 'joy-konten/1.0' } });
  if (!r.ok) throw new Error(`gagal mengambil ${nama}: ${r.status}`);
  return r.json();
};
const DISC = 'Data dan edukasi, bukan ajakan membeli atau menjual.';

/* ---------- ringkasan pasar dari data harian JOY ---------- */
const hsh = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rpM = v => { const a = Math.abs(v); return a >= 1000 ? 'Rp' + n(a / 1000, 1) + ' T' : 'Rp' + n(a, 0) + ' M'; };
const fundamen = (s, close) => {
  if (!s || !(s.price > 0) || !(close > 0)) return {};
  const f = close / s.price, ok = v => typeof v === 'number' && isFinite(v), o = {};
  if (ok(s.per) && s.per > 0.5 && ok(s.eps) && s.eps > 0) o.per = s.per * f;
  if (ok(s.pbv) && s.pbv > 0.05) o.pbv = s.pbv * f;
  if (ok(s.roe) && s.roe > 0 && s.roe < 1.5 && ok(s.equity) && s.equity > 0) o.roe = s.roe;
  if (ok(s.netProfit) && s.netProfit > 0) o.laba = s.netProfit;
  if (ok(s.marketCap) && s.marketCap > 0) o.mc = s.marketCap * f;
  return o;
};
function olahPasar(D, S) {
  const iso = D.dates[D.dates.length - 1];
  const sek = {}, nama = {}, fund = {};
  (S.stocks || []).forEach(s => { sek[s.code] = s.sector; nama[s.code] = (s.name || s.code).replace(/\s+Tbk\.?$/i, '').trim(); fund[s.code] = s; });
  const R = [];
  for (const [kode, rows] of Object.entries(D.byCode)) {
    const r = rows[rows.length - 1];
    if (!r || r.date !== iso || !(r.previous > 0)) continue;
    const hist = rows.slice(0, -1).slice(-20);
    const rata = hist.length >= 5 ? hist.reduce((a, x) => a + x.value, 0) / hist.length : 0;
    let streak = 0; for (let i = rows.length - 1; i >= 0 && rows[i].foreignNet > 0; i--) streak++;
    R.push({ kode, nama: nama[kode] || kode, sektor: sek[kode] || '', close: r.close, pct: r.change / r.previous * 100, value: r.value, vol: r.volume, asing: r.foreignNet * r.close, rata, rasio: rata > 0 ? r.value / rata : 0, streak, ...fundamen(fund[kode], r.close) });
  }
  return { iso, R, asOf: S.asOf || '', periode: String(S.period || '').split('/')[0].trim() };
}
function varianPasar(P) {
  const L = CFG.bataslikuid, { R, iso } = P;
  const aktif = R.filter(x => x.vol > 0), likuid = R.filter(x => x.value >= L && x.close >= 50);
  const top = (arr, f, k = 5) => arr.slice().sort((a, b) => f(b) - f(a)).slice(0, k);
  const baris = (arr, ekstra) => arr.map(x => ({ k: x.kode, n: x.nama, v: ekstra(x)[0], s: ekstra(x)[1] }));
  const teksBaris = (arr, ekstra) => arr.map((x, i) => `${i + 1}. ${x.kode} ${x.nama} · ${ekstra(x)[2]}`).join('\n');
  const V = [];
  /* 1. gambaran umum */
  {
    const naik = aktif.filter(x => x.pct > 0).length, turun = aktif.filter(x => x.pct < 0).length, tetap = aktif.length - naik - turun;
    const nilai = aktif.reduce((a, x) => a + x.value, 0), asing = aktif.reduce((a, x) => a + x.asing, 0);
    if (aktif.length > 300) V.push({
      id: 'gambaran', judul: 'Gambaran Pasar Hari Ini', emoji: '📊', tagar: '#SahamIndonesia #BEI #PasarModal',
      intro: `Dari ${n(aktif.length)} saham yang diperdagangkan pada penutupan ${tgl(iso)}: ${n(naik)} naik, ${n(turun)} turun, ${n(tetap)} tidak berubah. Total nilai transaksi ${besar(nilai)}. Asing ${asing >= 0 ? 'net beli' : 'net jual'} ${besar(Math.abs(asing))} (estimasi).`,
      daftar: [], rows: [{ k: n(naik), n: 'saham naik', v: '', s: '' }, { k: n(turun), n: 'saham turun', v: '', s: '' }, { k: n(tetap), n: 'tidak berubah', v: '', s: '' }, { k: besar(nilai), n: 'total nilai transaksi', v: '', s: '' }, { k: besar(Math.abs(asing)), n: asing >= 0 ? 'net beli asing (estimasi)' : 'net jual asing (estimasi)', v: '', s: '' }],
      artinya: 'jumlah saham naik dan turun menunjukkan seberapa luas pergerakan pasar. Indeks bisa naik walau lebih banyak saham turun, bila saham besar yang naik. Net asing dihitung dari lembar net × harga penutupan, sehingga hanya perkiraan.', kode: ''
    });
  }
  const mk = (id, judul, emoji, tagar, intro, arr, ekstra, artinya, minimal = 3) => {
    if (arr.length < minimal) return;
    V.push({ id, judul, emoji, tagar, intro, daftar: teksBaris(arr, ekstra), rows: baris(arr, ekstra), artinya, kode: arr[0].kode });
  };
  const note = `Hanya saham dengan nilai transaksi minimal ${besar(L)} yang dihitung, supaya bukan saham yang nyaris tidak diperdagangkan.`;
  /* 2. paling aktif */
  { const a = top(aktif, x => x.value); mk('aktif', 'Saham Paling Aktif', '🔥', '#SahamAktif #SahamIndonesia #BEI',
    `Lima saham dengan nilai transaksi terbesar pada penutupan ${tgl(iso)}:`, a, x => [pct(x.pct), `${rp(x.close)} · nilai ${besar(x.value)}`, `${rp(x.close)} (${pct(x.pct)}) · nilai transaksi ${besar(x.value)}`],
    'nilai transaksi menunjukkan seberapa ramai sebuah saham diperdagangkan. Ramai belum tentu diikuti kenaikan harga, karena transaksi besar terjadi juga saat saham dijual.'); }
  /* 3-4. naik dan turun */
  { const a = top(likuid, x => x.pct); mk('naik', 'Saham Naik Terbesar', '📈', '#SahamNaik #SahamIndonesia #BEI',
    `Lima saham dengan kenaikan harga terbesar pada penutupan ${tgl(iso)}. ${note}`, a.filter(x => x.pct > 0), x => [pct(x.pct), `${rp(x.close)} · nilai ${besar(x.value)}`, `${rp(x.close)} (${pct(x.pct)}) · nilai transaksi ${besar(x.value)}`],
    'naik tajam dalam sehari belum tentu berlanjut. Cek dulu apa penyebabnya, misalnya kabar perusahaan atau aksi korporasi.'); }
  { const a = top(likuid, x => -x.pct); mk('turun', 'Saham Turun Terbesar', '📉', '#SahamTurun #SahamIndonesia #BEI',
    `Lima saham dengan penurunan harga terbesar pada penutupan ${tgl(iso)}. ${note}`, a.filter(x => x.pct < 0), x => [pct(x.pct), `${rp(x.close)} · nilai ${besar(x.value)}`, `${rp(x.close)} (${pct(x.pct)}) · nilai transaksi ${besar(x.value)}`],
    'turun tajam dalam sehari belum tentu berlanjut, dan belum tentu menandakan masalah perusahaan. Cek dulu penyebabnya.'); }
  /* 5-6. asing */
  { const a = top(likuid, x => x.asing).filter(x => x.asing > 0); mk('asing-beli', 'Asing Paling Banyak Beli', '🌏', '#ArusAsing #NetBeliAsing #SahamIndonesia',
    `Saham dengan net beli asing terbesar pada ${tgl(iso)} (estimasi, nilai transaksi minimal ${besar(L)}):`, a, x => [besar(x.asing), `${rp(x.close)} (${pct(x.pct)})`, `net beli asing ${besar(x.asing)} · harga ${rp(x.close)} (${pct(x.pct)})`],
    'net asing = lembar net × harga penutupan, jadi hanya perkiraan. Arus asing satu hari belum menunjukkan tren. Lihat periode yang lebih panjang.'); }
  { const a = top(likuid, x => -x.asing).filter(x => x.asing < 0); mk('asing-jual', 'Asing Paling Banyak Jual', '🌏', '#ArusAsing #NetJualAsing #SahamIndonesia',
    `Saham dengan net jual asing terbesar pada ${tgl(iso)} (estimasi, nilai transaksi minimal ${besar(L)}):`, a, x => [besar(x.asing), `${rp(x.close)} (${pct(x.pct)})`, `net jual asing ${besar(Math.abs(x.asing))} · harga ${rp(x.close)} (${pct(x.pct)})`],
    'net asing = lembar net × harga penutupan, jadi hanya perkiraan. "Asing" adalah kategori rekening, dan bisa ikut penyeimbangan indeks, bukan semata kondisi perusahaan.'); }
  /* 7. sektor */
  {
    const g = {}; likuid.forEach(x => { if (!SEKTOR[x.sektor]) return; const o = g[x.sektor] || (g[x.sektor] = { w: 0, s: 0, nilai: 0, jml: 0 }); o.w += x.value; o.s += x.pct * x.value; o.nilai += x.value; o.jml++; });
    const arr = Object.entries(g).filter(([, o]) => o.jml >= 5).map(([k, o]) => ({ kode: SEKTOR[k], nama: `${o.jml} saham likuid`, pct: o.s / o.w, value: o.nilai })).sort((a, b) => b.pct - a.pct);
    if (arr.length >= 6) {
      const pilih = arr.slice(0, 3).concat(arr.slice(-3));
      V.push({ id: 'sektor', judul: 'Sektor Paling Kuat dan Paling Lemah', emoji: '🧭', tagar: '#RotasiSektor #SahamIndonesia #BEI', kode: '',
        intro: `Perubahan harga rata-rata per sektor pada penutupan ${tgl(iso)}, tiga sektor tertinggi dan tiga terendah:`,
        daftar: pilih.map((x, i) => `${i < 3 ? '▲' : '▼'} ${x.kode} · ${pct(x.pct)} · nilai transaksi ${besar(x.value)}`).join('\n'),
        rows: pilih.map(x => ({ k: x.kode, n: x.nama, v: pct(x.pct), s: `nilai ${besar(x.value)}` })),
        artinya: 'angka sektor dihitung JOY dari rata-rata perubahan harga saham likuid di sektor itu, ditimbang nilai transaksi. Ini ukuran JOY, bukan indeks sektoral resmi BEI.' });
    }
  }
  /* 8. lonjakan transaksi */
  { const a = top(likuid.filter(x => x.rata >= 5e9), x => x.rasio).filter(x => x.rasio >= 2); mk('lonjakan', 'Lonjakan Nilai Transaksi', '⚡', '#LonjakanTransaksi #SahamIndonesia #BEI',
    `Saham yang nilai transaksinya paling jauh di atas rata-rata 20 hari bursa sebelumnya, pada ${tgl(iso)}:`, a, x => [`${n(x.rasio, 1)}×`, `${rp(x.close)} (${pct(x.pct)}) · nilai ${besar(x.value)}`, `${n(x.rasio, 1)}× rata-rata · harga ${rp(x.close)} (${pct(x.pct)}) · nilai ${besar(x.value)}`],
    'lonjakan transaksi bisa karena berita, aksi korporasi, atau satu transaksi besar. Lonjakan sendiri belum menunjukkan arah harga.'); }
  /* 9. net beli asing beruntun */
  { const a = top(likuid.filter(x => x.rata >= 5e9 && x.streak >= 4), x => x.streak * 1e6 + x.value / 1e6); mk('beruntun', 'Dibeli Asing Berhari-hari', '🔁', '#ArusAsing #SahamIndonesia #BEI',
    `Saham yang dibeli bersih oleh asing paling banyak hari berturut-turut sampai ${tgl(iso)}:`, a, x => [`${x.streak} hari`, `${rp(x.close)} (${pct(x.pct)})`, `net beli asing ${x.streak} hari berturut-turut · harga ${rp(x.close)} (${pct(x.pct)})`],
    'net beli beruntun menunjukkan minat yang konsisten, tetapi "asing" hanya kategori rekening dan bisa mengikuti penyeimbangan indeks.', 3); }
  /* 10. peringkat per sektor dari data harian: paling aktif dan naik terbesar di tiap sektor */
  Object.keys(SEKTOR).forEach(sk => {
    const dalam = likuid.filter(x => x.sektor === sk), nm = SEKTOR[sk], tg = '#Saham' + nm.replace(/[^A-Za-z]/g, '') + ' #SahamIndonesia #BEI';
    if (dalam.length < 8) return;
    { const a = top(dalam, x => x.value); mk('aktif-' + sk, '5 Saham ' + nm + ' Paling Aktif', '🔥', tg,
      `Lima saham sektor ${nm} dengan nilai transaksi terbesar pada penutupan ${tgl(iso)}. ${note}`, a, x => [pct(x.pct), `${rp(x.close)} · nilai ${besar(x.value)}`, `${rp(x.close)} (${pct(x.pct)}) · nilai transaksi ${besar(x.value)}`],
      'ramai diperdagangkan belum tentu diikuti kenaikan harga. Bandingkan dengan pergerakan sektor dan kabar perusahaannya.'); }
    { const a = top(dalam, x => x.pct).filter(x => x.pct > 0); mk('naik-' + sk, '5 Saham ' + nm + ' Naik Terbesar', '📈', tg,
      `Lima saham sektor ${nm} dengan kenaikan harga terbesar pada penutupan ${tgl(iso)}. ${note}`, a, x => [pct(x.pct), `${rp(x.close)} · nilai ${besar(x.value)}`, `${rp(x.close)} (${pct(x.pct)}) · nilai transaksi ${besar(x.value)}`],
      'naik tajam dalam sehari belum tentu berlanjut. Cek dulu penyebabnya, misalnya kabar perusahaan atau pergerakan sektor.'); }
  });
  /* 11. peringkat dari laporan keuangan: tampil sekali tiap pembaruan data, seluruh pasar dan per sektor */
  if (P.asOf && P.periode) {
    const sumber = `data bursa (Ringkasan Saham BEI) dan laporan keuangan 12 bulan terakhir s.d. ${P.periode} (data JOY, diperbarui ${P.asOf}), diolah JOY`;
    const slug = P.asOf.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const M = [
      { k: 'roe', judul: 'ROE Tertinggi', emoji: '💹', tagar: '#ROE #FundamentalSaham', dir: 1, f: x => x.roe, fm: x => n(x.roe * 100, 1) + '%',
        def: 'ROE (laba bersih 12 bulan terakhir dibagi ekuitas)', art: 'ROE menunjukkan seberapa besar laba yang dihasilkan dari modal pemegang saham. ROE tinggi bisa juga muncul karena ekuitas kecil atau utang besar, jadi cek juga DER dan kestabilan labanya.' },
      { k: 'per', judul: 'PER Terendah', emoji: '🏷️', tagar: '#PER #FundamentalSaham', dir: -1, f: x => x.per, fm: x => n(x.per, 1) + '×',
        def: 'PER (harga penutupan dibagi laba per saham 12 bulan terakhir; hanya saham yang labanya positif)', art: 'PER rendah berarti harga lebih kecil dibanding laba saat ini, tetapi bisa karena laba sedang di puncak atau pasar ragu pada prospeknya. Bandingkan dengan sesama sektor.' },
      { k: 'pbv', judul: 'PBV Terendah', emoji: '📚', tagar: '#PBV #FundamentalSaham', dir: -1, f: x => x.pbv, fm: x => n(x.pbv, 2) + '×',
        def: 'PBV (harga penutupan dibagi nilai buku per saham)', art: 'PBV di bawah 1× berarti harga di bawah nilai buku. Murah menurut angka belum tentu murah sesungguhnya: periksa kualitas aset dan labanya.' },
      { k: 'laba', judul: 'Laba Bersih Terbesar', emoji: '💰', tagar: '#LabaBersih #FundamentalSaham', dir: 1, f: x => x.laba, fm: x => rpM(x.laba),
        def: 'laba bersih 12 bulan terakhir', art: 'laba besar menunjukkan skala usaha, bukan murah atau mahalnya harga saham. Bandingkan dengan kapitalisasi pasarnya.' },
      { k: 'mc', judul: 'Kapitalisasi Pasar Terbesar', emoji: '🏛️', tagar: '#KapitalisasiPasar #SahamIndonesia', dir: 1, f: x => x.mc, fm: x => rpM(x.mc),
        def: 'kapitalisasi pasar (harga penutupan dikali jumlah saham beredar)', art: 'kapitalisasi pasar menunjukkan ukuran perusahaan di bursa, bukan penilaian murah atau mahal. Saham berkapitalisasi besar pun bisa turun.' }
    ];
    const lingkup = [{ id: 'all', nama: '', arr: likuid }].concat(Object.keys(SEKTOR).map(sk => ({ id: sk, nama: SEKTOR[sk], arr: likuid.filter(x => x.sektor === sk) })));
    M.forEach(m => lingkup.forEach(l => {
      const ada = l.arr.filter(x => typeof m.f(x) === 'number');
      if (ada.length < (l.id === 'all' ? 30 : 8)) return;
      const a = ada.slice().sort((p, q) => m.dir * (m.f(q) - m.f(p))).slice(0, 5);
      const ekstra = x => [m.fm(x), `${rp(x.close)} (${pct(x.pct)})`, `${m.fm(x)} · harga ${rp(x.close)} (${pct(x.pct)})`];
      const judul = l.nama ? `5 Saham ${l.nama}: ${m.judul}` : `5 Saham dengan ${m.judul}`;
      V.push({ id: `f-${m.k}-${l.id}-${slug}`, ks: `f-${m.k}-${l.id}-${slug}`, judul, emoji: m.emoji, tagar: m.tagar + ' #SahamIndonesia',
        intro: `Lima saham ${l.nama ? 'sektor ' + l.nama : 'di BEI'} dengan ${m.def} ${m.dir > 0 ? 'tertinggi' : 'terendah'}. ${note}`,
        daftar: teksBaris(a, ekstra), rows: baris(a, ekstra), artinya: m.art, kode: a[0].kode, sumber, sumberK: 'data bursa dan laporan keuangan' });
    }));
  }
  return V;
}
function captionPasar(v, iso) {
  return [`${v.emoji} ${v.judul} · ${tgl(iso)}`, '', v.intro, v.daftar ? v.daftar : '', '', `Artinya: ${v.artinya}`, '', 'Detail tiap saham ada di komentar pertama 👇', '', v.tagar, '',
    `Sumber: ${v.sumber || 'data bursa (Ringkasan Saham BEI) diolah JOY'}. Data per ${tglP(iso)}. ${DISC}`].filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n').replace(/\n\n\n+/g, '\n\n');
}

/* ---------- edukasi dari Academy ---------- */
function captionEdu(h, e, hariIni) {
  const judulBagian = e.intro ? '' : e.judul;
  return [`📘 ${h.sapaEdukasi} · ${tgl(hariIni)}`, '', e.artikel + (judulBagian ? ` — ${judulBagian}` : ''), '', e.isi, '',
    `Sumber: Academy JOY, ${tglPanjang(e.tglArtikel)}. Artikel lengkap ada di komentar pertama 👇`, '', h.tagarEdukasi, '', `Informasi pendidikan, bukan ajakan membeli atau menjual.`].join('\n');
}

/* ---------- gerbang mutu ---------- */
function lolos(it, riwayat) {
  const c = it.caption;
  const alasan = [];
  if (c.length < 200) alasan.push('terlalu pendek');
  if (!/\d/.test(c)) alasan.push('tanpa angka');
  if (!/\b(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\b/.test(c)) alasan.push('tanpa tanggal');
  if (!/Sumber:/.test(c)) alasan.push('tanpa sumber');
  if (!/bukan ajakan/.test(c)) alasan.push('tanpa batasan');
  if (/\b(pasti naik|pasti cuan|wajib beli|segera beli|beli sekarang|akan naik)\b/i.test(c)) alasan.push('bahasa ajakan');
  const norm = s => s.replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').toLowerCase();
  const ct = norm(c.split('\n').slice(2).join(' '));
  if (riwayat.some(x => norm((x.caption || '').split('\n').slice(2).join(' ')) === ct)) alasan.push('kembar dengan kiriman 14 hari terakhir');
  return alasan;
}

/* ---------- kartu gambar ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function kartuHTML(k) {
  const isiPanjang = (k.baris || []).join(' ').length;
  const fs1 = k.rows ? 36 : isiPanjang > 650 ? 29 : isiPanjang > 450 ? 33 : isiPanjang > 300 ? 38 : isiPanjang > 200 ? 44 : 50;
  const kotak = k.artinya ? `<div class="art"><b>Artinya:</b> ${esc(k.artinya)}</div>` : '';
  let isi = '';
  if (k.rows) {
    isi = `<div class="rows${k.rows.length >= 6 ? ' tight' : ''}">` + k.rows.map(r => `<div class="r"><div class="a"><b>${esc(r.k)}</b><span>${esc(r.n || '')}</span></div><div class="b"><b>${esc(r.v || '')}</b><span>${esc(r.s || '')}</span></div></div>`).join('') + '</div>';
  } else {
    let lis = [], par = [];
    (k.baris || []).forEach(b => { if (/^- /.test(b)) lis.push(b.slice(2)); else { if (lis.length) { par.push('<ul>' + lis.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>'); lis = []; } par.push(`<p>${esc(b)}</p>`); } });
    if (lis.length) par.push('<ul>' + lis.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>');
    isi = '<div class="isi">' + par.join('') + '</div>';
  }
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;margin:0}body{width:1080px;height:1350px;background:#f3f1e9;font-family:'Plus Jakarta Sans',Inter,'Segoe UI',sans-serif;color:#13231d;display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:center;padding:56px 72px 0;font-size:27px;font-weight:700;color:#164f3c}.top i{font-style:normal;background:#c6f05a;color:#164f3c;border-radius:999px;padding:10px 24px;font-size:25px}
h1{font-size:${k.judul.length > 46 ? 58 : 68}px;line-height:1.1;font-weight:800;letter-spacing:-.02em;padding:46px 72px 0;color:#13231d}
.sub{font-size:28px;color:#66746e;font-weight:500;padding:18px 72px 0}
.isi{padding:38px 72px 0;font-size:${fs1}px;line-height:1.42;font-weight:500;flex:1;overflow:hidden}.isi p{margin-bottom:22px}.isi ul{margin:0 0 22px 0;padding-left:40px}.isi li{margin-bottom:14px}
.rows{padding:30px 72px 0;flex:1;overflow:hidden}.r{display:flex;justify-content:space-between;align-items:center;border-top:2px solid #dcded5;padding:22px 0}.r:last-child{border-bottom:2px solid #dcded5}
.a b{display:block;font-size:44px;font-weight:800;letter-spacing:-.01em}.a span{display:block;font-size:25px;color:#66746e;margin-top:4px;font-weight:500}.b{text-align:right}.b b{display:block;font-size:44px;font-weight:800;color:#164f3c}.b span{display:block;font-size:24px;color:#66746e;margin-top:4px;font-weight:500}
.tight .r{padding:13px 0}.tight .a b,.tight .b b{font-size:38px}.tight .a span,.tight .b span{font-size:22px;margin-top:2px}
.art{margin:0 72px 40px;padding:26px 32px;background:#e6efc9;border-radius:18px;font-size:27px;line-height:1.42;font-weight:500;color:#13231d}.art b{font-weight:800;color:#164f3c}
.kaki{background:#164f3c;color:#fff;padding:34px 72px;display:flex;justify-content:space-between;align-items:center}.kaki b{font-size:34px;font-weight:800}.kaki span{font-size:22px;color:#c7d7d0;max-width:520px;text-align:right;line-height:1.3}.kaki em{font-style:normal;color:#c6f05a}
</style></head><body><div class="top"><div>JOY Capital Market</div><i>${esc(k.label)}</i></div><h1>${esc(k.judul)}</h1><div class="sub">${esc(k.sub)}</div>${isi}${kotak}
<div class="kaki"><b><em>saham.ijoy.co.id</em></b><span>${esc(k.catatan || DISC)}</span></div></body></html>`;
}

/* ---------- utama ---------- */
(async () => {
  const sekarang = new Date(), hariIni = arg('tgl', wib(sekarang).toISOString().slice(0, 10));
  const hariKe = Math.max(0, dayDiff(hariIni, CFG.mulai));
  let antrean = load(QFILE, []), status = load(SFILE, { edukasi: {}, ringkasan: {}, kartu: {} }); status.kartu = status.kartu || {};
  const bank = load(path.join(__dirname, 'konten', 'bank-edukasi.json'), []);
  /* buang kiriman lama (21 hari) dan, bila --ulang, kiriman hari ini yang belum tayang */
  antrean = antrean.filter(x => dayDiff(hariIni, x.tglPos) <= 21 && !(ULANG && x.tglPos === hariIni && x.status === 'baru'));
  const riwayat = antrean.filter(x => dayDiff(hariIni, x.tglPos) <= 14);

  /* data pasar */
  let varian = [], isoData = '', PASAR = null;
  try {
    const [D, S] = await Promise.all([muat('market-daily.json'), muat('stocks.json')]);
    const P = olahPasar(D, S); isoData = P.iso;
    if (dayDiff(hariIni, isoData) > 4) console.log(`data pasar basi (${isoData}), ringkasan hari ini dilewati`);
    else { varian = varianPasar(P); PASAR = P; }
  } catch (e) { console.error('[JOY] data pasar tidak bisa dipakai: ' + e.message); }
  /* urutan varian berputar menurut tanggal supaya campurannya berbeda tiap hari */
  const rot = Math.floor(Date.parse(hariIni + 'T00:00:00Z') / 864e5);
  varian = varian.filter(v => !status.ringkasan[v.ks || `${v.id}-${isoData}`]).map(v => ({ v, o: hsh(`${v.id}|${hariIni}`) })).sort((a, b) => a.o - b.o).map(x => x.v);

  /* kartu Ringkasan Cepat per saham: dibuat oleh mesin yang sama dengan tombol "Buat kartu konten JOY" di halaman saham website */
  let BRL = null;
  const kartuLive = async kode => {
    let pg = null;
    try {
      if (!BRL) BRL = await require('playwright').chromium.launch();
      pg = await BRL.newPage({ viewport: { width: 1280, height: 900 } });
      if (process.env.FAKE_NOW) await pg.clock.setFixedTime(new Date(process.env.FAKE_NOW));
      await pg.goto(`${SITE}/?saham=${kode}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const btn = await pg.waitForSelector('[data-ss-card]', { timeout: 25000 }).catch(() => null);
      if (!btn) return null;
      await btn.click();
      await pg.waitForSelector('.ss-card canvas', { timeout: 10000 });
      await pg.waitForTimeout(1800);
      const cap = await pg.$eval('.ss-cap', e => e.value);
      const url = await pg.$eval('.ss-card canvas', c => c.toDataURL('image/jpeg', 0.9));
      const baris = cap.split('\n').filter(l => !/^Selengkapnya:/.test(l));
      const isi = baris.join('\n').trim().replace(/\nBahan riset dan edukasi, bukan ajakan beli atau jual\.$/, '\nSumber: harga dan volume BEI, kepemilikan KSEI, laporan keuangan; diolah JOY Capital Market.\nBahan riset dan edukasi, bukan ajakan beli atau jual.');
      const caption = [`🔎 Ringkasan Cepat ${kode} · ${tgl(hariIni)}`, '', isi, '', `#SahamIndonesia #${kode} #AnalisaSaham`].join('\n');
      return { caption, jpg: Buffer.from(url.split(',')[1], 'base64'), alt: `Ringkasan Cepat ${kode}. ${baris[2] || ''}` };
    } catch (e) { console.log(`kartu ${kode}: ${String(e.message).split('\n')[0]}`); return null; }
    finally { if (pg) await pg.close().catch(() => {}); }
  };
  const calonKartu = PASAR ? PASAR.R.filter(x => x.value >= CFG.bataslikuid && x.close >= 50 && !(status.kartu[x.kode] && dayDiff(hariIni, status.kartu[x.kode]) < 14))
    .sort((a, b) => b.value - a.value).slice(0, 60).sort((a, b) => hsh(a.kode + '|' + hariIni) - hsh(b.kode + '|' + hariIni)).map(x => x.kode) : [];

  const baru = [];
  for (const [hi, h] of CFG.halaman.entries()) {
    if (antrean.some(x => x.halaman === h.kunci && x.tglPos === hariIni)) { console.log(`${h.nama}: antrean ${hariIni} sudah ada, dilewati`); continue; }
    const kuota = Math.round(h.awal + (h.target - h.awal) * Math.min(1, hariKe / CFG.rampHari));
    const rencana = {}; let tot = 0;
    Object.entries(h.jenis).forEach(([j, c]) => { rencana[j] = Math.round(c * kuota / h.target); });
    const dibuat = [];
    /* edukasi */
    for (let i = 0; i < (rencana.edukasi || 0); i++) {
      const pakai = {}; Object.entries(status.edukasi).forEach(([id]) => { const s = id.replace(/^edu-/, '').replace(/-\d+$/, ''); pakai[s] = (pakai[s] || 0) + 1; });
      const calon = bank.filter(e => !status.edukasi[e.id] && !(e.habis && e.habis < hariIni));
      calon.sort((a, b) => (pakai[a.slug] || 0) - (pakai[b.slug] || 0) || bank.indexOf(a) - bank.indexOf(b));
      let dipilih = null;
      for (const e of calon) {
        const it = { caption: captionEdu(h, e, hariIni) };
        const gagal = lolos(it, riwayat.concat(baru, dibuat));
        if (!gagal.length) { dipilih = { e, it }; break; } else console.log(`edukasi ${e.id} ditolak: ${gagal.join(', ')}`);
      }
      if (!dipilih) { console.log(`${h.nama}: bahan edukasi habis atau tidak lolos`); break; }
      const { e, it } = dipilih; status.edukasi[e.id] = hariIni;
      dibuat.push({ jenis: 'edukasi', sumberId: e.id, caption: it.caption,
        komentar: `Artikel lengkap: ${utm('edukasi', `${h.kunci}_${e.id}`).replace(SITE + '/?', SITE + '/academy/' + e.slug + '?')}\n\n${DISC}`,
        kartu: { label: 'Belajar Saham', judul: e.intro ? e.artikel : e.judul, sub: (e.intro ? '' : e.artikel + ' · ') + tgl(hariIni), baris: e.isi.split('\n'), catatan: `Sumber: Academy JOY, ${tglP(e.tglArtikel)}. Bukan ajakan membeli atau menjual.` } });
    }
    /* ringkasan pasar */
    for (let i = 0; i < (rencana.ringkasan || 0); i++) {
      const v = varian.shift(); if (!v) { console.log(`${h.nama}: bahan ringkasan pasar habis untuk hari ini`); break; }
      const it = { caption: captionPasar(v, isoData) };
      const gagal = lolos(it, riwayat.concat(baru, dibuat));
      if (gagal.length) { console.log(`ringkasan ${v.id} ditolak: ${gagal.join(', ')}`); i--; continue; }
      status.ringkasan[v.ks || `${v.id}-${isoData}`] = h.kunci;
      dibuat.push({ jenis: 'ringkasan', sumberId: `${v.id}-${isoData}`, caption: it.caption,
        komentar: `Data lengkap dan detail tiap saham: ${utm('ringkasan-' + v.id, `${h.kunci}_${v.id}_${isoData}`, v.kode ? 'saham=' + v.kode : '', '#ringkasan')}\n\n${DISC}`,
        kartu: { label: 'Data pasar', judul: v.judul, sub: `Penutupan ${tgl(isoData)}`, rows: v.rows, artinya: v.artinya, catatan: `Sumber: ${v.sumberK || 'data bursa'} diolah JOY. ${DISC}` } });
    }
    /* kartu saham dari website */
    for (let i = 0; i < (rencana.kartuSaham || 0) && PASAR && !UJI; i++) {
      let hasil = null, kode = '';
      while (!hasil && calonKartu.length) {
        kode = calonKartu.shift();
        hasil = await kartuLive(kode);
        if (!hasil) { console.log(`kartu ${kode}: tidak dibuat (data belum segar atau halaman gagal)`); continue; }
        const gagal = lolos({ caption: hasil.caption }, riwayat.concat(baru, dibuat));
        if (gagal.length) { console.log(`kartu ${kode} ditolak: ${gagal.join(', ')}`); hasil = null; }
      }
      if (!hasil) { console.log(`${h.nama}: kartu saham habis atau tidak bisa dibuat`); break; }
      status.kartu[kode] = hariIni;
      dibuat.push({ jenis: 'kartuSaham', sumberId: `kartu-${kode}-${isoData}`, caption: hasil.caption,
        komentar: `Ringkasan lengkap ${kode} (harga, fundamental, kepemilikan, grafik): ${utm('kartu-saham', `${h.kunci}_${kode}_${isoData}`, 'saham=' + kode, '#ringkasan')}\n\n${DISC}`,
        kartu: { jpg: hasil.jpg, alt: hasil.alt } });
    }
    /* urutan selang-seling jenis, lalu jam tayang tersebar */
    const per = {}; dibuat.forEach(x => (per[x.jenis] = per[x.jenis] || []).push(x));
    const urut = []; while (Object.values(per).some(a => a.length)) Object.values(per).forEach(a => { if (a.length) urut.push(a.shift()); });
    const mulaiMenit = Math.round(CFG.jamAwal * 60) + hi * 13, akhirMenit = Math.round(CFG.jamAkhir * 60);
    const minNow = Math.ceil((wib(sekarang).getUTCHours() * 60 + wib(sekarang).getUTCMinutes() + 20) / 5) * 5;
    const awalEfektif = hariIni === wib(sekarang).toISOString().slice(0, 10) ? Math.max(mulaiMenit, minNow) : mulaiMenit;
    const langkah = urut.length > 1 ? (akhirMenit - awalEfektif) / (urut.length - 1) : 0;
    urut.forEach((x, i) => {
      const menit = Math.round(awalEfektif + langkah * i);
      const jad = new Date(Date.parse(hariIni + 'T00:00:00+07:00') + menit * 60e3);
      baru.push({ id: `${hariIni}_${h.kunci}_${String(i + 1).padStart(2, '0')}`, halaman: h.kunci, tglPos: hariIni, jenis: x.jenis, sumberId: x.sumberId, jadwal: jad.toISOString(), status: 'baru', caption: x.caption, komentar: x.komentar, kartu: x.kartu, berkas: `${OUT}/${hariIni}/${h.kunci}-${String(i + 1).padStart(2, '0')}.jpg`, dibuat: sekarang.toISOString() });
    });
    console.log(`${h.nama}: kuota ${kuota}/hari (hari ke-${hariKe}), dibuat ${urut.length}: ` + Object.entries(per).length + ' jenis');
  }

  if (UJI) { baru.forEach(x => console.log(`\n=== ${x.id} | ${x.jenis} | ${wib(new Date(x.jadwal)).toISOString().slice(11, 16)} WIB\n${x.caption}\n--- komentar:\n${x.komentar}`)); console.log(`\n(uji) ${baru.length} kiriman, tidak ada yang disimpan`); return; }

  /* gambar */
  if (baru.length) {
    const { chromium } = require('playwright');
    const br = await chromium.launch(); const pg = await br.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
    for (const x of baru) {
      if (x.kartu.jpg) { fs.mkdirSync(path.dirname(x.berkas), { recursive: true }); fs.writeFileSync(x.berkas, x.kartu.jpg); x.alt = x.kartu.alt; delete x.kartu; continue; }
      await pg.setContent(kartuHTML(x.kartu), { waitUntil: 'networkidle', timeout: 30000 }).catch(() => pg.setContent(kartuHTML(x.kartu)));
      await pg.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
      fs.mkdirSync(path.dirname(x.berkas), { recursive: true });
      await pg.screenshot({ path: x.berkas, type: 'jpeg', quality: 86 });
      x.alt = `${x.kartu.judul}. ${x.kartu.sub}. ${(x.kartu.rows ? x.kartu.rows.map(r => [r.k, r.n, r.v].filter(Boolean).join(' ')).join('; ') : x.kartu.baris.join(' ')).slice(0, 600)}`;
      delete x.kartu;
    }
    await br.close();
  }
  if (BRL) await BRL.close().catch(() => {});
  antrean = antrean.concat(baru);
  fs.writeFileSync(QFILE, JSON.stringify(antrean, null, 1)); fs.writeFileSync(SFILE, JSON.stringify(status, null, 1));
  /* buang gambar lama (lebih dari 3 hari) */
  try { fs.readdirSync(OUT).filter(d => /^\d{4}-\d\d-\d\d$/.test(d) && dayDiff(hariIni, d) > 3).forEach(d => fs.rmSync(path.join(OUT, d), { recursive: true, force: true })); } catch (e) { }
  console.log(`selesai: ${baru.length} kiriman baru masuk antrean`);
})().catch(e => { console.error('[JOY] gagal: ' + (e.stack || e.message)); process.exit(1); });
