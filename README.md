# Two Frames — Virtual Photobooth

Photobooth web untuk dua orang yang berada di tempat berbeda. Ambil foto bersama, edit hasilnya, lalu unduh photostrip.

## Menjalankan aplikasi

Aplikasi ini tidak memerlukan proses build atau instalasi dependency. Jalankan sebagai situs lokal melalui server HTTP, misalnya dengan ekstensi **Live Server** di Visual Studio Code, lalu buka alamat yang diberikan server.

Kamera memerlukan konteks aman. `localhost` dapat digunakan untuk pengembangan di perangkat yang sama. Untuk mencoba dari dua perangkat, deploy aplikasi ke hosting yang menyediakan HTTPS. Pastikan ketiga file aplikasi berada di folder yang sama:

- `index.html`
- `styles.css`
- `app.js`

Aplikasi memuat PeerJS, Fabric.js, dan font dari CDN, jadi koneksi internet diperlukan.

## Membuat dan bergabung ke room

1. Buka aplikasi dan izinkan akses kamera.
2. Pilih *Buat room*. Host akan mendapat link dan kode room.
3. Bagikan link atau kode tersebut kepada partner.
4. Partner membuka link undangan, atau memasukkan kode pada halaman awal, lalu memilih **Masuk**.
5. Setelah kedua kamera tersambung, pilih timer dan mulai sesi foto.

Kode room berlaku selama room host masih aktif. Jika host menutup halaman atau koneksi room terputus, buat room baru.

## Fitur

- Preview kamera berdampingan dengan komposisi yang mengikuti foto yang ditangkap.
- Timer 3, 5, atau 10 detik.
- Empat foto disusun menjadi photostrip.
- Editor kolaboratif dengan pilihan frame, filter, teks, stiker, dan gambar tangan.
- Unduh hasil sebagai PNG.

## Struktur file

| File | Isi |
| --- | --- |
| `index.html` | Struktur halaman dan pemuatan library eksternal. |
| `styles.css` | Tampilan, layout responsif, dan animasi antarmuka. |
| `app.js` | Koneksi room, kamera, pengambilan foto, sinkronisasi editor, dan ekspor. |

## Teknologi

- HTML, CSS, dan JavaScript tanpa framework.
- [PeerJS](https://peerjs.com/) untuk koneksi antar-browser.
- [Fabric.js](http://fabricjs.com/) untuk editor canvas.

## Catatan penggunaan

- Kedua user perlu mengizinkan akses kamera dan menjaga halaman tetap terbuka selama sesi.
- Koneksi antarperangkat memerlukan internet. Jaringan atau firewall tertentu dapat membatasi koneksi peer-to-peer.
- Hasil foto dibuat di browser dan diunduh ke perangkat user.
