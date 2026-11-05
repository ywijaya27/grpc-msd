# Panduan Instalasi GRPC - Backend GAS + Frontend GitHub Pages

Arsitektur baru: **Google Apps Script hanya jadi API (JSON)**, tampilan ada di **GitHub Pages**.
Database tetap spreadsheet lama (`1pD10p7Rp8oD-1BExZXeTh6O3KVH5sOz85sELmnd-xnc`). `SYS_USERS` dan `REF_PLANNER` **tidak perlu diisi ulang**, dan `setupAppEnvironment` **tidak perlu dijalankan lagi**.

---

## BAGIAN 1 - Backend (Google Apps Script)

1. Buka project Apps Script GRPC yang sudah ada.
2. Buka file **Code.gs** -> hapus semua isinya -> tempel seluruh isi **Code.gs** baru. Simpan.
3. (Disarankan) Buka **Project Settings** -> centang *Show "appsscript.json" manifest file in editor*. Buka `appsscript.json`, ganti isinya dengan `appsscript.json` dari paket. Simpan.
4. File HTML lama (**Index**, **Javascript**, **Stylesheet**) sudah tidak dipakai. Boleh dihapus setelah semuanya berjalan.
5. **Deploy** -> **Manage deployments** -> ikon pensil pada deployment yang ada:
   - **Version:** New version
   - **Execute as:** Me
   - **Who has access:** **Anyone** (wajib; kalau bukan Anyone, frontend tidak bisa memanggil API)
   - Klik **Deploy**. URL `/exec` tetap sama.
6. Salin URL `/exec`.
7. **Tes backend:** buka URL `/exec` di browser. Harus muncul JSON seperti:
   `{"success":true,"data":{"app":"GRPC Logistics System","version":"3.0.0","status":"online"}, ...}`
   Kalau muncul halaman login Google atau error, cek lagi pengaturan akses di langkah 5.

> Jika Anda membuat deployment BARU (bukan edit yang lama), URL `/exec` berubah. Gunakan URL yang baru.

---

## BAGIAN 2 - Frontend (isi konfigurasi)

1. Ekstrak `grpc-app.zip`. Hasilnya folder **`grpc-app`** yang langsung berisi `index.html`, `css`, `js`.
2. Buka `grpc-app/js/config.js` dengan Notepad. Ganti:
   ```js
   GAS_URL: 'GANTI_DENGAN_URL_EXEC_ANDA'
   ```
   dengan URL `/exec` dari Bagian 1 (tetap dalam tanda kutip). Simpan.

---

## BAGIAN 3 - Deploy ke GitHub Pages

> Folder yang di-`git init` adalah **`grpc-app`** itu sendiri, yaitu folder yang isinya langsung `index.html`. Jangan masuk lebih dalam, jangan naik satu level.

1. Pasang Git: https://git-scm.com/download/win (Windows, pengaturan default). Cek: `git --version`
2. Buat akun GitHub (https://github.com). Username Anda menjadi bagian URL: `username.github.io`.
3. Atur identitas Git (sekali saja):
   ```
   git config --global user.name "Nama Anda"
   git config --global user.email "email@akun-github.com"
   ```
4. Di GitHub: **+** -> **New repository** -> nama mis. `grpc-app`, **Public**, **jangan** centang README/.gitignore/license -> Create.
5. Buka folder `grpc-app` di File Explorer, klik address bar, ketik `powershell`, Enter. Jalankan `dir` dan pastikan **`index.html` terlihat di daftar teratas**, bersama folder `css` dan `js`.
6. Jalankan satu per satu:
   ```
   git init
   git add .
   git commit -m "Upload pertama"
   git branch -M main
   git remote add origin https://github.com/USERNAME/grpc-app.git
   git push -u origin main
   ```
   Saat diminta password, pakai **Personal Access Token** (https://github.com/settings/tokens -> Generate new token (classic) -> centang **repo**). Saat paste token, layar terlihat kosong; itu normal.
7. Di repo GitHub: **Settings** -> **Pages** -> Source: *Deploy from a branch*, Branch: `main` `/ (root)` -> Save. Centang **Enforce HTTPS**.
8. Tunggu 1-2 menit. Situs live di `https://USERNAME.github.io/grpc-app/`.

**Update di kemudian hari** (dari folder `grpc-app`):
```
git add .
git commit -m "Deskripsi perubahan"
git push
```
Lalu Ctrl+Shift+R di browser.

---

## Tes setelah online

1. Buka URL GitHub Pages -> login dengan akun yang ada di `SYS_USERS`.
2. Cek Material Master tampil, simpan satu inspeksi (foto + checklist), cek baris dan foto muncul di spreadsheet/Drive.
3. Tes cetak dan kirim email laporan.
4. Jika ada masalah: F12 -> tab **Console** dan **Network**, kirim screenshot.

## Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| "URL backend belum diisi" | `js/config.js` belum diedit | Isi `GAS_URL`, push ulang |
| "Koneksi server gagal" / error CORS | Akses deployment bukan **Anyone**, atau belum New version | Ulangi Bagian 1 langkah 5 |
| Halaman 404 di GitHub Pages | `index.html` tidak di root repo | Cek repo di browser; push ulang dari folder `grpc-app` |
| Halaman tanpa styling | Folder `css/` `js/` tidak ikut | Push dari terminal (bukan Upload files di web) |
| Tampil versi lama | Cache | Ctrl+Shift+R |
| "Sesi berakhir" | Sesi login 6 jam habis | Login ulang |

## Catatan perubahan perilaku

- **Email laporan:** karena akses sekarang "Anyone", Apps Script tidak bisa lagi mengetahui email pengunjung. Jika alamat tujuan kosong, laporan dikirim ke kolom `email` akun yang login di `SYS_USERS` (jika ada), atau ke email pemilik script.
- Kamera/webcam berjalan di halaman HTTPS biasa (bukan di dalam iframe Apps Script).
- Isi repository GitHub Pages bersifat publik. Isinya hanya kode tampilan dan URL `/exec`; tidak ada password, token, atau ID spreadsheet.
