<div align="center">
  <h1>⚡ X-BOT — WhatsApp Moderation & VOIP Bot</h1>
  <p><b>Bot WhatsApp berkinerja tinggi berbasis zapo-js untuk moderasi grup, automasi perintah, dan penanganan panggilan VOIP.</b></p>

  [![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
  [![zapo-js](https://img.shields.io/badge/Engine-zapo--js-7C3AED?style=flat-square)](https://zapo.to/)
  [![License](https://img.shields.io/badge/License-MIT-F59E0B?style=flat-square)](LICENSE)
</div>

---

## Fitur Utama

### 1. Moderasi via Reaksi Emoji (Khusus Grup)

Aksi moderasi dipicu secara instan hanya ketika **akun bot/owner memberikan reaksi emoji** ke pesan target:

| Reaksi | Aksi & Perilaku |
| :---: | :--- |
| 👾 | **Silent Delete** — Menghapus pesan target secara senyap menggunakan manipulasi status message dan pencabutan langsung (*immediate revocation*). |
| 🤫 | **Toggle Mute** — Mengaktifkan/menonaktifkan mute pada pengirim pesan target (sadar identitas LID & No. Telepon). Pesan target dan pesan berikutnya akan otomatis dihapus senyap. |
| 👍 | **Save Fake Text** — Mengambil teks dari pesan target dan menyimpannya sebagai template teks fake edit ke database. |
| ❤️ / ❤ | **Fake Edit** — Mengubah teks pesan target menjadi template yang tersimpan (atau fallback ke `HIDUP JOKOWI!`). |
| 💚 | **Notify Reaction** — Mengirimkan sekuens reaksi cepat dengan metadata transparansi sesi WhatsApp (*sessionTransparencyMetadata*). |
| ⭐ | **Save Custom Sticker** — Menyimpan stiker pesan target ke database sebagai payload stiker anotasi. |
| 🗿 | **Sticker Annotation Spam** — Mengirimkan 20 stiker yang ditautkan ke pesan target via asosiasi pesan (*associationType: 11*) dengan jeda 200ms. |

---

### 2. Sistem Perintah Teks (`!`)

Perintah teks dipicu secara eksklusif oleh pesan yang dikirim oleh akun bot sendiri:

- `!addai` : **Tambah Meta AI ke Grup** — Menambahkan akun Meta AI (`867051314767696@bot`) ke grup aktif secara otomatis.
- `!setpp` : **Ganti Foto Profil Bot** — Mengubah foto profil bot. Mendukung 3 metode:
  - Balas (*reply*) ke pesan gambar dengan `!setpp`
  - Kirim gambar langsung dengan caption `!setpp`
  - Mengirim URL gambar: `!setpp https://example.com/foto.jpg`  
  *(Gambar otomatis di-resize dan dikompres ke JPEG 720×720 via `sharp`)*
- `!rvo` : **Reveal View-Once** — Mengunduh dan mengirim ulang media sekali-lihat (*view-once*) menjadi media biasa. Mendukung gambar, video, pesan suara (PTT/audio), video bulat (PTV), dokumen, dan stiker.
  - *Cara pakai*: Balas (*reply*) ke pesan view-once dengan `!rvo`.

---

### 3. Penanganan Panggilan Masuk (VOIP Anti-Call)

Panggilan masuk ditangani otomatis melalui subsistem VOIP berbasis WebRTC:
- **Anti-Spam Throttling**: Panggilan berulang dari nomor yang sama dalam rentang 10 detik otomatis ditolak untuk mencegah overload.
- **Panggilan Suara**: Diterima -> jeda 1,5 detik -> menyuntikkan audio `assets/anticall.mp3` langsung ke track WebRTC -> panggilan diakhiri setelah audio selesai.
- **Panggilan Video**: Diterima -> menunggu track video aktif -> memutar video pre-transcoded Baseline H.264 dan audio PCM Float32 (`assets/.cache`) dengan mode copy passthrough stream FFmpeg (< 2% CPU) -> panggilan diakhiri saat video selesai.
- **Upgrade Panggilan**: Permintaan upgrade audio-ke-video (*UpgradeRequestV2*) otomatis disetujui dan langsung beralih ke stream video.

---

## Struktur Proyek

```text
.
├── assets/                         # Aset media panggilan suara dan video
│   └── .cache/                     # Cache H.264 & PCM pre-transcoded (otomatis dibuat)
├── data/                           # Database SQLite (kredensial auth & aplikasi)
├── src/
│   ├── app.js                      # Lifecycle aplikasi, koneksi, dan listener event
│   ├── config.js                   # Validasi variabel lingkungan & konfigurasi store
│   ├── handlers/
│   │   ├── message-handler.js      # Router pesan masuk & reaksi moderasi
│   │   └── command-handler.js      # Router perintah teks (prefix "!")
│   ├── features/
│   │   ├── moderation/             # Logika silent delete & fake edit
│   │   ├── reactions/              # Handler reaksi emoji (👾, 🤫, 👍, ❤️, 💚, ⭐, 🗿)
│   │   ├── commands/               # Handler perintah (!addai, !setpp, !rvo)
│   │   └── voip/                   # Pipeline streaming media VOIP & parser Annex-B
│   ├── shared/
│   │   └── utils.js                # Normalisasi JID null-safe & utilitas pesan
│   └── storage/
│       ├── database.js             # Skema tabel SQLite (STRICT mode) & query
│       ├── message-store.js        # Penyimpanan pesan target (retensi 3 hari + LRU)
│       ├── contacts.js             # Resolusi & pemetaan kontak LID ↔ No. Telepon
│       └── lru.js                  # Fast in-memory LRU cache
├── tests/                          # Rangkaian pengujian unit native Node.js
├── main.js                         # Entry point kompatibilitas
├── patch.js                        # Monkey-patcher otomatis untuk zapo-js
├── package.json
└── README.md
```

---

## Persyaratan Sistem

- **Node.js**: Versi 22 atau lebih baru (ES Modules).
- **Sistem Operasi**: Windows, Linux, atau macOS dengan dependensi compiler native (untuk SQLite & WebRTC).
- **Nomor WhatsApp**: Digunakan untuk autentikasi pairing code.

---

## Instalasi & Menjalankan Bot

1. **Clone repository dan pasang dependensi:**
   ```bash
   git clone https://github.com/Jarotttttt/X-BOT.git
   cd X-BOT
   npm install
   ```
   *(Script `patch.js` akan otomatis berjalan setelah instalasi paket)*

2. **Konfigurasi Environment:**
   Buat file `.env` di root direktori:
   ```env
   BOT_NUMBER=628xxxxxxxxxx
   SESSION_ID=default
   ```

3. **Jalankan Bot:**
   ```bash
   npm start
   ```

4. **Tautkan Perangkat:**
   Salin kode pairing yang muncul di terminal, lalu buka WhatsApp di ponsel:  
   **Perangkat tertaut** -> **Tautkan perangkat** -> **Tautkan dengan nomor telepon saja**.

---

## Perintah Pengembangan & Pengujian

```bash
# Menjalankan linter
npm run lint

# Menjalankan unit tests
npm test

# Menjalankan patch zapo-js secara manual (jika diperlukan)
node patch.js
```

---

## Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).
