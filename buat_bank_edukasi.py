#!/usr/bin/env python3
"""Memecah artikel Academy JOY menjadi kiriman edukasi: satu bagian (satu konsep) per kiriman.
Hanya memakai teks artikel milik JOY sendiri. Hasil: konten/bank-edukasi.json"""
import re, json, sys, glob, os, html, urllib.request
from bs4 import BeautifulSoup

SRC = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/joy-site/academy'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/fbpack2/konten/bank-edukasi.json'
BULAN = {'Januari':1,'Februari':2,'Maret':3,'April':4,'Mei':5,'Juni':6,'Juli':7,'Agustus':8,'September':9,'Oktober':10,'November':11,'Desember':12}

def rapikan(t):
    t = html.unescape(t)
    t = re.sub(r'[ \t ]+', ' ', t)
    t = re.sub(r'\s*\n\s*', '\n', t)
    return t.strip()

def teks_blok(el):
    """satu elemen -> daftar baris teks"""
    baris = []
    if el.name == 'p':
        baris.append(rapikan(el.get_text(' ', strip=True)))
    elif el.name in ('ul', 'ol'):
        for i, li in enumerate(el.find_all('li', recursive=False), 1):
            baris.append(('- ' if el.name == 'ul' else f'{i}. ') + rapikan(li.get_text(' ', strip=True)))
    elif el.name == 'div' and el.find('table'):
        for tr in el.find_all('tr'):
            sel = [rapikan(c.get_text(' ', strip=True)) for c in tr.find_all(['th', 'td'])]
            if tr.find('th'):
                continue
            if len(sel) >= 2:
                baris.append(sel[0] + ': ' + ' | '.join(sel[1:]))
            elif sel:
                baris.append(sel[0])
    elif el.name == 'table':
        for tr in el.find_all('tr'):
            sel = [rapikan(c.get_text(' ', strip=True)) for c in tr.find_all(['th', 'td'])]
            if tr.find('th'):
                continue
            if len(sel) >= 2:
                baris.append(sel[0] + ': ' + ' | '.join(sel[1:]))
    return [b for b in baris if b]

def tgl_iso(s):
    m = re.search(r'(\d{1,2})\s+(' + '|'.join(BULAN) + r')\s+(\d{4})', s)
    return f'{int(m.group(3)):04d}-{BULAN[m.group(2)]:02d}-{int(m.group(1)):02d}' if m else ''

LEWATI_ARTIKEL = {'saham-haji-isam'}                      # menyebut nama pribadi: ditahan sampai Bapak memutuskan
LEWATI_ID = {'edu-apa-itu-saham-hsc-06', 'edu-apa-itu-saham-hsc-07'}   # bergantung pada tabel di website, tidak berdiri sendiri
HABIS = {'edu-lot-fraksi-harga-ara-arb-04': '2026-12-31', 'edu-apa-itu-saham-hsc-03': '2026-12-31'}  # ketentuan yang dijadwalkan berubah

def bersih(t):
    t = re.sub(r'\s+([,.;:!?])', r'\1', t)
    baris = [b for b in t.split('\n') if not re.match(r'^(Lihat|Buka|Baca|Klik)\b', b.strip())]
    return '\n'.join(baris).strip()

out = []
def ambil(url):
    req = urllib.request.Request(url, headers={'user-agent': 'joy-konten/1.0'})
    return urllib.request.urlopen(req, timeout=40).read().decode('utf-8')

if SRC.startswith('http'):
    dasar = SRC.rstrip('/')
    slugs = sorted(set(re.findall(r'<loc>[^<]*/academy/([a-z0-9-]+)/?</loc>', ambil(dasar + '/sitemap.xml'))))
    SUMBER = [(sl, (lambda u: (lambda: ambil(u)))(f'{dasar}/academy/{sl}')) for sl in slugs]
else:
    SUMBER = [(os.path.basename(f)[:-5], (lambda ff: (lambda: open(ff, encoding='utf-8').read()))(f)) for f in sorted(glob.glob(os.path.join(SRC, '*.html')))]

for slug, baca in SUMBER:
    if slug == 'index' or slug in LEWATI_ARTIKEL:
        continue
    s = baca()
    b = BeautifulSoup(s, 'lxml')
    art = b.find('article')
    if not art:
        continue
    h1 = rapikan(art.find('h1').get_text(' ', strip=True))
    sub = art.find('p', class_='sub')
    tglA = tgl_iso(sub.get_text(' ', strip=True)) if sub else ''
    kan = b.find('link', rel='canonical')
    url = kan['href'] if kan else f'https://saham.ijoy.co.id/academy/{slug}'
    bagian = [{'judul': None, 'baris': []}]
    for el in art.find('h1').find_all_next():
        if el.parent is not art and el.parent.name != 'article':
            # elemen di dalam div tabel sudah ditangani lewat div induknya
            if not (el.name in ('ul', 'ol', 'table', 'p') and el.parent.name == 'div' and 'tw' in (el.parent.get('class') or [])):
                pass
        if el.name == 'h2' and el.parent is art:
            bagian.append({'judul': rapikan(el.get_text(' ', strip=True)), 'baris': []})
        elif el.parent is art and el.name in ('p', 'ul', 'ol', 'div', 'table'):
            if el.name == 'p' and 'sub' in (el.get('class') or []):
                continue
            bagian[-1]['baris'] += teks_blok(el)
    n = 0
    for bg in bagian:
        isi = bersih('\n'.join(bg['baris']))
        if len(isi) < 140:
            continue
        # buang bagian yang hanya berisi rujukan ke bagian lain di website
        if re.match(r'^(baca juga|lihat juga|disclaimer|catatan)', (bg['judul'] or '').lower()):
            continue
        judul = bg['judul'] or h1
        # potong bagian yang terlalu panjang: per paragraf, maks ~900 karakter per kiriman
        paras = isi.split('\n')
        potongan, cur = [], ''
        for p in paras:
            if cur and len(cur) + len(p) > 900:
                potongan.append(cur); cur = p
            else:
                cur = (cur + '\n' + p) if cur else p
        if cur:
            potongan.append(cur)
        for i, ptg in enumerate(potongan):
            n += 1
            if f'edu-{slug}-{n:02d}' in LEWATI_ID:
                continue
            out.append({
                'id': f'edu-{slug}-{n:02d}',
                'habis': HABIS.get(f'edu-{slug}-{n:02d}', ''),
                'artikel': h1,
                'slug': slug,
                'url': url,
                'tglArtikel': tglA,
                'judul': judul if len(potongan) == 1 else f'{judul} ({i+1}/{len(potongan)})',
                'isi': ptg,
                'intro': bg['judul'] is None,
            })
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out), 'kiriman dari', len(set(x['slug'] for x in out)), 'artikel')
