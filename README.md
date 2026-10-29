<div align="center">
  <h1>⚡ X-BOT — WhatsApp Moderation & VOIP Bot</h1>
  <p><b>Bot WhatsApp berbasis zapo-js untuk moderasi grup dan penanganan panggilan.</b></p>

  [![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
  [![zapo-js](https://img.shields.io/badge/Engine-zapo--js-7C3AED?style=flat-square)](https://zapo.to/)
  [![License](https://img.shields.io/badge/License-MIT-F59E0B?style=flat-square)](LICENSE)
</div>

---

## Fitur

### Reaksi moderasi (di grup)

Reaksi harus berasal dari akun bot/owner. Perintah yang sama dideduplikasi sementara agar tidak dieksekusi berkali-kali.

| Reaksi | Perilaku di kode saat ini |
| :---: | :--- |
| 👾 | Menjalankan proses penghapusan senyap untuk pesan target. |
| 🤫 | Toggle mute peserta target; ketika mute diaktifkan, pesan target ikut dihapus. Pesan selanjutnya dari peserta yang di-mute akan dihapus otomatis. |
| 👍 | Menyimpan teks pesan target sebagai template fake edit. Teks target perlu tersedia di message store. |
| ❤️ | Menjalankan fake edit menggunakan template tersimpan, atau teks default `HIDUP JOKOWI!` jika belum ada. |

> Saat ini handler tidak memiliki aksi 📢/📣; README ini mencerminkan perilaku yang ditemukan pada kode, bukan fitur yang mungkin pernah direncanakan.

### Penanganan panggilan

Panggilan masuk ditangani melalui VOIP, tanpa fallback mengirim voice note. Panggilan suara memutar `assets/anticall.mp3` saja. Panggilan video memutar `assets/anticall_video.mp4` satu kali sebagai video H.264 Baseline dan audio mono PCM melalui jalur VOIP langsung; MP3 tidak digunakan untuk panggilan video. Jika penelepon meminta upgrade panggilan suara ke video, bot menerima upgrade lalu mulai stream video dan audio klip (audio MP3 yang mungkin sudah berjalan sebelum upgrade tidak dapat ditarik kembali). Panggilan video diakhiri saat klip selesai; jika stream gagal, bot mencatat error tanpa fallback mengirim media sebagai chat.

---

## Struktur proyek

```text
.
├── assets/                         # Media panggilan suara dan video
├── data/                           # Database autentikasi dan data aplikasi lokal
├── src/
│   ├── app.js                      # Startup, koneksi, lifecycle dan event
│   ├── config.js                   # Environment dan konfigurasi store
│   ├── handlers/message-handler.js  # Routing pesan dan reaksi
│   ├── features/
│   │   ├── moderation/             # Silent delete dan fake edit
│   │   ├── voip/anti-call.js       # Penanganan panggilan dan streaming media VOIP
│   │   └── voip/annexb.js          # Pengelompokan H.264 Annex-B access unit
│   ├── shared/utils.js             # Helper JID dan serialisasi pesan
│   └── storage/
│       ├── database.js             # Skema SQLite dan prepared statements
│       └── message-store.js        # Penyimpanan pesan target (retensi 3 hari)
├── main.js                         # Entry point kompatibel
├── package.json
├── .env.example                    # Contoh konfigurasi
└── README.md
```

Database autentikasi WhatsApp dan database fitur aplikasi dipisahkan. Message store menyimpan pesan yang diperlukan untuk fitur reaksi dan membersihkan pesan lebih tua dari tiga hari.

---

## Persyaratan

- Node.js 22 atau lebih baru.
- Dependensi native yang dibutuhkan paket SQLite/VOIP berhasil dipasang pada sistem operasi.
- Nomor WhatsApp untuk pairing.

## Instalasi dan konfigurasi

```bash
npm install
```

Salin `.env.example` menjadi `.env`, kemudian isi konfigurasi:

```env
BOT_NUMBER=628xxxxxxxxxx
SESSION_ID=default
```

`BOT_NUMBER` dan `SESSION_ID` wajib. Pairing code dibuat otomatis oleh WhatsApp berdasarkan nomor; tidak perlu mengatur custom pairing code. `ICEL_DATA_DIR` opsional untuk memilih direktori data lain; jika tidak diisi, data disimpan di `data/`.

Jika koneksi terputus tanpa logout, bot mencoba reconnect dengan exponential backoff dari 3 detik hingga maksimum 60 detik; saat koneksi terbuka kembali, jeda direset.

Jalankan bot:

```bash
npm start
```

Gunakan pairing code yang tampil di terminal melalui WhatsApp: **Perangkat tertaut → Tautkan perangkat → Tautkan dengan nomor telepon saja**. Kode tidak lagi ditentukan manual oleh konfigurasi.

## Perintah pengembangan

```bash
npm run lint
npm test
```

`npm test` memakai Node.js test runner. Pastikan tes ditambahkan ke proyek; bila belum ada, runner dapat selesai tanpa menjalankan tes.

## Catatan operasional

- Jaga kerahasiaan `.env`, kredensial pairing, serta database autentikasi di `data/`.
- Penghapusan senyap dan fake edit menggunakan perilaku protokol WhatsApp yang dapat berubah atau tidak dijamin oleh WhatsApp; uji dengan hati-hati.
- Tabel lama yang tidak digunakan tidak dihapus otomatis saat startup; perubahan/pembersihan skema perlu dilakukan melalui migrasi yang disengaja dan backup.

## Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).
