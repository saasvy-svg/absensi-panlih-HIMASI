'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { 
  Vote, 
  CheckCircle2, 
  Clock, 
  Search, 
  Volume2, 
  RefreshCw, 
  Users, 
  AlertCircle, 
  Calendar, 
  Filter, 
  Check, 
  RotateCcw, 
  Megaphone, 
  X,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { getWIBDate } from '@/lib/utils';
import { createClient } from '@/utils/supabase/client';

export default function BilikSuaraPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [date, setDate] = useState(() => getWIBDate());
  const [search, setSearch] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'waiting' | 'voted' | 'absent'>('waiting');
  const [classFilter, setClassFilter] = useState('all');

  const [stats, setStats] = useState({
    totalDpt: 0,
    totalPresent: 0,
    votedCount: 0,
    waitingCount: 0,
    turnoutPercentage: 0,
  });

  const [presentList, setPresentList] = useState<any[]>([]);
  const [absentList, setAbsentList] = useState<any[]>([]);

  // Calling modal state
  const [callingStudent, setCallingStudent] = useState<any | null>(null);
  const [togglingNim, setTogglingNim] = useState<string | null>(null);

  const fetchQueue = async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/voting?date=${date}`);
      const data = await res.json();
      if (res.ok && data.success) {
        setStats(data.stats);
        setPresentList(data.presentList || []);
        setAbsentList(data.absentList || []);
      } else {
        toast.error(data.error || 'Gagal memuat antrean bilik suara');
      }
    } catch (e: any) {
      toast.error('Gagal terhubung ke server');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, [date]);

  // Realtime Supabase listener
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('bilik-suara-live')
      .on('broadcast', { event: 'attendance_checkin' }, () => {
        fetchQueue(true);
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendances' },
        () => {
          fetchQueue(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [date]);

  // Voice Announcement helper
  const handleCallVoter = (student: any) => {
    setCallingStudent(student);

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const text = `Panggilan pemilihan ketua HIMA. Kepada saudara ${student.name}, nomor induk mahasiswa ${student.nim.split('').join(' ')}, silakan menuju ke bilik suara sekarang.`;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'id-ID';
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.error('Speech synthesis error:', e);
      }
    }
    toast.info(`🔊 Memanggil: ${student.name} (${student.nim}) menuju bilik suara!`);
  };

  // Toggle Voted status
  const handleToggleVote = async (student: any, newStatus: boolean) => {
    setTogglingNim(student.nim);
    try {
      const res = await fetch('/api/admin/voting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nim: student.nim,
          has_voted: newStatus,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (newStatus) {
          toast.success(`🗳️ ${student.name} telah mencoblos!`);
        } else {
          toast.info(`Status mencoblos ${student.name} dibatalkan.`);
        }
        if (callingStudent && callingStudent.nim === student.nim) {
          setCallingStudent(null);
        }
        await fetchQueue(true);
      } else {
        toast.error(data.error || 'Gagal mengubah status mencoblos');
      }
    } catch (e: any) {
      toast.error('Terjadi kesalahan jaringan');
    } finally {
      setTogglingNim(null);
    }
  };

  // Filtered List calculation
  const rawList = filterTab === 'absent' ? absentList : presentList;
  const filteredList = rawList.filter((item) => {
    // Tab filter for presentList
    if (filterTab === 'waiting' && item.has_voted) return false;
    if (filterTab === 'voted' && !item.has_voted) return false;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchNim = item.nim?.toLowerCase().includes(q);
      const matchName = item.name?.toLowerCase().includes(q);
      if (!matchNim && !matchName) return false;
    }

    // Class filter
    if (classFilter !== 'all') {
      if (item.class_name !== classFilter) return false;
    }

    return true;
  });

  const uniqueClasses = Array.from(
    new Set([...presentList, ...absentList].map((i) => i.class_name).filter(Boolean))
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-xl bg-purple-50 text-purple-600 border border-purple-200">
              <Vote size={20} />
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-[#111827]">
              Antrean Bilik Suara (Pemira HIMASI)
            </h1>
          </div>
          <p className="text-xs text-[#6B7280]">
            Pantau kehadiran pemilih di lokasi, panggil nama menuju bilik suara, dan tandai yang sudah mencoblos.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Tanggal Filter */}
          <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-black/10 shadow-2xs">
            <Calendar size={14} className="text-gray-400" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="text-xs font-semibold text-gray-800 outline-hidden cursor-pointer"
            />
          </div>

          <button
            onClick={() => fetchQueue()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-gray-50 border border-black/10 text-gray-700 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin text-blue-600' : ''} />
            <span>Segarkan</span>
          </button>
        </div>
      </div>

      {/* METRIC CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-2xl border border-black/5 shadow-2xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-medium">Hadir di Lokasi</span>
            <Users size={16} className="text-blue-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-[#111827]">{stats.totalPresent}</span>
            <span className="text-xs text-gray-400">/ {stats.totalDpt} DPT</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Pemilih yang berhak mencoblos</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/20 shadow-2xs">
          <div className="flex items-center justify-between text-emerald-800 mb-2">
            <span className="text-xs font-bold">Sudah Mencoblos</span>
            <CheckCircle2 size={16} className="text-emerald-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-emerald-700">{stats.votedCount}</span>
            <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md">
              {stats.turnoutPercentage}%
            </span>
          </div>
          <p className="text-[11px] text-emerald-600/80 mt-1">Surat suara telah digunakan</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200/80 bg-amber-50/20 shadow-2xs">
          <div className="flex items-center justify-between text-amber-800 mb-2">
            <span className="text-xs font-bold">Menunggu Giliran</span>
            <Clock size={16} className="text-amber-600" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-amber-700">{stats.waitingCount}</span>
            <span className="text-xs text-amber-800">Antrean Aktif</span>
          </div>
          <p className="text-[11px] text-amber-600/80 mt-1">Siap dipanggil ke bilik suara</p>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-black/5 shadow-2xs">
          <div className="flex items-center justify-between text-gray-500 mb-2">
            <span className="text-xs font-medium">Belum Hadir</span>
            <AlertCircle size={16} className="text-gray-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-gray-600">{stats.totalDpt - stats.totalPresent}</span>
            <span className="text-xs text-gray-400">Mahasiswa / Dosen</span>
          </div>
          <p className="text-[11px] text-gray-400 mt-1">Belum melakukan presensi hari ini</p>
        </div>
      </div>

      {/* CALLING MODAL POPUP */}
      {callingStudent && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-purple-200 space-y-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center mx-auto shadow-inner">
              <Megaphone size={32} className="animate-bounce" />
            </div>

            <div>
              <span className="inline-block px-3 py-1 bg-purple-50 text-purple-700 text-xs font-bold rounded-full border border-purple-200 mb-2">
                PANGGILAN KE BILIK SUARA
              </span>
              <h2 className="text-2xl font-extrabold text-[#111827]">
                {callingStudent.name}
              </h2>
              <p className="text-sm font-mono text-purple-700 font-bold mt-1">
                NIM: {callingStudent.nim} • {callingStudent.class_name}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                Hadir pukul {callingStudent.check_in_time?.slice(0, 8)} WIB (Antrean #{callingStudent.queue_number})
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleCallVoter(callingStudent)}
                className="py-3 px-4 rounded-xl border border-purple-300 text-purple-700 font-bold text-xs hover:bg-purple-50 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Volume2 size={16} />
                <span>Ulangi Panggilan</span>
              </button>

              <button
                type="button"
                disabled={togglingNim === callingStudent.nim}
                onClick={() => handleToggleVote(callingStudent, true)}
                className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Check size={16} />
                <span>Sudah Mencoblos</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setCallingStudent(null)}
              className="text-xs text-gray-400 hover:text-gray-700 font-semibold cursor-pointer"
            >
              Tutup Jendela Ini
            </button>
          </div>
        </div>
      )}

      {/* FILTER & TABS */}
      <div className="bg-white p-4 rounded-2xl border border-black/5 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-gray-100/80 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
            <button
              onClick={() => setFilterTab('waiting')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterTab === 'waiting'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Menunggu Giliran ({stats.waitingCount})
            </button>

            <button
              onClick={() => setFilterTab('voted')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterTab === 'voted'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Sudah Mencoblos ({stats.votedCount})
            </button>

            <button
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterTab === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Semua yang Hadir ({presentList.length})
            </button>

            <button
              onClick={() => setFilterTab('absent')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                filterTab === 'absent'
                  ? 'bg-gray-700 text-white shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Belum Hadir ({absentList.length})
            </button>
          </div>

          {/* Search & Class Filter */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari NIM atau Nama..."
                className="w-full bg-[#F8F9FA] focus:bg-white pl-9 pr-3 py-1.5 rounded-xl border border-gray-200 text-xs text-gray-800 outline-hidden transition-all"
              />
            </div>

            <select
              value={classFilter}
              onChange={(e) => setClassFilter(e.target.value)}
              className="bg-[#F8F9FA] px-3 py-1.5 rounded-xl border border-gray-200 text-xs text-gray-700 font-semibold outline-hidden cursor-pointer"
            >
              <option value="all">Semua Angkatan</option>
              {uniqueClasses.map((cls) => (
                <option key={cls} value={cls}>
                  {cls}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* TABLE SECTION */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500 space-y-2">
            <Loader2 size={28} className="animate-spin mx-auto text-blue-600" />
            <p className="text-xs font-semibold">Memuat data antrean bilik suara...</p>
          </div>
        ) : filteredList.length === 0 ? (
          <div className="p-12 text-center text-gray-400 space-y-2">
            <Vote size={32} className="mx-auto text-gray-300" />
            <p className="text-sm font-semibold text-gray-600">Tidak ada data pemilih yang sesuai</p>
            <p className="text-xs text-gray-400">
              {search ? 'Coba ubah kata kunci pencarian Anda.' : 'Belum ada data pada kategori ini.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8F9FA] text-gray-500 font-bold border-b border-black/5">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">No</th>
                  {filterTab !== 'absent' && <th className="py-3 px-4 w-28 text-center">Jam Hadir</th>}
                  <th className="py-3 px-4 w-32">NIM / NIP</th>
                  <th className="py-3 px-4">Nama Pemilih</th>
                  <th className="py-3 px-4 w-32 text-center">Angkatan</th>
                  <th className="py-3 px-4 w-36 text-center">Status Coblos</th>
                  <th className="py-3 px-4 w-44 text-right">Aksi Panitia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filteredList.map((item, idx) => {
                  const isVoted = Boolean(item.has_voted);
                  const isAbsent = filterTab === 'absent';
                  return (
                    <tr
                      key={item.id || item.nim}
                      className={`hover:bg-blue-50/30 transition-colors ${
                        isVoted ? 'bg-emerald-50/10' : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center font-bold text-gray-500">
                        {item.queue_number || idx + 1}
                      </td>

                      {!isAbsent && (
                        <td className="py-3 px-4 text-center font-mono text-gray-600 whitespace-nowrap">
                          {item.check_in_time?.slice(0, 8)} WIB
                        </td>
                      )}

                      <td className="py-3 px-4 font-mono font-bold text-[#111827]">
                        {item.nim}
                      </td>

                      <td className="py-3 px-4 font-bold text-[#111827]">
                        {item.name}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-gray-100 text-gray-700">
                          {item.class_name}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center">
                        {isAbsent ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200">
                            Belum Hadir
                          </span>
                        ) : isVoted ? (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                            <Check size={12} />
                            Sudah Nyoblos
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1">
                            <Clock size={12} />
                            Menunggu Giliran
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        {isAbsent ? (
                          <span className="text-[11px] text-gray-400 italic">Menunggu Presensi</span>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            {!isVoted ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleCallVoter(item)}
                                  className="p-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg border border-purple-200 transition-all cursor-pointer"
                                  title="Panggil nama siswa dengan suara ke bilik suara"
                                >
                                  <Volume2 size={14} />
                                </button>

                                <button
                                  type="button"
                                  disabled={togglingNim === item.nim}
                                  onClick={() => handleToggleVote(item, true)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[11px] shadow-2xs transition-all cursor-pointer"
                                >
                                  <Check size={12} />
                                  <span>Sudah Nyoblos</span>
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={togglingNim === item.nim}
                                onClick={() => handleToggleVote(item, false)}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 hover:bg-rose-50 hover:text-rose-700 text-gray-500 rounded-lg font-semibold text-[10px] border border-gray-200 transition-all cursor-pointer"
                                title="Batalkan status sudah mencoblos jika keliru"
                              >
                                <RotateCcw size={10} />
                                <span>Batal</span>
                              </button>
                            )}
                          </div>
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
    </div>
  );
}
