'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { 
  LayoutDashboard, 
  Users, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  RefreshCw, 
  FileSpreadsheet, 
  Search, 
  Calendar, 
  Filter,
  Loader2,
  AlertTriangle,
  UserCheck,
  X,
  ShieldCheck
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';

export default function AdminMonitoringPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingSheets, setSyncingSheets] = useState(false);

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedClass, setSelectedClass] = useState('all');
  const [activeTab, setActiveTab] = useState<'all' | 'present' | 'absent'>('all');
  const [search, setSearch] = useState('');

  // State untuk modal Absenkan Manual oleh Admin
  const [showManualModal, setShowManualModal] = useState(false);
  const [selectedStudentForManual, setSelectedStudentForManual] = useState<any>(null);
  const [manualStatus, setManualStatus] = useState<'Hadir' | 'Izin' | 'Sakit'>('Hadir');
  const [manualNotes, setManualNotes] = useState('Diabsenkan oleh Admin (Kendala HP/Perangkat)');
  const [savingManual, setSavingManual] = useState(false);
  const [modalSearchStudent, setModalSearchStudent] = useState('');

  const [metrics, setMetrics] = useState({
    totalStudents: 0,
    totalPresent: 0,
    totalAbsent: 0,
    attendancePercentage: 0,
    presentList: [] as any[],
    absentList: [] as any[],
    allCombined: [] as any[],
  });

  const [classesList, setClassesList] = useState<string[]>([]);

  useEffect(() => {
    fetchMonitoringData();
    // Auto-refresh every 10 seconds for real-time monitoring
    const interval = setInterval(() => {
      fetchMonitoringData(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [date, selectedClass]);

  const fetchMonitoringData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('date', date);
      if (selectedClass !== 'all') params.append('class', selectedClass);

      const res = await fetch(`/api/admin/monitoring?${params.toString()}`);
      const data = await res.json();

      if (res.ok) {
        setMetrics({
          totalStudents: data.totalStudents,
          totalPresent: data.totalPresent,
          totalAbsent: data.totalAbsent,
          attendancePercentage: data.attendancePercentage,
          presentList: data.presentList || [],
          absentList: data.absentList || [],
          allCombined: data.allCombined || [],
        });

        // Extract class list from combined
        const uniqueClasses = Array.from(
          new Set((data.allCombined || []).map((item: any) => item.class_name))
        ).filter(Boolean) as string[];
        if (uniqueClasses.length > 0 && classesList.length === 0) {
          setClassesList(uniqueClasses);
        }
      }
    } catch (e) {
      if (!isBackground) toast.error('Gagal mengambil data monitoring');
    } finally {
      if (!isBackground) setLoading(false);
      setRefreshing(false);
    }
  };

  const handleManualSyncToSheets = async () => {
    setSyncingSheets(true);
    try {
      const res = await fetch(`/api/admin/sheets/sync?date=${date}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Berhasil sinkron ke Google Sheets!');
      } else {
        toast.error(data.error || 'Gagal sinkron. Periksa konfigurasi Sheet ID.');
      }
    } catch (e) {
      toast.error('Gagal menghubungi API Google Sheets');
    } finally {
      setSyncingSheets(false);
    }
  };

  // Submit presensi manual oleh admin (override IP limit)
  const handleSaveManualAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForManual?.name) {
      toast.error('Pilih partisipan terlebih dahulu');
      return;
    }

    const isDosen =
      selectedStudentForManual.class_name === 'Dosen' ||
      Boolean(selectedStudentForManual.lecturer_name);

    const finalNim =
      selectedStudentForManual.nim ||
      (isDosen
        ? `DOSEN-${selectedStudentForManual.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 15)}`
        : '');

    setSavingManual(true);
    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: selectedStudentForManual.id?.startsWith?.('dosen-')
            ? null
            : selectedStudentForManual.id || null,
          nim: finalNim,
          name: selectedStudentForManual.name,
          class_name: isDosen ? 'Dosen' : selectedStudentForManual.class_name,
          lecturer_name: isDosen ? selectedStudentForManual.name : undefined,
          status: manualStatus,
          notes: manualNotes.trim() || 'Diabsenkan oleh Admin (Kendala HP/Perangkat)',
          admin_override: true,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success(`Berhasil mencatat presensi ${selectedStudentForManual.name} (${manualStatus})!`);
        setShowManualModal(false);
        fetchMonitoringData();
      } else {
        toast.error(data.error || 'Gagal menyimpan presensi');
      }
    } catch (err: any) {
      toast.error('Terjadi kesalahan jaringan');
    } finally {
      setSavingManual(false);
    }
  };

  // Filter list based on tab and search
  const currentList =
    activeTab === 'present'
      ? metrics.presentList
      : activeTab === 'absent'
      ? metrics.absentList
      : metrics.allCombined;

  const filteredList = currentList.filter((item) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      item.name?.toLowerCase().includes(q) ||
      item.nim?.toLowerCase().includes(q) ||
      item.class_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-[#111827] tracking-tight flex items-center gap-2">
              <LayoutDashboard className="text-[#2563EB]" size={26} />
              Monitoring Kehadiran Mahasiswa
            </h1>
            <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Live Real-Time
            </div>
          </div>
          <p className="text-xs text-[#6B7280]">
            Pantau kehadiran, lakukan override absensi jika HP mahasiswa terkendala, dan sinkronkan ke Google Sheets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Tombol Absenkan Manual */}
          <button
            onClick={() => {
              setSelectedStudentForManual(null);
              setManualStatus('Hadir');
              setManualNotes('Diabsenkan oleh Admin (Kendala HP/Perangkat)');
              setShowManualModal(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
            title="Absenkan mahasiswa secara manual jika mengalami kendala perangkat"
          >
            <UserCheck size={14} />
            <span>+ Absenkan Manual</span>
          </button>

          <button
            onClick={() => {
              setRefreshing(true);
              fetchMonitoringData();
            }}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white text-[#4B5563] hover:text-[#111827] border border-gray-200 rounded-xl text-xs font-semibold shadow-2xs hover:bg-gray-50 transition-all cursor-pointer"
            title="Refresh Data Sekarang"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>Segarkan</span>
          </button>

          <button
            onClick={handleManualSyncToSheets}
            disabled={syncingSheets}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
            title="Siapkan dan sinkronkan roster lengkap mahasiswa ke Google Sheets"
          >
            <FileSpreadsheet size={15} />
            <span>{syncingSheets ? 'Menyinkronkan...' : 'Sinkronkan Roster Sheets'}</span>
          </button>
        </div>
      </div>

      {/* STATS METRIC CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Mahasiswa */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-black/5 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#6B7280]">Total Mahasiswa</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center">
              <Users size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#111827]">{metrics.totalStudents}</div>
          <p className="text-[11px] text-gray-400 mt-0.5">Terdaftar di master data</p>
        </div>

        {/* Total Hadir */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-black/5 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-emerald-700">Sudah Presensi</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600">{metrics.totalPresent}</div>
          <p className="text-[11px] text-emerald-600/70 mt-0.5">Tercatat di sistem</p>
        </div>

        {/* Belum Hadir */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-black/5 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-amber-700">Belum Hadir</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-600">{metrics.totalAbsent}</div>
          <p className="text-[11px] text-amber-600/70 mt-0.5">Belum submit presensi</p>
        </div>

        {/* Persentase Kehadiran */}
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-black/5 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[#2563EB]">Persentase Hadir</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center font-bold text-xs">
              %
            </div>
          </div>
          <div className="text-2xl font-bold text-[#2563EB]">
            {metrics.attendancePercentage}%
          </div>
          <div className="w-full bg-gray-100 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-[#2563EB] h-full rounded-full transition-all duration-500"
              style={{ width: `${metrics.attendancePercentage}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white p-4 rounded-2xl border border-black/5 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Filter Tanggal */}
          <div className="flex items-center gap-2 bg-[#F8F9FA] px-3 py-2 rounded-xl border border-black/5 w-full sm:w-auto">
            <Calendar size={15} className="text-[#6B7280]" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-xs font-semibold text-[#111827] outline-hidden cursor-pointer"
            />
          </div>

          {/* Filter Angkatan / Dosen */}
          <div className="flex items-center gap-2 bg-[#F8F9FA] px-3 py-2 rounded-xl border border-black/5 w-full sm:w-auto">
            <Filter size={15} className="text-[#6B7280]" />
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="bg-transparent text-xs font-semibold text-[#111827] outline-hidden cursor-pointer"
            >
              <option value="all">Semua Kategori (Mahasiswa & Dosen)</option>
              <option value="Dosen">Dosen</option>
              {classesList
                .filter((cls) => cls !== 'Dosen')
                .map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Pencarian Mahasiswa */}
        <div className="relative w-full md:w-72">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input
            type="text"
            placeholder="Cari nama atau NIM..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 bg-[#F8F9FA] focus:bg-white border border-gray-200 focus:border-[#2563EB] rounded-xl text-xs font-medium text-[#111827] outline-hidden transition-all placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* TABS STATUS */}
      <div className="flex items-center gap-2 border-b border-black/5 pb-2">
        <button
          onClick={() => setActiveTab('all')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'all'
              ? 'bg-[#2563EB] text-white shadow-2xs'
              : 'bg-white text-[#4B5563] hover:bg-gray-100 border border-black/5'
          }`}
        >
          Semua Data ({metrics.allCombined.length})
        </button>
        <button
          onClick={() => setActiveTab('present')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'present'
              ? 'bg-emerald-600 text-white shadow-2xs'
              : 'bg-white text-[#4B5563] hover:bg-gray-100 border border-black/5'
          }`}
        >
          Sudah Presensi ({metrics.presentList.length})
        </button>
        <button
          onClick={() => setActiveTab('absent')}
          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'absent'
              ? 'bg-amber-600 text-white shadow-2xs'
              : 'bg-white text-[#4B5563] hover:bg-gray-100 border border-black/5'
          }`}
        >
          Belum Hadir ({metrics.absentList.length})
        </button>
      </div>

      {/* ATTENDANCE MONITORING TABLE */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
            <p className="text-xs text-gray-500 font-medium">Memuat data absensi...</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="py-20 text-center">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="font-bold text-sm text-[#111827]">Tidak Ada Data yang Cocok</h3>
            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
              {metrics.totalStudents === 0
                ? 'Belum ada data master mahasiswa di sistem. Silakan isi terlebih dahulu di tab Data Mahasiswa.'
                : 'Tidak ada mahasiswa yang sesuai dengan filter atau kata kunci pencarian.'}
            </p>
            {metrics.totalStudents === 0 && (
              <Link
                href="/admin/mahasiswa"
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 bg-[#2563EB] text-white text-xs font-bold rounded-xl shadow-xs"
              >
                Ke Menu Data Mahasiswa
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8F9FA] border-b border-black/5 text-[#6B7280] font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">No</th>
                  <th className="py-3 px-4">NIM</th>
                  <th className="py-3 px-4">Nama Mahasiswa</th>
                  <th className="py-3 px-4">Angkatan</th>
                  <th className="py-3 px-4">Dosen</th>
                  <th className="py-3 px-4">Waktu Presensi</th>
                  <th className="py-3 px-4">Status Kehadiran</th>
                  <th className="py-3 px-4">Keterangan</th>
                  <th className="py-3 px-4 text-center">Aksi Admin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filteredList.map((item, idx) => {
                  const isPresent = item.status && item.status !== 'Belum Hadir';

                  return (
                    <tr
                      key={item.id || item.nim + idx}
                      className={`hover:bg-blue-50/40 transition-colors ${
                        !isPresent ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-gray-400 font-mono">{idx + 1}</td>
                      <td className="py-3 px-4 font-mono font-bold text-[#111827]">{item.nim}</td>
                      <td className="py-3 px-4 font-semibold text-[#111827]">{item.name}</td>
                      <td className="py-3 px-4">
                        <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-bold border border-blue-200">
                          {item.class_name}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {item.lecturer_name ? (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold text-[11px] border border-indigo-200">
                            {item.lecturer_name}
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-gray-600">
                        {item.check_in_time ? (
                          <span className="font-semibold text-[#111827]">
                            {item.check_in_time.slice(0, 5)} WIB
                          </span>
                        ) : (
                          <span className="text-gray-400 italic">-</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {item.status === 'Hadir' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
                            <CheckCircle2 size={12} />
                            Hadir
                          </span>
                        )}
                        {item.status === 'Izin' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800 font-bold text-[11px]">
                            Izin
                          </span>
                        )}
                        {item.status === 'Sakit' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 font-bold text-[11px]">
                            Sakit
                          </span>
                        )}
                        {(!item.status || item.status === 'Belum Hadir') && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[11px]">
                            <Clock size={12} />
                            Belum Hadir
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-500 max-w-xs truncate">
                        {item.notes || '-'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {!isPresent ? (
                          <button
                            onClick={() => {
                              setSelectedStudentForManual(item);
                              setManualStatus('Hadir');
                              setManualNotes('Diabsenkan oleh Admin (Kendala HP/Perangkat)');
                              setShowManualModal(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-blue-50 hover:bg-blue-100 text-[#2563EB] hover:text-[#1D4ED8] text-[11px] font-bold border border-blue-200 transition-all cursor-pointer shadow-2xs"
                            title="Bantu absenkan mahasiswa ini jika mengalami kendala perangkat"
                          >
                            <UserCheck size={12} />
                            <span>Absenkan</span>
                          </button>
                        ) : (
                          <span className="text-[11px] text-emerald-600 font-semibold inline-flex items-center gap-1">
                            <CheckCircle2 size={12} />
                            Tercatat
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL ABSENKAN MANUAL OLEH ADMIN */}
      {showManualModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-3 border-b border-black/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center">
                  <UserCheck size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#111827]">Absenkan Partisipan Manual</h3>
                  <p className="text-[10px] text-gray-400">Override presensi mahasiswa atau dosen oleh admin</p>
                </div>
              </div>
              <button
                onClick={() => setShowManualModal(false)}
                className="text-gray-400 hover:text-gray-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveManualAttendance} className="space-y-4 pt-4">
              {/* Jika dibuka dari tombol atas (belum pilih partisipan) */}
              {!selectedStudentForManual?.name ? (
                <div>
                  <label className="block text-xs font-semibold text-[#374151] mb-1">
                    Pilih Partisipan yang Belum Hadir (Mahasiswa / Dosen):
                  </label>
                  <input
                    type="text"
                    placeholder="Ketik untuk filter nama atau NIM..."
                    value={modalSearchStudent}
                    onChange={(e) => setModalSearchStudent(e.target.value)}
                    className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl px-3 py-2 text-xs mb-2 text-[#111827] outline-hidden focus:border-[#2563EB]"
                  />
                  <select
                    required
                    onChange={(e) => {
                      const found = metrics.allCombined.find(
                        (s) => (s.nim && s.nim === e.target.value) || s.name === e.target.value
                      );
                      if (found) setSelectedStudentForManual(found);
                    }}
                    className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-[#111827] outline-hidden focus:border-[#2563EB] cursor-pointer"
                  >
                    <option value="">-- Pilih Mahasiswa / Dosen ({metrics.absentList.length} belum absen) --</option>
                    {metrics.allCombined
                      .filter((s) => {
                        if (!modalSearchStudent) return true;
                        const q = modalSearchStudent.toLowerCase();
                        return s.name?.toLowerCase().includes(q) || s.nim?.toLowerCase().includes(q);
                      })
                      .map((s) => (
                        <option key={s.nim || s.name} value={s.nim || s.name}>
                          [{s.class_name}] {s.name} {s.nim ? `(${s.nim})` : ''} - [{s.status || 'Belum Hadir'}]
                        </option>
                      ))}
                  </select>
                </div>
              ) : (
                <div className="bg-[#EFF6FF] border border-[#BFDBFE] p-3 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-[#1E3A8A]">{selectedStudentForManual.name}</p>
                    <p className="text-[11px] font-mono text-[#2563EB]">
                      {selectedStudentForManual.nim ? `NIM/NIP: ${selectedStudentForManual.nim} • ` : ''}
                      Kategori: {selectedStudentForManual.class_name}
                    </p>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-blue-100 text-[#1E3A8A] font-bold text-[10px]">
                    {selectedStudentForManual.class_name}
                  </span>
                </div>
              )}

              {/* Status Presensi */}
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1.5">
                  Pilih Status Kehadiran:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Hadir', 'Izin', 'Sakit'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setManualStatus(opt)}
                      className={`py-2 px-3 text-xs font-bold rounded-xl border transition-all text-center cursor-pointer ${
                        manualStatus === opt
                          ? 'bg-[#2563EB] text-white border-[#2563EB] shadow-xs'
                          : 'bg-[#F8F9FA] hover:bg-gray-100 text-[#4B5563] border-gray-200'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Catatan / Alasan */}
              <div>
                <label className="block text-xs font-semibold text-[#374151] mb-1">
                  Catatan / Keterangan:
                </label>
                <textarea
                  value={manualNotes}
                  onChange={(e) => setManualNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-[#F8F9FA] border border-gray-200 rounded-xl px-3.5 py-2 text-xs text-[#111827] outline-hidden focus:border-[#2563EB]"
                  placeholder="Contoh: HP lowbat / kendala jaringan (diabsenkan manual oleh admin)"
                />
              </div>

              {/* Anti-Titip Absen Info */}
              <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl flex items-start gap-2 text-[11px] text-emerald-800">
                <ShieldCheck size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                <p>
                  <b>Bypass IP Aktif:</b> Presensi ini dicatat langsung oleh Admin dan tidak terhalang batas 1 IP/HP, serta otomatis meng-update status mahasiswa di database dan Google Sheets secara in-place.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-black/5">
                <button
                  type="button"
                  onClick={() => setShowManualModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#4B5563] text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingManual || !selectedStudentForManual}
                  className="px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {savingManual ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <UserCheck size={13} />
                      <span>Catat Presensi Sekarang</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
