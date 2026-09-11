<div align="center">
  <h1>⚡ X-BOT (WhatsApp Stealth Moderation Bot)</h1>
  <p><b>Bot moderasi senyap & automasi grup WhatsApp mutakhir berbasis reaksi emoji ditenagai oleh <code>zapo-js</code>.</b></p>

  [![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
  [![zapo-js](https://img.shields.io/badge/Engine-zapo--js-7C3AED?style=flat-square)](https://zapo.to/)
  [![License](https://img.shields.io/badge/License-MIT-F59E0B?style=flat-square)](LICENSE)
</div>

---

## ✨ Fitur Utama (Emoji Reaction Triggers)

Bot ini dikendalikan langsung oleh akun owner melalui reaksi emoji pada pesan di dalam grup WhatsApp:

| Emoji Reaksi | Fungsi | Deskripsi |
| :---: | :--- | :--- |
| 👾 | **Hapus Senyap** | Menghapus pesan target secara senyap (*silent delete*) tanpa jejak. |
| 🤫 | **Bungkam Anggota** | Mengaktifkan/menonaktifkan mode bisu pada target. Pesan baru dari target akan langsung dihapus otomatis. |
| 👍 | **Set Fake Template** | Menyimpan isi teks pesan yang di-react sebagai template teks untuk fitur edit palsu. |
| 📢 / 📣 | **Fake Edit + Hidetag** | Mengubah pesan target menjadi teks template yang telah disetel disertai mention seluruh member (*hidetag*). |
| ❤️ | **Fake Edit Biasa** | Mengubah pesan target menjadi teks template tanpa mention. |

---

## 📁 Struktur Proyek

```
BOT 2/
├── data/              # Database SQLite (auth.db & database.db) — di-ignore di git
├── src/
│   ├── db.js          # SQLite queries & skema tabel (muted users, fake text)
│   ├── fake-edit.js   # Protokol fake edit & manipulasi pesan WhatsApp
│   ├── silent-delete.js # Protokol penghapusan pesan senyap
│   ├── store.js       # In-memory message store untuk tracking pesan aktif
│   └── utils.js       # Helper JID & validasi status akun
├── config.js          # Inisialisasi env, path data, & store zapo-js
├── handler.js         # Event router reaksi emoji & filter pesan
├── main.js            # Entry point & koneksi WaClient
├── package.json       # Dependensi & script
├── .env.example       # Template konfigurasi environment
├── .gitignore         # File yang diabaikan git
└── README.md          # Dokumentasi bot
```

---

## 🚀 Panduan Instalasi & Penggunaan

### 1. Prasyarat
- **Node.js 22** atau yang lebih baru (`node -v`)

### 2. Pasang Dependensi
```bash
npm install
```

### 3. Konfigurasi `.env`
Salin file `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Lalu sesuaikan isinya:
```env
BOT_NUMBER=628xxxxxxxxxx
PAIRING_CODE=CUSTOM8CHAR
SESSION_ID=default
```

### 4. Jalankan Bot
```bash
npm start
```
Masukkan **Pairing Code** yang tampil di terminal ke WhatsApp di ponsel Anda:
> **WhatsApp** ➔ **Perangkat Tertaut** ➔ **Tautkan Perangkat** ➔ **Tautkan dengan nomor telepon saja**.

---

## 📝 Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).

<br>
<p align="center"><b>© 2026 Jarot.</b></p>
