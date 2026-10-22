'use client';

import { useState, useEffect, useRef } from 'react';
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
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Sparkles,
  Loader2,
  Globe,
  Check
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

  // Status sinkronisasi cloud: 'saved' | 'saving' | 'pending' | 'error'
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'pending' | 'error'>('saved');
  const hasLocalEditsRef = useRef<boolean>(false);
  const audioCtxRef = useRef<any>(null);

  // Refs to prevent race conditions on fast spam-clicks and prevent polling overwrites
  const latestCandidatesRef = useRef<QuickCountCandidate[]>([]);
  const latestInvalidRef = useRef<number>(0);
  const latestNotesRef = useRef<string>('');
  const latestLockedRef = useRef<boolean>(false);
  const lastActionTimeRef = useRef<number>(0);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const pendingSaveRef = useRef<boolean>(false);

  // Online Voting Stats
  const [onlineStats, setOnlineStats] = useState<{
    totalOnlineVoters: number;
    totalOnlineStudents: number;
    totalOnlineLecturers: number;
    onlineAttended: number;
    onlineVoted: number;
    onlineTurnoutPct: number;
    candidateTallies: Record<string, { number: string; name: string; votes: number }>;
    golputCount: number;
    totalOnlineVotesCast: number;
    isMerged: boolean;
  }>({
    totalOnlineVoters: 0,
    totalOnlineStudents: 0,
    totalOnlineLecturers: 0,
    onlineAttended: 0,
    onlineVoted: 0,
    onlineTurnoutPct: 0,
    candidateTallies: {},
    golputCount: 0,
    totalOnlineVotesCast: 0,
    isMerged: false,
  });
  const [mergingOnline, setMergingOnline] = useState(false);

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

  // Singleton AudioContext helper to prevent memory leak and browser audio limits on fast spam clicks
  const getAudioContext = () => {
    try {
      if (!audioCtxRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          audioCtxRef.current = new AudioCtx();
        }
      }
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        audioCtxRef.current.resume();
      }
      return audioCtxRef.current;
    } catch (e) {
      return null;
    }
  };

  // Sound effect generator using Web Audio API
  const playClickSound = (type: 'add' | 'sub' | 'win') => {
    try {
      const ctx = getAudioContext();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'add') {
        osc.frequency.setValueAtTime(587.33, now); // D5
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08); // A5
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'sub') {
        osc.frequency.setValueAtTime(329.63, now); // E4
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'win') {
        osc.frequency.setValueAtTime(523.25, now); // C5
        osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.2); // C6
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {
      // Audio not supported or blocked
    }
  };

  const fetchQuickCount = async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/quick-count?date=${date}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const serverCandidates: QuickCountCandidate[] = data.config.candidates || [];
        const serverInvalid = Number(data.config.invalid_votes) || 0;
        const serverNotes = data.config.notes || '';
        const serverLocked = Boolean(data.config.is_locked);

        // JIKA BACKGROUND POLLING (silent === true):
        // JANGAN PERNAH menimpa data paslon lokal yang sedang dihitung admin di tab ini!
        // Polling background HANYA memperbarui metrik kehadiran, bilik suara, dan agregat online.
        if (silent) {
          const curValid = latestCandidatesRef.current.reduce((s, c) => s + (c.votes || 0), 0);
          const curBallots = curValid + latestInvalidRef.current;
          const curVotedVoters = data.stats?.votedVotersCount || 0;
          const curDisc = curBallots - curVotedVoters;

          setStats((prev) => ({
            ...prev,
            ...data.stats,
            totalValidVotes: curValid,
            totalInvalidVotes: latestInvalidRef.current,
            totalBallotsCounted: curBallots,
            discrepancy: curDisc,
            isBalanced: curDisc === 0,
          }));

          if (data.onlineStats) {
            setOnlineStats(data.onlineStats);
          }
          return;
        }

        // JIKA MANUAL REFRESH DENGAN TOMBOL "Segarkan" DAN ADA PERUBAHAN LOKAL BELUM TERSIMPAN:
        if (hasLocalEditsRef.current && candidates.length > 0) {
          await executeSave();
          return;
        }

        // INITIAL LOAD ATAU MANUAL REFRESH BERSIH:
        latestCandidatesRef.current = serverCandidates;
        latestInvalidRef.current = serverInvalid;
        latestNotesRef.current = serverNotes;
        latestLockedRef.current = serverLocked;
        hasLocalEditsRef.current = false;

        setCandidates(serverCandidates);
        setInvalidVotes(serverInvalid);
        setNotes(serverNotes);
        setIsLocked(serverLocked);
        setLastUpdated(data.config.updated_at);
        setStats(data.stats);
        setSaveStatus('saved');
        if (data.onlineStats) {
          setOnlineStats(data.onlineStats);
        }
      } else {
        if (!silent) toast.error(data.error || 'Gagal memuat data Quick Count');
      }
    } catch (e) {
      if (!silent) toast.error('Gagal terhubung ke server');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleMergeOnlineVotes = async () => {
    if (isLocked) {
      toast.error('Perhitungan suara sedang dikunci');
      return;
    }
    if (!confirm(`Tambahkan ${onlineStats.totalOnlineVotesCast} perolehan suara online ke dalam papan hitungan paslon Quick Count?`)) {
      return;
    }

    setMergingOnline(true);
    try {
      const res = await fetch('/api/admin/quick-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'merge_online_votes' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Suara online berhasil digabungkan!');
        fetchQuickCount(false);
      } else {
        toast.error(data.error || 'Gagal menambahkan suara online');
      }
    } catch (e) {
      toast.error('Gagal terhubung ke server');
    } finally {
      setMergingOnline(false);
    }
  };

  const handleUnmergeOnlineVotes = async () => {
    if (isLocked) {
      toast.error('Perhitungan suara sedang dikunci');
      return;
    }
    if (!confirm('Tarik kembali / batalkan penambahan suara online dari Quick Count?')) {
      return;
    }

    setMergingOnline(true);
    try {
      const res = await fetch('/api/admin/quick-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unmerge_online_votes' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Suara online ditarik kembali!');
        fetchQuickCount(false);
      } else {
        toast.error(data.error || 'Gagal membatalkan suara online');
      }
    } catch (e) {
      toast.error('Gagal terhubung ke server');
    } finally {
      setMergingOnline(false);
    }
  };

  const handleResetOnlineVotes = async () => {
    if (isLocked) {
      toast.error('Perhitungan suara sedang dikunci');
      return;
    }
    if (!confirm('PERINGATAN TESTING: Reset seluruh suara online kembali ke 0? Mahasiswa online yang tadi sudah vote akan bisa mencoba mencoblos lagi.')) {
      return;
    }

    try {
      const res = await fetch('/api/admin/quick-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset_online_votes' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast.success(data.message || 'Suara online berhasil direset ke 0!');
        fetchQuickCount(false);
      } else {
        toast.error(data.error || 'Gagal mereset suara online');
      }
    } catch (e) {
      toast.error('Gagal terhubung ke server');
    }
  };

  // Initial load
  useEffect(() => {
    // Cek apakah ada backup lokal darurat jika refresh terjadi
    try {
      const backupStr = localStorage.getItem('himasi_qc_local_backup');
      if (backupStr) {
        const backup = JSON.parse(backupStr);
        if (backup && Array.isArray(backup.candidates) && backup.candidates.length > 0) {
          latestCandidatesRef.current = backup.candidates;
          latestInvalidRef.current = Number(backup.invalid_votes) || 0;
          setCandidates(backup.candidates);
          setInvalidVotes(Number(backup.invalid_votes) || 0);
        }
      }
    } catch (e) {}

    fetchQuickCount(false);
  }, [date]);

  // Periodic polling background every 12 seconds
  // HANYA mengupdate DPT, jumlah hadir, bilik suara, dan agregat online (tidak menimpa paslon lokal)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchQuickCount(true);
    }, 12000);
    return () => clearInterval(interval);
  }, [date]);

  // Cleanup & safety on page unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (hasLocalEditsRef.current || isSavingRef.current) {
        try {
          const payload = JSON.stringify({
            candidates: latestCandidatesRef.current,
            invalid_votes: latestInvalidRef.current,
            notes: latestNotesRef.current,
            is_locked: latestLockedRef.current,
          });
          navigator.sendBeacon?.('/api/admin/quick-count', new Blob([payload], { type: 'application/json' }));
        } catch (e) {}
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Save changes to server with concurrency lock and queueing
  const executeSave = async (): Promise<boolean> => {
    if (isSavingRef.current) {
      pendingSaveRef.current = true;
      return true;
    }
    isSavingRef.current = true;
    pendingSaveRef.current = false;
    setSaveStatus('saving');

    const payload = {
      candidates: latestCandidatesRef.current,
      invalid_votes: latestInvalidRef.current,
      notes: latestNotesRef.current,
      is_locked: latestLockedRef.current,
    };

    try {
      const res = await fetch('/api/admin/quick-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSaveStatus('saved');
        hasLocalEditsRef.current = false;
        try {
          localStorage.setItem('himasi_qc_local_backup', JSON.stringify({
            candidates: latestCandidatesRef.current,
            invalid_votes: latestInvalidRef.current,
            notes: latestNotesRef.current,
            updatedAt: Date.now(),
          }));
        } catch (e) {}
        return true;
      } else {
        setSaveStatus('error');
        toast.error(data.error || 'Gagal menyimpan perubahan ke cloud');
        return false;
      }
    } catch (e) {
      setSaveStatus('error');
      toast.error('Koneksi internet lambat, hitungan tetap aman tersimpan di browser');
      return false;
    } finally {
      isSavingRef.current = false;
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        executeSave();
      }
    }
  };

  const scheduleDebouncedSave = () => {
    setSaveStatus('pending');
    hasLocalEditsRef.current = true;
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    // Jeda tenang 1.2 detik setelah klik terakhir selesai sebelum kirim ke cloud
    saveTimeoutRef.current = setTimeout(() => {
      executeSave();
    }, 1200);
  };

  const saveQuickCountState = async (
    newCandidates: QuickCountCandidate[],
    newInvalid: number,
    newNotes: string,
    newLocked: boolean
  ) => {
    latestCandidatesRef.current = newCandidates;
    latestInvalidRef.current = newInvalid;
    latestNotesRef.current = newNotes;
    latestLockedRef.current = newLocked;
    lastActionTimeRef.current = Date.now();

    // Local recalculate stats
    const totalValid = newCandidates.reduce((s, c) => s + (c.votes || 0), 0);
    const totalBallots = totalValid + newInvalid;
    const disc = totalBallots - stats.votedVotersCount;
    setStats((prev) => ({
      ...prev,
      totalValidVotes: totalValid,
      totalInvalidVotes: newInvalid,
      totalBallotsCounted: totalBallots,
      discrepancy: disc,
      isBalanced: disc === 0,
    }));

    // Simpan ke localStorage
    try {
      localStorage.setItem('himasi_qc_local_backup', JSON.stringify({
        candidates: newCandidates,
        invalid_votes: newInvalid,
        notes: newNotes,
        updatedAt: Date.now(),
      }));
    } catch (e) {}

    return await executeSave();
  };

  // Vote manipulation with debouncing & closure-race protection
  const handleVoteChange = (candidateId: string, delta: number) => {
    if (latestLockedRef.current) {
      toast.error('Perhitungan suara sedang dikunci');
      return;
    }
    const current = latestCandidatesRef.current;
    const updated = current.map((c) => {
      if (c.id === candidateId) {
        const nextVote = Math.max(0, (c.votes || 0) + delta);
        return { ...c, votes: nextVote };
      }
      return c;
    });

    latestCandidatesRef.current = updated;
    setCandidates(updated);
    playClickSound(delta > 0 ? 'add' : 'sub');
    lastActionTimeRef.current = Date.now();

    // Instant local recalculate stats
    const totalValid = updated.reduce((s, c) => s + (c.votes || 0), 0);
    const totalBallots = totalValid + latestInvalidRef.current;
    const disc = totalBallots - stats.votedVotersCount;
    setStats((prev) => ({
      ...prev,
      totalValidVotes: totalValid,
      totalInvalidVotes: latestInvalidRef.current,
      totalBallotsCounted: totalBallots,
      discrepancy: disc,
      isBalanced: disc === 0,
    }));

    // Simpan backup instan ke localStorage
    try {
      localStorage.setItem('himasi_qc_local_backup', JSON.stringify({
        candidates: updated,
        invalid_votes: latestInvalidRef.current,
        notes: latestNotesRef.current,
        updatedAt: Date.now(),
      }));
    } catch (e) {}

    scheduleDebouncedSave();
  };

  const handleInvalidChange = (delta: number) => {
    if (latestLockedRef.current) {
      toast.error('Perhitungan suara sedang dikunci');
      return;
    }
    const nextInvalid = Math.max(0, latestInvalidRef.current + delta);
    latestInvalidRef.current = nextInvalid;
    setInvalidVotes(nextInvalid);
    playClickSound(delta > 0 ? 'add' : 'sub');
    lastActionTimeRef.current = Date.now();

    // Instant local recalculate stats
    const totalValid = latestCandidatesRef.current.reduce((s, c) => s + (c.votes || 0), 0);
    const totalBallots = totalValid + nextInvalid;
    const disc = totalBallots - stats.votedVotersCount;
    setStats((prev) => ({
      ...prev,
      totalValidVotes: totalValid,
      totalInvalidVotes: nextInvalid,
      totalBallotsCounted: totalBallots,
      discrepancy: disc,
      isBalanced: disc === 0,
    }));

    // Simpan backup instan ke localStorage
    try {
      localStorage.setItem('himasi_qc_local_backup', JSON.stringify({
        candidates: latestCandidatesRef.current,
        invalid_votes: nextInvalid,
        notes: latestNotesRef.current,
        updatedAt: Date.now(),
      }));
    } catch (e) {}

    scheduleDebouncedSave();
  };

  const handleToggleLock = async () => {
    const nextLocked = !latestLockedRef.current;
    latestLockedRef.current = nextLocked;
    setIsLocked(nextLocked);
    const ok = await saveQuickCountState(latestCandidatesRef.current, latestInvalidRef.current, latestNotesRef.current, nextLocked);
    if (ok) {
      toast.success(nextLocked ? 'Perhitungan suara berhasil dikunci' : 'Kunci perhitungan suara dibuka');
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    latestNotesRef.current = notes;
    const ok = await saveQuickCountState(latestCandidatesRef.current, latestInvalidRef.current, notes, latestLockedRef.current);
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
      updated = candidates.map((c) =>
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
        number: formNumber.trim() || String(candidates.length + 1).padStart(2, '0'),
        name: formName.trim(),
        tagline: formTagline.trim(),
        photo_url: formPhoto.trim() || undefined,
        votes: 0,
      };
      updated = [...candidates, newPaslon];
    }

    setCandidates(updated);
    setIsModalOpen(false);
    await saveQuickCountState(updated, invalidVotes, notes, isLocked);
    toast.success(editingCandidate ? 'Paslon berhasil diperbarui' : 'Paslon baru berhasil ditambahkan');
  };

  const handleDeleteCandidate = async (id: string, name: string) => {
    if (isLocked) {
      toast.error('Buka kunci terlebih dahulu untuk menghapus paslon');
      return;
    }
    if (!confirm(`Hapus ${name} dari daftar paslon? Suara yang sudah diinput akan terhapus.`)) {
      return;
    }
    const updated = candidates.filter((c) => c.id !== id);
    setCandidates(updated);
    await saveQuickCountState(updated, invalidVotes, notes, isLocked);
    toast.success('Paslon berhasil dihapus');
  };

  const handleResetVotes = async () => {
    if (!confirm('PERINGATAN: Apakah Anda yakin ingin mereset semua hitungan suara kembali ke 0? Tindakan ini tidak dapat dibatalkan.')) {
      return;
    }
    const resetCandidates = candidates.map((c) => ({ ...c, votes: 0 }));
    setCandidates(resetCandidates);
    setInvalidVotes(0);
    await saveQuickCountState(resetCandidates, 0, notes, isLocked);
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

            {/* Live Cloud Save Status Badge */}
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-medium">
                <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                <span>Menyimpan ke Cloud...</span>
              </span>
            )}
            {saveStatus === 'pending' && (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
                <span>Jeda Simpan Cloud...</span>
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Tersimpan Cloud</span>
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 font-medium">
                <AlertTriangle className="w-3 h-3 text-rose-400" />
                <span>Aman di Browser (Offline)</span>
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

      {/* ========================================================
          CARD REKAPITULASI SUARA MAHASISWA ONLINE (E-VOTING)
          ======================================================== */}
      <div className="bg-gradient-to-r from-purple-950/40 via-indigo-950/30 to-slate-900/60 p-5 rounded-2xl border border-purple-500/30 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/20 text-purple-400 rounded-xl border border-purple-500/30 shrink-0">
              <Globe className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight">
                  Rekapitulasi Suara Mahasiswa Online (E-Voting)
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                  onlineStats.isMerged
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                }`}>
                  {onlineStats.isMerged ? 'Sudah Digabungkan ke Quick Count ✅' : 'Belum Digabungkan ⚡'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Data dihimpun secara rahasia langsung dari Bilik Suara Digital (Luber Jurdil).
              </p>
            </div>
          </div>

          {/* Merge / Unmerge & Reset Buttons */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {!onlineStats.isMerged ? (
              <button
                type="button"
                onClick={handleMergeOnlineVotes}
                disabled={mergingOnline || isLocked || onlineStats.totalOnlineVotesCast === 0}
                className="flex items-center gap-2 px-3.5 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/20 transition disabled:opacity-50 cursor-pointer"
              >
                <Vote className={`w-4 h-4 ${mergingOnline ? 'animate-spin' : ''}`} />
                <span>{mergingOnline ? 'Menambahkan...' : 'Tambahkan Suara Online ke Quick Count'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleUnmergeOnlineVotes}
                disabled={mergingOnline || isLocked}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-bold transition disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${mergingOnline ? 'animate-spin' : ''}`} />
                <span>{mergingOnline ? 'Membatalkan...' : 'Batalkan Penambahan'}</span>
              </button>
            )}

            {/* Tombol Reset Suara Online Pengetesan */}
            <button
              type="button"
              onClick={handleResetOnlineVotes}
              disabled={isLocked || onlineStats.totalOnlineVotesCast === 0}
              className="flex items-center gap-1.5 px-3 py-2 bg-rose-950/20 hover:bg-rose-950/40 text-rose-400 border border-rose-900/40 rounded-xl text-xs font-bold transition disabled:opacity-40 cursor-pointer"
              title="Reset seluruh suara online testing kembali ke 0 agar pemilih bisa mencoblos lagi"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Suara Online</span>
            </button>
          </div>
        </div>

        {/* Online KPI Mini-Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 block font-medium">Total Pemilih Online</span>
            <span className="text-xl font-bold text-white font-mono">{onlineStats.totalOnlineVoters}</span>
            <span className="text-[10px] text-slate-500 block">Mahasiswa & Dosen Online</span>
          </div>

          <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 block font-medium">Presensi Online Hadir</span>
            <span className="text-xl font-bold text-emerald-400 font-mono">{onlineStats.onlineAttended}</span>
            <span className="text-[10px] text-emerald-500 block">
              {onlineStats.totalOnlineVoters > 0
                ? Math.round((onlineStats.onlineAttended / onlineStats.totalOnlineVoters) * 100)
                : 0}% Terverifikasi Hadir
            </span>
          </div>

          <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 block font-medium">Sudah Mencoblos Online</span>
            <span className="text-xl font-bold text-purple-400 font-mono">{onlineStats.onlineVoted}</span>
            <span className="text-[10px] text-purple-400 block">
              Partisipasi {onlineStats.onlineTurnoutPct}%
            </span>
          </div>

          <div className="p-3 bg-slate-900/70 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 block font-medium">Belum Mencoblos Online</span>
            <span className="text-xl font-bold text-slate-400 font-mono">
              {Math.max(0, onlineStats.onlineAttended - onlineStats.onlineVoted)}
            </span>
            <span className="text-[10px] text-slate-500 block">Hadir tapi belum vote</span>
          </div>
        </div>

        {/* Per-Paslon Online Tally Breakdown */}
        <div className="p-3.5 bg-slate-900/80 rounded-xl border border-purple-500/20 space-y-2">
          <div className="flex items-center justify-between text-xs text-purple-300 font-semibold uppercase tracking-wider">
            <span>Rincian Suara E-Voting Masuk (Perolehan Online)</span>
            <span>Total: {onlineStats.totalOnlineVotesCast} Suara</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            {candidates.map((c) => {
              const candVote = onlineStats.candidateTallies[c.id]?.votes || 0;
              const pct = onlineStats.totalOnlineVotesCast > 0
                ? ((candVote / onlineStats.totalOnlineVotesCast) * 100).toFixed(1)
                : '0';

              return (
                <div key={c.id} className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                  <div className="truncate pr-2">
                    <span className="text-[11px] font-mono font-bold text-indigo-400 mr-1.5">{c.number}</span>
                    <span className="text-xs font-semibold text-slate-200 truncate">{c.name}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold text-white font-mono">{candVote}</span>
                    <span className="text-[10px] text-slate-400 ml-1">({pct}%)</span>
                  </div>
                </div>
              );
            })}

            {/* Kotak Kosong / Golput */}
            <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-center justify-between">
              <div className="truncate pr-2">
                <span className="text-[11px] font-mono font-bold text-gray-400 mr-1.5">00</span>
                <span className="text-xs font-semibold text-slate-400 truncate">Kotak Kosong / Golput</span>
              </div>
              <div className="text-right shrink-0">
                <span className="text-sm font-bold text-gray-300 font-mono">{onlineStats.golputCount}</span>
                <span className="text-[10px] text-slate-400 ml-1">
                  ({onlineStats.totalOnlineVotesCast > 0
                    ? ((onlineStats.golputCount / onlineStats.totalOnlineVotesCast) * 100).toFixed(1)
                    : '0'}%)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

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
                    <div className="mt-3 overflow-hidden rounded-xl h-48 sm:h-56 bg-slate-950/80 border border-slate-800 flex items-center justify-center p-1.5 shadow-inner">
                      <img
                        src={candidate.photo_url}
                        alt={candidate.name}
                        className="w-full h-full object-contain"
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
