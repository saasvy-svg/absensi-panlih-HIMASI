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
  Sparkles,
  Globe,
  Building,
  ArrowLeftRight,
  ShieldCheck,
  Filter
} from 'lucide-react';
import { Student } from '@/types/database';

export default function MahasiswaPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedType, setSelectedType] = useState('all'); // 'all' | 'online' | 'offline'

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
    attendance_type: 'offline' as 'online' | 'offline',
  });

  // Bulk Import Form
  const [bulkText, setBulkText] = useState('');

  useEffect(() => {
    fetchStudents();
  }, [search, selectedClass, selectedType]);

  const fetchStudents = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (selectedClass !== 'all') params.append('class', selectedClass);
      if (selectedType !== 'all') params.append('type', selectedType);

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

  const handleToggleAttendanceType = async (item: Student) => {
    const currentType = item.attendance_type === 'online' ? 'online' : 'offline';
    const nextType: 'online' | 'offline' = currentType === 'online' ? 'offline' : 'online';

    // Optimistic update
    setStudents((prev) =>
      prev.map((s) => (s.id === item.id ? { ...s, attendance_type: nextType } : s))
    );

    try {
      const res = await fetch('/api/admin/students', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.id,
          nim: item.nim,
          attendance_type: nextType,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          `${item.name} dialihkan ke mode ${nextType.toUpperCase()}!`,
          { duration: 2500 }
        );
      } else {
        toast.error(data.error || 'Gagal mengubah status');
        fetchStudents();
      }
    } catch (e) {
      toast.error('Gagal mengubah mode kehadiran');
      fetchStudents();
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
        setFormData({ nim: '', name: '', class_name: '', phone: '', attendance_type: 'offline' });
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

    // Parse lines: NIM, Nama, Angkatan, Tipe (Online/Offline)
    const lines = bulkText.split('\n').filter((l) => l.trim().length > 0);
    const parsedStudents: { nim: string; name: string; class_name: string; attendance_type: 'online' | 'offline' }[] = [];

    for (const line of lines) {
      // Split by comma or tab (Excel copy-paste uses tabs)
      const parts = line.includes('\t') ? line.split('\t') : line.split(',');
      if (parts.length >= 2) {
        const nim = parts[0]?.trim();
        const name = parts[1]?.trim();
        const class_name = parts[2]?.trim() || 'Umum';
        const rawType = parts[3]?.trim();
        const attType: 'online' | 'offline' =
          rawType && (rawType.toLowerCase() === 'online' || rawType.toLowerCase() === 'daring')
            ? 'online'
            : 'offline';

        if (nim && name) {
          parsedStudents.push({ nim, name, class_name, attendance_type: attType });
        }
      }
    }

    if (parsedStudents.length === 0) {
      toast.error('Format teks tidak valid. Gunakan format: NIM, Nama, Angkatan, [Online/Offline]');
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
        toast.success(data.message || `Berhasil import ${parsedStudents.length} mahasiswa! Data presensi lama tetap aman.`);
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

  // Get unique classes for filter
  const classesList = Array.from(new Set(students.map((s) => s.class_name))).filter(Boolean);

  const onlineCount = students.filter((s) => s.attendance_type === 'online').length;
  const offlineCount = students.length - onlineCount;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] tracking-tight flex items-center gap-2.5">
            <Users className="text-[#2563EB]" size={26} />
            Data Master Mahasiswa & Status Pemilih
          </h1>
          <p className="text-xs text-[#6B7280] mt-1">
            Kelola data mahasiswa, angkatan, serta klasifikasi mode presensi (Online E-Voting / Offline Tatap Muka).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white text-[#4B5563] hover:text-[#111827] border border-gray-200 rounded-xl text-xs font-semibold shadow-2xs hover:bg-gray-50 transition-all cursor-pointer"
          >
            <FileSpreadsheet size={15} className="text-emerald-600" />
            <span>Import CSV / Excel</span>
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <UserPlus size={15} />
            <span>Tambah Mahasiswa</span>
          </button>
        </div>
      </div>

      {/* KPI Cards: Total, Online, Offline */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 bg-white rounded-2xl border border-black/5 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-500 uppercase">Total Mahasiswa Terdaftar</span>
            <div className="text-2xl font-extrabold text-[#111827] mt-0.5">{students.length}</div>
            <span className="text-[10px] text-gray-400">DPT Mahasiswa</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center font-bold">
            <Users size={20} />
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-purple-100 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-purple-700 uppercase">Mahasiswa Online</span>
            <div className="text-2xl font-extrabold text-purple-700 mt-0.5">{onlineCount}</div>
            <span className="text-[10px] text-purple-600">Berhak E-Voting Digital</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold">
            <Globe size={20} />
          </div>
        </div>

        <div className="p-4 bg-white rounded-2xl border border-black/5 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-gray-500 uppercase">Mahasiswa Offline</span>
            <div className="text-2xl font-extrabold text-[#111827] mt-0.5">{offlineCount}</div>
            <span className="text-[10px] text-gray-400">Presensi Fisik & Coblos TPS</span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center font-bold">
            <Building size={20} />
          </div>
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

        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          {/* Tipe Presensi Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-[#F8F9FA] border border-gray-200 text-xs font-semibold text-[#4B5563] rounded-xl px-3 py-2 outline-hidden focus:border-[#2563EB]"
          >
            <option value="all">Semua Tipe ({students.length})</option>
            <option value="online">Khusus Online ({onlineCount})</option>
            <option value="offline">Khusus Offline ({offlineCount})</option>
          </select>

          {/* Classes Filter */}
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="bg-[#F8F9FA] border border-gray-200 text-xs font-semibold text-[#4B5563] rounded-xl px-3 py-2 outline-hidden focus:border-[#2563EB]"
          >
            <option value="all">Semua Angkatan</option>
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
            <h3 className="font-bold text-sm text-[#111827]">Tidak Ada Data Mahasiswa</h3>
            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
              Tidak ada data yang cocok dengan kriteria pencarian atau filter yang dipilih.
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
                  <th className="py-3 px-4 text-center">Tipe Presensi</th>
                  <th className="py-3 px-4 text-center">Pindah Mode</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {students.map((item, idx) => {
                  const isOnline = item.attendance_type === 'online';
                  return (
                    <tr key={item.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="py-3 px-4 text-gray-400 font-mono">{idx + 1}</td>
                      <td className="py-3 px-4 font-mono font-bold text-[#111827]">{item.nim}</td>
                      <td className="py-3 px-4 font-semibold text-[#111827]">{item.name}</td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200">
                          {item.class_name}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                            isOnline
                              ? 'bg-purple-100 text-purple-800 border-purple-200'
                              : 'bg-gray-100 text-gray-700 border-gray-200'
                          }`}
                        >
                          {isOnline ? <Globe size={12} className="text-purple-600" /> : <Building size={12} className="text-gray-500" />}
                          <span>{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleAttendanceType(item)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                            isOnline
                              ? 'bg-gray-50 hover:bg-gray-100 text-gray-700 border-gray-200'
                              : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                          }`}
                          title={`Ubah status menjadi ${isOnline ? 'Offline' : 'Online'}`}
                        >
                          <ArrowLeftRight size={11} />
                          <span>Pindah ke {isOnline ? 'Offline' : 'Online'}</span>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => handleDelete(item.id, item.name)}
                          className="text-gray-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-all cursor-pointer"
                          title="Hapus Mahasiswa"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
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
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
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
                  placeholder="Contoh: 25120039"
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
                  {['Angkatan 2025', 'Angkatan 2026'].map((batch) => (
                    <button
                      key={batch}
                      type="button"
                      onClick={() => setFormData({ ...formData, class_name: batch })}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
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
                  placeholder="Contoh: Angkatan 2025"
                  required
                  className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl px-3.5 py-2 text-xs font-semibold text-[#111827] outline-hidden focus:border-[#2563EB]"
                />
              </div>

              {/* TIPE PRESENSI: ONLINE / OFFLINE */}
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">
                  Tipe Kehadiran & Hak Suara <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, attendance_type: 'offline' })}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      formData.attendance_type === 'offline'
                        ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200'
                    }`}
                  >
                    <Building size={14} />
                    <span>Offline (Fisik)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, attendance_type: 'online' })}
                    className={`py-2 px-3 text-xs font-bold rounded-xl border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      formData.attendance_type === 'online'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-200'
                    }`}
                  >
                    <Globe size={14} />
                    <span>Online (E-Voting)</span>
                  </button>
                </div>
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
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#4B5563] text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  {saving ? 'Menyimpan...' : 'Simpan Mahasiswa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL IMPORT MASSAL CSV/EXCEL DENGAN KOLOM ONLINE/OFFLINE */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-3 border-b border-black/5">
              <h3 className="font-bold text-base text-[#111827] flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-emerald-600" />
                Import Massal & Update Data Mahasiswa
              </h3>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 pt-4">
              <div className="bg-[#EFF6FF] border border-[#BFDBFE] p-3 rounded-xl text-xs text-[#1E3A8A] space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-blue-600" />
                  Format Baris Baru (Mendukung Status Online / Offline):
                </p>
                <p className="font-mono text-[11px] bg-white/70 p-2 rounded-lg border border-blue-200">
                  NIM, Nama Lengkap, Angkatan, Tipe (Online / Offline)<br />
                  <span className="text-gray-500 font-sans text-[10px] block mt-1">Contoh:</span>
                  25120001, Ahmad Fauzi Pratama, Angkatan 2025, Offline<br />
                  25120002, Budi Santoso, Angkatan 2025, Online<br />
                  26120001, Siti Rahma, Angkatan 2026, Online
                </p>
                <p className="text-[10px] text-gray-500 leading-relaxed">
                  *<b>Aman (Anti-Hilang Data):</b> Jika data mahasiswa lama ditimpa data baru, riwayat absensi dan data yang sudah ada sebelumnya <b>TIDAK AKAN HILANG</b>. Sistem otomatis mengenali pergantian tipe online/offline.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">
                  Tempelkan (Paste) Teks Data dari Excel / Spreadsheet:
                </label>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  rows={8}
                  placeholder={`25120001, Ahmad Fauzi Pratama, Angkatan 2025, Offline\n25120002, Budi Santoso, Angkatan 2025, Online\n26120001, Siti Rahma, Angkatan 2026, Online`}
                  className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl p-3 font-mono text-xs text-[#111827] outline-hidden focus:border-[#2563EB]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-black/5">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#4B5563] text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleBulkImport}
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
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
