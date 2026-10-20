'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { 
  Users, 
  UserPlus, 
  FileSpreadsheet, 
  Search, 
  Trash2, 
  Loader2, 
  Upload, 
  X, 
  CheckCircle2, 
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { Student } from '@/types/database';

export default function MahasiswaPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Single Add Form
  const [formData, setFormData] = useState({
    nim: '',
    name: '',
    class_name: '',
    phone: '',
  });

  // Bulk Import Form
  const [bulkText, setBulkText] = useState('');

  useEffect(() => {
    fetchStudents();
  }, [search, selectedClass]);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (selectedClass !== 'all') params.append('class', selectedClass);

      const res = await fetch(`/api/admin/students?${params.toString()}`);
      const data = await res.json();
      if (res.ok) {
        setStudents(data.data || []);
      }
    } catch (e) {
      toast.error('Gagal mengambil data mahasiswa');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nim || !formData.name || !formData.class_name) {
      toast.error('NIM, Nama, dan Angkatan wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Data mahasiswa berhasil ditambahkan!');
        setShowAddModal(false);
        setFormData({ nim: '', name: '', class_name: '', phone: '' });
        fetchStudents();
      } else {
        toast.error(data.error || 'Gagal menyimpan data');
      }
    } catch (e) {
      toast.error('Terjadi kesalahan jaringan');
    } finally {
      setSaving(false);
    }
  };

  const handleBulkImport = async () => {
    if (!bulkText.trim()) {
      toast.error('Format teks CSV / Excel tidak boleh kosong');
      return;
    }

    // Parse lines: NIM, Nama, Angkatan
    const lines = bulkText.split('\n').filter((l) => l.trim().length > 0);
    const parsedStudents: { nim: string; name: string; class_name: string }[] = [];

    for (const line of lines) {
      // Split by comma or tab (Excel copy-paste uses tabs)
      const parts = line.includes('\t') ? line.split('\t') : line.split(',');
      if (parts.length >= 2) {
        const nim = parts[0]?.trim();
        const name = parts[1]?.trim();
        const class_name = parts[2]?.trim() || 'Umum';
        if (nim && name) {
          parsedStudents.push({ nim, name, class_name });
        }
      }
    }

    if (parsedStudents.length === 0) {
      toast.error('Format teks tidak valid. Gunakan format: NIM, Nama, Angkatan');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: parsedStudents }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || `Berhasil import ${parsedStudents.length} mahasiswa!`);
        setShowImportModal(false);
        setBulkText('');
        fetchStudents();
      } else {
        toast.error(data.error || 'Gagal mengimpor data');
      }
    } catch (e) {
      toast.error('Terjadi kesalahan sistem saat impor');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus data mahasiswa "${name}"?`)) return;

    try {
      const res = await fetch(`/api/admin/students?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Data mahasiswa berhasil dihapus');
        fetchStudents();
      } else {
        toast.error('Gagal menghapus data');
      }
    } catch (e) {
      toast.error('Terjadi kesalahan');
    }
  };

  const handleSeedDemoData = async () => {
    const demo = [
      { nim: '25101001', name: 'Ahmad Fauzi Pratama', class_name: 'Angkatan 25' },
      { nim: '25101002', name: 'Budi Santoso', class_name: 'Angkatan 25' },
      { nim: '25101003', name: 'Citra Dewi Lestari', class_name: 'Angkatan 25' },
      { nim: '25101004', name: 'Dimas Anggara', class_name: 'Angkatan 25' },
      { nim: '26101001', name: 'Eka Putri Rahayu', class_name: 'Angkatan 26' },
      { nim: '26101002', name: 'Farhan Muhammad', class_name: 'Angkatan 26' },
      { nim: '26101003', name: 'Gita Savitri', class_name: 'Angkatan 26' },
    ];

    setSaving(true);
    try {
      const res = await fetch('/api/admin/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ students: demo }),
      });
      if (res.ok) {
        toast.success('7 Data mahasiswa Angkatan 25 & 26 berhasil di-generate!');
        fetchStudents();
      }
    } catch (e) {
      toast.error('Gagal seed data');
    } finally {
      setSaving(false);
    }
  };

  // Get unique classes for filter
  const classesList = Array.from(new Set(students.map((s) => s.class_name))).filter(Boolean);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] tracking-tight flex items-center gap-2.5">
            <Users className="text-[#2563EB]" size={26} />
            Data Master Mahasiswa
          </h1>
          <p className="text-xs text-[#6B7280] mt-1">
            Daftar data mahasiswa yang digunakan untuk validasi presensi otomatis (Smart NIM Lookup).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white text-[#4B5563] hover:text-[#111827] border border-gray-200 rounded-xl text-xs font-semibold shadow-2xs hover:bg-gray-50 transition-all"
          >
            <FileSpreadsheet size={15} className="text-emerald-600" />
            <span>Import CSV / Excel</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-bold shadow-xs transition-all"
          >
            <UserPlus size={15} />
            <span>Tambah Mahasiswa</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-black/5 shadow-2xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari NIM atau Nama..."
            className="w-full pl-9 pr-4 py-2 bg-[#F8F9FA] border border-gray-200 rounded-xl text-xs text-[#111827] outline-hidden focus:border-[#2563EB] focus:bg-white transition-all"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Classes Filter */}
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="bg-[#F8F9FA] border border-gray-200 text-xs font-semibold text-[#4B5563] rounded-xl px-3 py-2 outline-hidden focus:border-[#2563EB]"
          >
            <option value="all">Semua Angkatan ({students.length})</option>
            {classesList.map((cls) => (
              <option key={cls} value={cls}>
                Angkatan {cls}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
            <p className="text-xs text-gray-500 font-medium">Memuat data mahasiswa...</p>
          </div>
        ) : students.length === 0 ? (
          <div className="py-16 text-center">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="font-bold text-sm text-[#111827]">Belum Ada Data Mahasiswa</h3>
            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
              Silakan tambahkan data mahasiswa satu per satu atau import dari file CSV/Excel agar sistem absensi dapat memvalidasi NIM.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8F9FA] border-b border-black/5 text-[#6B7280] font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">No</th>
                  <th className="py-3 px-4">NIM</th>
                  <th className="py-3 px-4">Nama Lengkap</th>
                  <th className="py-3 px-4">Angkatan</th>
                  <th className="py-3 px-4">No. HP</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {students.map((item, idx) => (
                  <tr key={item.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="py-3 px-4 text-gray-400 font-mono">{idx + 1}</td>
                    <td className="py-3 px-4 font-mono font-bold text-[#111827]">{item.nim}</td>
                    <td className="py-3 px-4 font-semibold text-[#111827]">{item.name}</td>
                    <td className="py-3 px-4">
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200">
                        {item.class_name}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-500">{item.phone || '-'}</td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => handleDelete(item.id, item.name)}
                        className="text-gray-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-all"
                        title="Hapus Mahasiswa"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL TAMBAH MAHASISWA */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-3 border-b border-black/5">
              <h3 className="font-bold text-base text-[#111827] flex items-center gap-2">
                <UserPlus size={18} className="text-[#2563EB]" />
                Tambah Mahasiswa Baru
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddSingle} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">
                  Nomor Induk Mahasiswa (NIM) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.nim}
                  onChange={(e) => setFormData({ ...formData, nim: e.target.value })}
                  placeholder="Contoh: 21102045"
                  required
                  className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-[#111827] outline-hidden focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">
                  Nama Lengkap Mahasiswa <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Contoh: Muhammad Budi Pratama"
                  required
                  className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-[#111827] outline-hidden focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">
                  Angkatan <span className="text-rose-500">*</span>
                </label>
                <div className="flex gap-2 mb-2">
                  {['Angkatan 25', 'Angkatan 26'].map((batch) => (
                    <button
                      key={batch}
                      type="button"
                      onClick={() => setFormData({ ...formData, class_name: batch })}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                        formData.class_name === batch
                          ? 'bg-[#2563EB] text-white border-[#2563EB]'
                          : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200'
                      }`}
                    >
                      {batch}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={formData.class_name}
                  onChange={(e) => setFormData({ ...formData, class_name: e.target.value })}
                  placeholder="Contoh: Angkatan 25 atau 25 (A/B otomatis dibersihkan)"
                  required
                  className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-[#111827] outline-hidden focus:border-[#2563EB]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">
                  No. WhatsApp (Opsional)
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="0812xxxxxxxx"
                  className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-[#111827] outline-hidden focus:border-[#2563EB]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-black/5">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#4B5563] text-xs font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold rounded-xl shadow-xs"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Mahasiswa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL IMPORT MASSAL CSV/EXCEL */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-3 border-b border-black/5">
              <h3 className="font-bold text-base text-[#111827] flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-emerald-600" />
                Import Massal dari Excel / CSV
              </h3>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 pt-4">
              <div className="bg-[#EFF6FF] border border-[#BFDBFE] p-3 rounded-xl text-xs text-[#1E3A8A]">
                <p className="font-bold mb-1">Format Baris (Berdasarkan Angkatan):</p>
                <p className="font-mono text-[11px]">
                  NIM, Nama Lengkap, Angkatan<br />
                  Contoh:<br />
                  25101001, Ahmad Fauzi Pratama, Angkatan 25<br />
                  25101002, Budi Santoso, 25<br />
                  26101001, Siti Rahma, Angkatan 26
                </p>
                <p className="mt-1 text-gray-500 text-[10px]">
                  *Kode kelas huruf (misal A25, B25) otomatis dibersihkan menjadi Angkatan 25 murni.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">
                  Tempelkan (Paste) Teks Data:
                </label>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={8}
                  placeholder={`25101001, Ahmad Fauzi Pratama, Angkatan 25\n25101002, Budi Santoso, Angkatan 25\n26101001, Siti Rahma, Angkatan 26`}
                  className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl p-3 font-mono text-xs text-[#111827] outline-hidden focus:border-[#2563EB]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-black/5">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#4B5563] text-xs font-semibold rounded-xl"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleBulkImport}
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5"
                >
                  <Upload size={14} />
                  <span>{saving ? 'Mengimpor...' : 'Proses Import Sekarang'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
