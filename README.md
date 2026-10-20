# Portal Admin Absensi - Pemira HIMASI

Dashboard administrator untuk pengelolaan dan pemantauan sistem absensi Pemira HIMASI.

## Fitur Admin
- **Monitoring Kehadiran Realtime**: Pantau status hadir / belum hadir mahasiswa dan dosen secara langsung.
- **Absenkan Manual (Admin Override)**: Catat presensi manual bagi mahasiswa/dosen yang mengalami kendala perangkat/HP.
- **Master Data Mahasiswa**: Manajemen data mahasiswa, filter angkatan, dan impor massal dari file Excel / CSV.
- **Integrasi Google Sheets**: Multi-tab otomatis (Dosen, Angkatan 25, Angkatan 26, dst.) mulai kolom B4 dengan in-place update.
- **Pengaturan Tampilan & Dosen**: Kelola identitas kegiatan, logo, pengumuman, dan daftar dosen pengampu.

## Environment Variables
Salin berkas `.env.local.example` ke `.env.local` dan isi nilainya:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_SERVICE_ACCOUNT_KEY`

## Menjalankan di Lokal
```bash
npm install
npm run dev
```
Buka [http://localhost:3000/login](http://localhost:3000/login)
