'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { 
  BarChart3, 
  Vote, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  Plus, 
  Minus, 
  Lock, 
  Unlock, 
  FileSpreadsheet, 
  Trophy, 
  Users, 
  FileText, 
  Save, 
  RotateCcw, 
  Trash2, 
  Edit3, 
  TrendingUp,
  Loader2
} from 'lucide-react';
import { getWIBDate } from '@/lib/utils';
import { QuickCountCandidate } from '@/types/database';

export default function QuickCountPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [date, setDate] = useState(() => getWIBDate());

  // Quick count state
  const [candidates, setCandidates] = useState<QuickCountCandidate[]>([]);
  const [invalidVotes, setInvalidVotes] = useState(0);
  const [notes, setNotes] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Stats from server
  const [stats, setStats] = useState({
    totalDpt: 0,
    totalPresent: 0,
    votedVotersCount: 0,
    totalValidVotes: 0,
    totalInvalidVotes: 0,
    totalBallotsCounted: 0,
    discrepancy: 0,
    isBalanced: true,
  });

  // Modal paslon state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<QuickCountCandidate | null>(null);
  const [formNumber, setFormNumber] = useState('');
  const [formName, setFormName] = useState('');
  const [formTagline, setFormTagline] = useState('');
  const [formPhoto, setFormPhoto] = useState('');

  // ───────────────────────────────────────────────────────────────────
  // RACE CONDITION PREVENTION REFS
  // 1. candidatesRef  — canonical source of truth that is ALWAYS latest
  // 2. invalidRef     — same for invalid votes
  // 3. notesRef       — same for notes
  // 4. isLockedRef    — same for lock
  // 5. saveQueueRef   — queued state waiting to be saved once current save finishes
  // 6. isSavingRef    — mutex: only one in-flight save at a time
  // 7. lastActionRef  — timestamp of last user click; polling skips if < 5 s ago
  // 8. saveSeqRef     — monotonically increasing counter to discard stale responses
  // ───────────────────────────────────────────────────────────────────
  const candidatesRef = useRef<QuickCountCandidate[]>([]);
  const invalidRef = useRef(0);
  const notesRef = useRef('');
  const isLockedRef = useRef(false);
  const saveQueueRef = useRef<{
    candidates: QuickCountCandidate[];
    invalid: number;
    notes: string;
    locked: boolean;
  } | null>(null);
  const isSavingRef = useRef(false);
  const lastActionRef = useRef(0);
  const saveSeqRef = useRef(0);

  // Keep refs in sync with state
  useEffect(() => { candidatesRef.current = candidates; }, [candidates]);
  useEffect(() => { invalidRef.current = invalidVotes; }, [invalidVotes]);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);

  // Sound effect generator using Web Audio API
  const playClickSound = (type: 'add' | 'sub' | 'win') => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'add') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } else if (type === 'sub') {
        osc.frequency.setValueAtTime(329.63, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === 'win') {
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1046.5, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
      }
    } catch (e) {}
  };

  const fetchQuickCount = useCallback(async (silent = false) => {
    // Don't let polling overwrite state if user clicked recently (within 5 s)
    if (silent && Date.now() - lastActionRef.current < 5000) return;

    if (!silent) setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/quick-count?date=${date}`);
      const data = await res.json();
      if (res.ok && data.success) {
        // Only update candidates from server when not currently saving
        // to avoid overwriting optimistic local increments
        if (!isSavingRef.current) {
          setCandidates(data.config.candidates || []);
          setInvalidVotes(data.config.invalid_votes || 0);
        }
        setNotes(data.config.notes || '');
        setIsLocked(Boolean(data.config.is_locked));
        setLastUpdated(data.config.updated_at);
        setStats(data.stats);
      } else if (!silent) {
        toast.error(data.error || 'Gagal memuat data Quick Count');
      }
    } catch (e) {
      if (!silent) toast.error('Gagal terhubung ke server');
    } finally {
      setLoading(false);
      if (!silent) setRefreshing(false);
    }
  }, [date]);

  useEffect(() => {
    fetchQuickCount();
  }, [fetchQuickCount]);

  // Periodic polling every 15 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchQuickCount(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchQuickCount]);

  // ─── Core save function with mutex + queue ─────────────────────────
  // Only one save runs at a time. If another save comes in while one
  // is in progress, it is stored in saveQueueRef and executed after.
  // This guarantees the server always receives the LATEST state and
  // out-of-order responses are discarded via saveSeqRef.
  // ──────────────────────────────────────────────────────────────────
  const executeSave = useCallback(async (
    cands: QuickCountCandidate[],
    inv: number,
    nts: string,
    lck: boolean
  ): Promise<boolean> => {
    isSavingRef.current = true;
    const mySeq = ++saveSeqRef.current; // capture sequence number for this call

    try {
      const res = await fetch('/api/admin/quick-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidates: cands,
          invalid_votes: inv,
          notes: nts,
          is_locked: lck,
        }),
      });
      const data = await res.json();

      // Discard this response if a newer save already finished
      if (mySeq < saveSeqRef.current) return true;

      if (res.ok && data.success) {
        // Update stats optimistically from what we just saved
        const totalValid = cands.reduce((s, c) => s + (c.votes || 0), 0);
        const totalBallots = totalValid + inv;
        setStats((prev) => ({
          ...prev,
          totalValidVotes: totalValid,
          totalInvalidVotes: inv,
          totalBallotsCounted: totalBallots,
          discrepancy: totalBallots - prev.votedVotersCount,
          isBalanced: totalBallots === prev.votedVotersCount,
        }));
        return true;
      } else {
        toast.error(data.error || 'Gagal menyimpan perubahan');
        return false;
      }
    } catch (e) {
      if (mySeq >= saveSeqRef.current) toast.error('Gagal memperbarui data');
      return false;
    } finally {
      isSavingRef.current = false;

      // Process queued save if any
      const queued = saveQueueRef.current;
      if (queued) {
        saveQueueRef.current = null;
        executeSave(queued.candidates, queued.invalid, queued.notes, queued.locked);
      }
    }
  }, []);

  const saveQuickCountState = useCallback((
    newCandidates: QuickCountCandidate[],
    newInvalid: number,
    newNotes: string,
    newLocked: boolean
  ) => {
    if (isSavingRef.current) {
      // Queue the latest state; previous queue is overwritten (we only need latest)
      saveQueueRef.current = { candidates: newCandidates, invalid: newInvalid, notes: newNotes, locked: newLocked };
      return Promise.resolve(true);
    }
    return executeSave(newCandidates, newInvalid, newNotes, newLocked);
  }, [executeSave]);

  // ─── Vote manipulation (race-condition safe) ───────────────────────
  // Uses functional setState so each click reads the PREVIOUS state,
  // not a stale closure. The updated array is captured via a local ref
  // and passed to save immediately.
  // ──────────────────────────────────────────────────────────────────
  const handleVoteChange = useCallback((candidateId: string, delta: number) => {
    if (isLockedRef.current) {
      toast.error('Perhitungan suara sedang dikunci');
      return;
    }

    lastActionRef.current = Date.now();
    let captured: QuickCountCandidate[] = [];

    setCandidates((prev) => {
      captured = prev.map((c) =>
        c.id === candidateId
          ? { ...c, votes: Math.max(0, (c.votes || 0) + delta) }
          : c
      );
      return captured;
    });

    playClickSound(delta > 0 ? 'add' : 'sub');

    // Schedule save after state flush (next microtask)
    // captured is already set synchronously by the updater above
    Promise.resolve().then(() => {
      saveQuickCountState(captured, invalidRef.current, notesRef.current, isLockedRef.current);
    });
  }, [saveQuickCountState]);

  const handleInvalidChange = useCallback((delta: number) => {
    if (isLockedRef.current) {
      toast.error('Perhitungan suara sedang dikunci');
      return;
    }

    lastActionRef.current = Date.now();
    const nextInvalid = Math.max(0, invalidRef.current + delta);
    setInvalidVotes(nextInvalid);
    playClickSound(delta > 0 ? 'add' : 'sub');
    saveQuickCountState(candidatesRef.current, nextInvalid, notesRef.current, isLockedRef.current);
  }, [saveQuickCountState]);

  const handleToggleLock = useCallback(async () => {
    const nextLocked = !isLockedRef.current;
    setIsLocked(nextLocked);
    const ok = await saveQuickCountState(candidatesRef.current, invalidRef.current, notesRef.current, nextLocked);
    if (ok) {
      toast.success(nextLocked ? 'Perhitungan suara berhasil dikunci' : 'Kunci perhitungan suara dibuka');
    }
  }, [saveQuickCountState]);

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    const ok = await saveQuickCountState(candidates, invalidVotes, notes, isLocked);
    setSavingNotes(false);
    if (ok) {
      toast.success('Catatan & Berita Acara berhasil disimpan');
    }
  };

  const handleSyncToSheets = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/quick-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_to_sheets' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Hasil Quick Count berhasil disinkronkan ke Google Sheets!');
      } else {
        toast.error(data.error || 'Gagal sinkronisasi ke Google Sheets');
      }
    } catch (e) {
      toast.error('Gagal terhubung ke Google Sheets API');
    } finally {
      setSyncing(false);
    }
  };

  // Add / Edit Candidate Modal
  const openAddModal = () => {
    setEditingCandidate(null);
    setFormNumber(String(candidates.length + 1).padStart(2, '0'));
    setFormName('');
    setFormTagline('');
    setFormPhoto('');
    setIsModalOpen(true);
  };

  const openEditModal = (c: QuickCountCandidate) => {
    setEditingCandidate(c);
    setFormNumber(c.number);
    setFormName(c.name);
    setFormTagline(c.tagline || '');
    setFormPhoto(c.photo_url || '');
    setIsModalOpen(true);
  };

  const handleSaveModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toast.error('Nama pasangan calon wajib diisi');
      return;
    }

    let updated: QuickCountCandidate[];
    if (editingCandidate) {
      updated = candidatesRef.current.map((c) =>
        c.id === editingCandidate.id
          ? {
              ...c,
              number: formNumber.trim(),
              name: formName.trim(),
              tagline: formTagline.trim(),
              photo_url: formPhoto.trim() || undefined,
            }
          : c
      );
    } else {
      const newPaslon: QuickCountCandidate = {
        id: `paslon-${Date.now()}`,
        number: formNumber.trim() || String(candidatesRef.current.length + 1).padStart(2, '0'),
        name: formName.trim(),
        tagline: formTagline.trim(),
        photo_url: formPhoto.trim() || undefined,
        votes: 0,
      };
      updated = [...candidatesRef.current, newPaslon];
    }

    setCandidates(updated);
    setIsModalOpen(false);
    await saveQuickCountState(updated, invalidRef.current, notesRef.current, isLockedRef.current);
    toast.success(editingCandidate ? 'Paslon berhasil diperbarui' : 'Paslon baru berhasil ditambahkan');
  };

  const handleDeleteCandidate = async (id: string, name: string) => {
    if (isLockedRef.current) {
      toast.error('Buka kunci terlebih dahulu untuk menghapus paslon');
      return;
    }
    if (!confirm(`Hapus ${name} dari daftar paslon? Suara yang sudah diinput akan terhapus.`)) {
      return;
    }
    const updated = candidatesRef.current.filter((c) => c.id !== id);
    setCandidates(updated);
    await saveQuickCountState(updated, invalidRef.current, notesRef.current, isLockedRef.current);
    toast.success('Paslon berhasil dihapus');
  };

  const handleResetVotes = async () => {
    if (!confirm('PERINGATAN: Apakah Anda yakin ingin mereset semua hitungan suara kembali ke 0? Tindakan ini tidak dapat dibatalkan.')) {
      return;
    }
    const resetCandidates = candidatesRef.current.map((c) => ({ ...c, votes: 0 }));
    setCandidates(resetCandidates);
    setInvalidVotes(0);
    await saveQuickCountState(resetCandidates, 0, notesRef.current, isLockedRef.current);
    toast.success('Seluruh hitungan suara berhasil direset ke 0');
  };

  // Computations
  const totalBallots = candidates.reduce((s, c) => s + (c.votes || 0), 0) + invalidVotes;
  const sortedCandidates = [...candidates].sort((a, b) => (b.votes || 0) - (a.votes || 0));
  const leadingCandidate = sortedCandidates[0];
  const isTie = sortedCandidates.length > 1 && sortedCandidates[0]?.votes > 0 && sortedCandidates[0]?.votes === sortedCandidates[1]?.votes;

  const candidateColors = [
    { bg: 'from-blue-600 to-indigo-700', badge: 'bg-blue-500/20 text-blue-400 border-blue-500/30', bar: 'bg-blue-500' },
    { bg: 'from-amber-600 to-orange-700', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30', bar: 'bg-amber-500' },
    { bg: 'from-emerald-600 to-teal-700', badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', bar: 'bg-emerald-500' },
    { bg: 'from-rose-600 to-pink-700', badge: 'bg-rose-500/20 text-rose-400 border-rose-500/30', bar: 'bg-rose-500' },
  ];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-sm">Memuat Quick Count Pemira...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Top Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800 backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white shadow-lg shadow-indigo-500/20">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Quick Count Pemira HIMASI</h1>
            {isLocked ? (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-medium">
                <Lock className="w-3 h-3" /> Terkunci
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                <Unlock className="w-3 h-3" /> Hitung Aktif
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Penghitungan suara cepat dan tabulasi dinamis Pemilihan Ketua HIMASI 2026/2027
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Tanggal */}
          <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-300">
            <span className="text-xs text-slate-500 mr-2 font-mono">Tanggal:</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer text-xs"
            />
          </div>

          {/* Refresh */}
          <button
            onClick={() => fetchQuickCount()}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition border border-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>

          {/* Lock / Unlock */}
          <button
            onClick={handleToggleLock}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition border ${
              isLocked
                ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            {isLocked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            <span>{isLocked ? 'Buka Kunci' : 'Kunci Hitungan'}</span>
          </button>

          {/* Sync to Google Sheets Tab */}
          <button
            onClick={handleSyncToSheets}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-purple-600/25 transition disabled:opacity-50"
          >
            <FileSpreadsheet className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span>{syncing ? 'Menyinkronkan...' : 'Sinkronkan ke Sheets'}</span>
          </button>
        </div>
      </div>

      {/* Reconciliation & Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
        <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total DPT</span>
            <Users className="w-4 h-4 text-slate-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono">{stats.totalDpt}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Mahasiswa + Dosen</div>
        </div>

        <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Kehadiran Absensi</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white font-mono">{stats.totalPresent}</div>
          <div className="text-[11px] text-emerald-400 mt-0.5">
            {stats.totalDpt > 0 ? ((stats.totalPresent / stats.totalDpt) * 100).toFixed(1) : 0}% DPT Hadir
          </div>
        </div>

        <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Masuk Bilik Suara</span>
            <Vote className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-indigo-400 font-mono">{stats.votedVotersCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Sudah mencoblos</div>
        </div>

        <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Suara Terhitung</span>
            <TrendingUp className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-400 font-mono">{totalBallots}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {stats.totalValidVotes} Sah • {invalidVotes} Tidak Sah
          </div>
        </div>

        {/* Audit Status Box */}
        <div
          className={`col-span-2 md:col-span-4 lg:col-span-1 p-4 rounded-2xl border ${
            stats.isBalanced
              ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400'
              : 'bg-rose-950/20 border-rose-500/30 text-rose-400'
          }`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-wider">Audit Kotak</span>
            {stats.isBalanced ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            )}
          </div>
          <div className="mt-2 text-xl font-bold font-mono">
            {stats.isBalanced ? 'KLOP 100%' : `SELISIH ${Math.abs(stats.discrepancy)}`}
          </div>
          <div className="text-[11px] mt-0.5 opacity-80">
            {stats.isBalanced ? 'Kertas suara = Pemilih bilik' : stats.discrepancy > 0 ? 'Surat suara lebih banyak' : 'Surat suara belum dihitung'}
          </div>
        </div>
      </div>

      {/* Leaderboard Result Banner */}
      {totalBallots > 0 && leadingCandidate && (
        <div className="relative overflow-hidden bg-gradient-to-r from-indigo-950/60 via-purple-950/40 to-slate-900/60 p-5 rounded-2xl border border-indigo-500/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-indigo-300">
                  {isTie ? 'Perolehan Suara Seimbang' : 'Memimpin Perolehan Suara Sementara'}
                </div>
                <div className="text-lg font-bold text-white mt-0.5">
                  {isTie
                    ? 'Dua atau lebih pasangan calon memperoleh suara yang sama'
                    : `Paslon ${leadingCandidate.number} - ${leadingCandidate.name}`}
                </div>
              </div>
            </div>
            {!isTie && (
              <div className="text-right sm:border-l sm:border-slate-800 sm:pl-6">
                <div className="text-2xl font-black text-amber-400 font-mono">
                  {leadingCandidate.votes}{' '}
                  <span className="text-xs font-medium text-slate-400">
                    ({((leadingCandidate.votes / totalBallots) * 100).toFixed(1)}%)
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">Total Perolehan Suara</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Candidate Voting Board */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Papan Suara Pasangan Calon</h2>
            <p className="text-xs text-slate-400">Gunakan tombol +1, +5, atau -1 untuk memasukkan hasil surat suara</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={openAddModal}
              disabled={isLocked}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold border border-slate-700 transition disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Tambah Paslon</span>
            </button>
            <button
              onClick={handleResetVotes}
              disabled={isLocked}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/20 hover:bg-rose-950/40 text-rose-400 rounded-xl text-xs font-semibold border border-rose-900/30 transition disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset 0</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {candidates.map((candidate, idx) => {
            const color = candidateColors[idx % candidateColors.length];
            const pct = totalBallots > 0 ? ((candidate.votes / totalBallots) * 100).toFixed(1) : '0';
            const isLeading = leadingCandidate?.id === candidate.id && candidate.votes > 0 && !isTie;

            return (
              <div
                key={candidate.id}
                className={`relative flex flex-col justify-between bg-slate-900/80 rounded-2xl border p-5 transition-all ${
                  isLeading
                    ? 'border-indigo-500/50 shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-500/30'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Header Card */}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-xl shadow-md font-mono">
                        {candidate.number}
                      </div>
                      <div>
                        <h3 className="font-bold text-white text-base leading-tight">{candidate.name}</h3>
                        {candidate.tagline && (
                          <p className="text-xs text-slate-400 mt-0.5 line-clamp-1 italic">
                            &quot;{candidate.tagline}&quot;
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(candidate)}
                        disabled={isLocked}
                        className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition disabled:opacity-30"
                        title="Edit Paslon"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {candidates.length > 2 && (
                        <button
                          onClick={() => handleDeleteCandidate(candidate.id, candidate.name)}
                          disabled={isLocked}
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition disabled:opacity-30"
                          title="Hapus Paslon"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Photo if available */}
                  {candidate.photo_url && (
                    <div className="mt-3 overflow-hidden rounded-xl h-36 bg-slate-950 border border-slate-800">
                      <img
                        src={candidate.photo_url}
                        alt={candidate.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  {/* Big Number & Percentage */}
                  <div className="mt-5 text-center bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                    <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold">
                      Total Suara
                    </div>
                    <div className="text-5xl font-black text-white font-mono tracking-tight my-1">
                      {candidate.votes}
                    </div>
                    <div className="text-sm font-bold text-indigo-400">{pct}% Suara</div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-3 w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                    <div
                      className={`h-full ${color.bar} transition-all duration-300 rounded-full`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Tally Actions */}
                <div className="mt-5 pt-4 border-t border-slate-800/80 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => handleVoteChange(candidate.id, -1)}
                      disabled={isLocked || candidate.votes === 0}
                      className="flex items-center justify-center gap-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold transition border border-slate-700 active:scale-95 disabled:opacity-30"
                    >
                      <Minus className="w-4 h-4" />
                      <span>1</span>
                    </button>
                    <button
                      onClick={() => handleVoteChange(candidate.id, 1)}
                      disabled={isLocked}
                      className="flex items-center justify-center gap-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition shadow-md shadow-indigo-600/20 active:scale-95 disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      <span>1</span>
                    </button>
                    <button
                      onClick={() => handleVoteChange(candidate.id, 5)}
                      disabled={isLocked}
                      className="flex items-center justify-center gap-1 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-sm font-bold transition shadow-md shadow-purple-600/20 active:scale-95 disabled:opacity-50"
                    >
                      <Plus className="w-4 h-4" />
                      <span>5</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Invalid Votes Card */}
          <div className="flex flex-col justify-between bg-slate-900/60 rounded-2xl border border-dashed border-slate-700 p-5">
            <div>
              <div className="flex items-center gap-2.5 text-slate-400">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h3 className="font-bold text-white text-base">Suara Tidak Sah / Rusak</h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Kertas suara yang dicoblos tidak sah, rusak, atau kosong
              </p>

              <div className="mt-5 text-center bg-slate-950/60 p-4 rounded-xl border border-slate-800">
                <div className="text-xs text-slate-400 uppercase tracking-widest font-semibold">
                  Jumlah Rusak
                </div>
                <div className="text-5xl font-black text-amber-400 font-mono tracking-tight my-1">
                  {invalidVotes}
                </div>
                <div className="text-sm font-bold text-slate-400">
                  {totalBallots > 0 ? ((invalidVotes / totalBallots) * 100).toFixed(1) : 0}% dari total
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-800 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleInvalidChange(-1)}
                  disabled={isLocked || invalidVotes === 0}
                  className="flex items-center justify-center gap-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold transition border border-slate-700 active:scale-95 disabled:opacity-30"
                >
                  <Minus className="w-4 h-4" />
                  <span>1</span>
                </button>
                <button
                  onClick={() => handleInvalidChange(1)}
                  disabled={isLocked}
                  className="flex items-center justify-center gap-1 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-bold transition shadow-md shadow-amber-600/20 active:scale-95 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  <span>1</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notes & Witness Statement (Berita Acara) */}
      <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-400" />
            <h3 className="font-bold text-white text-sm">Catatan Penghitungan & Berita Acara Saksi</h3>
          </div>
          <button
            onClick={handleSaveNotes}
            disabled={savingNotes}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md transition disabled:opacity-50"
          >
            <Save className={`w-3.5 h-3.5 ${savingNotes ? 'animate-spin' : ''}`} />
            <span>{savingNotes ? 'Menyimpan...' : 'Simpan Catatan'}</span>
          </button>
        </div>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Tuliskan berita acara, kehadiran saksi paslon 01 & 02, nomor surat suara bermasalah, atau catatan jalannya pemira..."
          className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition"
        />
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>Catatan ini otomatis diekspor ke Google Sheets saat Anda menekan tombol &quot;Sinkronkan ke Sheets&quot;.</span>
          {lastUpdated && <span>Pembaruan terakhir: {lastUpdated}</span>}
        </div>
      </div>

      {/* Candidate Modal (Add / Edit) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">
                {editingCandidate ? 'Edit Data Paslon' : 'Tambah Pasangan Calon Baru'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-3.5">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Nomor Urut</label>
                <input
                  type="text"
                  value={formNumber}
                  onChange={(e) => setFormNumber(e.target.value)}
                  placeholder="01"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Nama Pasangan Calon</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contoh: Fulan & Fulana"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">Tagline / Visi Singkat</label>
                <input
                  type="text"
                  value={formTagline}
                  onChange={(e) => setFormTagline(e.target.value)}
                  placeholder="Contoh: Sinergi Menuju HIMASI Berdaya"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1">URL Foto (Opsional)</label>
                <input
                  type="url"
                  value={formPhoto}
                  onChange={(e) => setFormPhoto(e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-indigo-600/20"
                >
                  Simpan Paslon
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
