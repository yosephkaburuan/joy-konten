# Konten Facebook JOY: panduan singkat

Seri konten: **"Siapa Pemilik Perusahaan Ini?"**
Setiap kartu menjawab satu pertanyaan: siapa pemegang saham sebuah emiten (asing, ritel lokal, lembaga lokal), apakah porsinya bergeser dalam 3 bulan terakhir, dan di mana detailnya ada di website JOY. Semua angka diambil langsung dari data KSEI yang sudah ada di saham.ijoy.co.id, jadi tidak ada angka yang diketik tangan.

Tujuan kartu: membuat orang berhenti menggulir, lalu penasaran dan membuka halaman Kepemilikan saham itu di website. Link ke website ditaruh di **komentar pertama** (kenapa, lihat bagian "Soal link").

---

## Tiga tahap otomatis

| Tahap | Apa yang otomatis | Yang masih Bapak lakukan | Status |
|---|---|---|---|
| 1 | Kartu, caption, komentar pertama dibuat dari data website | Unggah ke Facebook sendiri (±5 menit per postingan) | **Siap dipakai sekarang** (7 contoh ada di folder `paket/2026-10-30`) |
| 2 | Tiap Senin pagi, 7 paket baru dibuat sendiri dan Bapak diberi tahu lewat email | Periksa 2 menit, lalu unggah/jadwalkan | **Sudah ditulis, belum diuji** (butuh akun GitHub, lihat di bawah) |
| 3 | Langsung tayang ke Facebook tanpa Bapak | Hanya menyetujui | **Belum dibuat.** Dibuat setelah Tahap 2 jalan 2 minggu dan Bapak memasang kunci Facebook sendiri |

Saran saya: jalankan Tahap 2 selama dua minggu dulu. Kalau dua minggu itu isi kartunya sudah terasa aman dan rapi, baru kita buka Tahap 3.

---

## Tahap 1: pakai sekarang

Di folder `paket/2026-10-30` ada 7 folder, satu per saham (BBCA, BBRI, BMRI, TLKM, ASII, BREN, HMSP). Isi tiap folder:

- `kartu_4x5.png` : gambar untuk postingan di Beranda dan halaman Facebook
- `kartu_9x16.png` : gambar untuk Story atau Reels
- `caption.txt` : teks postingan, tinggal salin
- `komentar_pertama.txt` : teks komentar pertama yang berisi link
- `alt_text.txt` : teks alternatif gambar (untuk pembaca layar)
- `data.json` : angka mentah yang dipakai (untuk dicek ulang)

Cara unggah satu postingan:
1. Buat postingan baru di halaman Facebook. Pasang `kartu_4x5.png`.
2. Salin isi `caption.txt` ke kolom teks. Tidak ada link di sini.
3. Setelah tayang, **segera** tempel isi `komentar_pertama.txt` sebagai komentar pertama.
4. Kalau ingin ditayangkan di Story, pasang `kartu_9x16.png`.

Halaman "Paket Konten JOY" (artifact) menampilkan 7 kartu yang sama dengan tombol **Salin caption** dan **Salin komentar pertama**, jadi Bapak tidak perlu membuka file satu per satu.

Saran awal: tayangkan 3 kartu per minggu dan simpan sisanya sebagai cadangan. Ini saran untuk memulai, bukan angka dari hasil uji. Lihat hasilnya di Meta Business Suite setelah dua minggu, lalu kita atur ulang.

---

## Tahap 2: otomatis tiap Senin (butuh akun GitHub gratis)

Mengapa GitHub: jadwal otomatis harus berjalan di tempat yang bisa membuka website JOY. Komputer saya tidak bisa membuka website dari luar, sedangkan GitHub bisa dan gratis untuk pemakaian sekecil ini.

Langkah satu kali:
1. Buat akun di github.com (gratis) bila belum punya.
2. Klik **New repository**. Nama: `joy-konten`. Pilih **Private**.
3. Ekstrak zip ini di komputer. Di halaman repository klik **Add file, lalu Upload files**, tarik semua isi folder hasil ekstrak (termasuk folder `.github`), lalu **Commit changes**.
   - Kalau folder `.github` tidak ikut terunggah (folder berawalan titik kadang disembunyikan), klik **Add file, lalu Create new file**, ketik nama `.github/workflows/konten-fb.yml`, lalu tempel isi file `konten-fb.yml` dari zip.
4. Buka **Settings, lalu Actions, lalu General**. Di bagian **Workflow permissions** pilih **Read and write permissions**, lalu Save.
5. Buka tab **Actions**, pilih **Konten Facebook mingguan**, klik **Run workflow**. Ini uji pertama. Tunggu sekitar 2 sampai 4 menit.
6. Kalau hijau (berhasil): akan muncul folder `paket/<tanggal>` di repository dan sebuah **Issue** berisi semua caption. GitHub mengirim Issue itu ke email Bapak.
7. Sesudah itu otomatis jalan tiap **Senin 07.00 WIB**.

Kalau langkah 5 gagal merah, salin pesan error-nya dan kirim ke saya. Alur ini sudah saya uji bagian pembuat kartunya, tetapi jadwal GitHub-nya belum bisa saya jalankan dari sini, jadi kemungkinan ada satu atau dua penyesuaian kecil.

Cara pemilihan saham otomatis:
- Dari 80 saham dengan kapitalisasi pasar terbesar.
- Yang pergeseran porsi asingnya lebih besar dan nilai pasarnya lebih besar diutamakan.
- Saham yang pergeserannya 10 poin atau lebih dibuang. Pergeseran sebesar itu sering berasal dari pemindahan antar entitas, bukan jual beli, jadi lebih aman tidak dijadikan konten.
- Saham yang sudah tayang tidak diulang selama 60 hari (dicatat di `posted.json`).

---

## Tahap 3: tayang otomatis (belum dibuat)

Yang dibutuhkan: *Page access token* dari Facebook Developer untuk halaman Bapak. Aturannya:
- **Jangan kirim token ke chat.** Token = kunci halaman Bapak.
- Bapak memasangnya sendiri di GitHub: **Settings, lalu Secrets and variables, lalu Actions, lalu New repository secret**.
- Saya menulis skrip tayangnya, lalu kita uji dengan **satu postingan percobaan** sebelum dipakai rutin.

---

## Aturan isi yang dijaga (jangan diubah saat mengedit caption)

- Hanya data. Tidak ada ajakan membeli atau menjual, tidak ada target harga.
- Tanggal data selalu tertulis di kartu dan di caption.
- Catatan sumber KSEI selalu ada: persentase dihitung dari saham **yang tercatat di KSEI**, bukan seluruh saham beredar. Kartu menyebut kira-kira berapa persen dari saham beredar yang tercakup.
- Pergeseran besar diberi catatan bahwa bisa berasal dari pemindahan antar entitas.

Karena Bapak berlisensi WPPE, saya sengaja membuat nadanya informatif. Kalau ada kalimat yang menurut Bapak perlu diperlunak atau ditambah, bilang saja, aturannya saya ubah di satu tempat dan berlaku untuk semua kartu.

---

## Soal link di Facebook

Laporan per Oktober 2026 menyebut halaman yang tidak berlangganan dibatasi sekitar 2 link keluar per bulan di postingan, sedangkan link di komentar belum dilaporkan dibatasi. Facebook belum mengonfirmasi resmi, dan aturan ini bisa berubah. Karena itu rancangannya: gambar dan caption tanpa link, link di komentar pertama. Pantau jumlah klik link di Meta Business Suite selama dua minggu pertama. Kalau komentar ternyata tidak menghasilkan klik, kita ganti cara.

Setiap link memakai penanda `utm_source=facebook&utm_campaign=siapa-pemilik`, supaya kunjungan dari seri ini bisa dibedakan. Website JOY saat ini belum memasang alat pengukur kunjungan, jadi penanda itu belum akan terbaca di mana pun. Saran saya: pasang Cloudflare Web Analytics atau Google Analytics di revisi berikutnya, supaya Bapak bisa melihat berapa orang datang dari Facebook dan membuka halaman mana.

## Saran nama halaman

Alamat halaman Bapak `facebook.com/analisasahamjoy` tetapi namanya "Bursa Saham Indonesia". Orang yang mencari "JOY" tidak akan mengenalinya. Saran saya ubah nama menjadi **Analisa Saham JOY** dan pakai logo JOY sebagai foto profil.
