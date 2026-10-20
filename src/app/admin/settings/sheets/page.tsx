'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { 
  FileSpreadsheet, 
  Copy, 
  Check, 
  Save, 
  RefreshCw, 
  Loader2, 
  ExternalLink,
  ShieldCheck,
  CheckCircle2,
  Clock
} from 'lucide-react';

export default function SheetsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  
  const [serviceAccountEmail, setServiceAccountEmail] = useState('');
  const [copiedEmail, setCopiedEmail] = useState(false);

  const [sheetId, setSheetId] = useState('');
  const [sheetName, setSheetName] = useState('Presensi');
  const [syncMode, setSyncMode] = useState<'manual' | 'realtime'>('manual');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/settings/sheets');
      const data = await res.json();
      if (res.ok) {
        setServiceAccountEmail(data.serviceAccountEmail || '');
        if (data.config) {
          setSheetId(data.config.sheet_id || '');
          setSheetName(data.config.sheet_name || 'Presensi');
          setSyncMode(data.config.sync_mode || 'manual');
          setLastSyncedAt(data.config.last_synced_at || null);
        }
      }
    } catch (e) {
      toast.error('Gagal memuat konfigurasi Google Sheets');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyEmail = () => {
    if (!serviceAccountEmail) return;
    navigator.clipboard.writeText(serviceAccountEmail);
    setCopiedEmail(true);
    toast.success('Email service account berhasil disalin!');
    setTimeout(() => setCopiedEmail(false), 2500);
  };

  const handleSaveConfig = async (overrideSyncMode?: 'manual' | 'realtime') => {
    if (!sheetId.trim()) {
      toast.error('Spreadsheet ID tidak boleh kosong.');
      return;
    }

    setSaving(true);
    try {
      const mode = overrideSyncMode || syncMode;
      const res = await fetch('/api/admin/settings/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sheet_id: sheetId,
          sheet_name: sheetName,
          sync_mode: mode,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        toast.success('Konfigurasi Google Sheets berhasil disimpan!');
        if (data.data?.sheet_id) setSheetId(data.data.sheet_id);
      } else {
        toast.error(data.error || 'Gagal menyimpan konfigurasi.');
      }
    } catch (e) {
      toast.error('Terjadi kesalahan saat menyimpan.');
    } finally {
      setSaving(false);
    }
  };

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/admin/sheets/sync', {
        method: 'POST',
      });
      const data = await res.json();

      if (res.ok) {
        toast.success(data.message || 'Sinkronisasi berhasil!');
        setLastSyncedAt(data.syncedAt);
      } else {
        toast.error(data.error || 'Gagal menyinkronkan data.');
      }
    } catch (e) {
      toast.error('Terjadi kesalahan koneksi.');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
          <p className="text-xs text-gray-500 font-medium">Memuat konfigurasi Google Sheets...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8 animate-in fade-in duration-200">
      {/* Title & Introduction */}
      <div>
        <h1 className="text-2xl font-bold text-[#111827] tracking-tight flex items-center gap-2.5">
          <FileSpreadsheet className="text-[#2563EB]" size={26} />
          Pengaturan Integrasi Google Sheets
        </h1>
        <p className="text-xs text-[#6B7280] mt-1">
          Hubungkan sistem absensi dengan spreadsheet Google untuk backup data dan laporan real-time otomatis.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 shadow-2xs p-6 sm:p-8 space-y-8">
        {/* SECTION 1: MASTER SHEET */}
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-[#111827] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#2563EB]"></span>
              1. Master (Admin) Sheet
            </h2>
            <p className="text-xs text-[#6B7280] mt-1">
              Sheet ini akan menampung seluruh riwayat data absensi mahasiswa. Anda <b>wajib membagikan (Share)</b> file Spreadsheet Anda ke email sistem di bawah ini dengan akses sebagai <b>Editor</b>.
            </p>
          </div>

          {/* SERVICE ACCOUNT EMAIL CARD */}
          <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-[#1D4ED8] uppercase tracking-wider mb-0.5">
                EMAIL SISTEM (SERVICE ACCOUNT)
              </p>
              <p className="font-mono text-xs text-[#1E3A8A] font-semibold select-all break-all">
                {serviceAccountEmail || 'crm-bot@dogwood-cinema-504217-e0.iam.gserviceaccount.com'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopyEmail}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white hover:bg-blue-50 text-[#1D4ED8] font-semibold text-xs rounded-lg border border-[#93C5FD] shadow-2xs transition-all shrink-0"
            >
              {copiedEmail ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
              <span>{copiedEmail ? 'Tersalin!' : 'Salin Email'}</span>
            </button>
          </div>

          {/* SPREADSHEET ID / URL INPUT */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#374151]">
              Spreadsheet ID atau Link Google Sheets
            </label>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
                placeholder="Contoh: 14BhgHivFs2UZWcBYKIJadG5wDVa54A92xg7siN8N5oc atau paste full URL sheet"
                className="flex-1 bg-[#F8F9FA] focus:bg-white border border-gray-200 focus:border-[#2563EB] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono text-[#111827] outline-hidden transition-all"
              />
              <button
                type="button"
                onClick={() => handleSaveConfig()}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-xs transition-all shrink-0"
              >
                {saving ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <Save size={15} />
                    <span>Simpan</span>
                  </>
                )}
              </button>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-800 space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-emerald-900">
                <Check size={14} className="text-emerald-600" />
                Format Baru: Mulai Kolom B4 & Multi-Tab Otomatis
              </p>
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                Tabel presensi kini dimulai tepat pada <b>Kolom B4</b> dengan styling rapi, freeze header, border otomatis, serta dipisahkan secara cerdas ke dalam masing-masing Sheet/Tab (contoh tab <b>Dosen</b>, <b>Angkatan 25</b>, <b>Angkatan 26</b>). Kode kelas A/B ditiadakan dan langsung disederhanakan berdasarkan Angkatan.
              </p>
            </div>
          </div>
        </div>

        <hr className="border-black/5" />

        {/* SECTION 2: SYNC AUTOMATION */}
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-[#111827] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#2563EB]"></span>
              2. Otomatisasi Sinkronisasi
            </h2>
            <p className="text-xs text-[#6B7280] mt-1">
              Pilih bagaimana dan kapan data absensi mahasiswa diekspor ke Spreadsheet.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => {
                setSyncMode('manual');
                handleSaveConfig('manual');
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                syncMode === 'manual'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-[#F8F9FA] text-[#4B5563] border-gray-200 hover:bg-gray-100'
              }`}
            >
              Hanya Manual
            </button>

            <button
              type="button"
              onClick={() => {
                setSyncMode('realtime');
                handleSaveConfig('realtime');
              }}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                syncMode === 'realtime'
                  ? 'bg-[#2563EB] text-white border-[#2563EB] shadow-xs'
                  : 'bg-[#F8F9FA] text-[#4B5563] border-gray-200 hover:bg-gray-100'
              }`}
            >
              Realtime (Otomatis Penuh)
            </button>
          </div>

          <p className="text-xs text-gray-500">
            {syncMode === 'realtime'
              ? '⚡ Mode Realtime aktif: Saat mahasiswa atau admin mencatat absensi, baris mahasiswa di Google Sheets akan langsung ter-update otomatis dari "Belum Hadir" menjadi "Hadir" lengkap dengan jam masuk (In-Place Update di baris yang sama tanpa duplikasi).'
              : '📌 Mode Manual aktif: Data disimpan di Supabase terlebih dahulu, dan baru dikirimkan ke Google Sheet saat tombol "Siapkan & Sinkron Roster" ditekan.'}
          </p>
        </div>

        <hr className="border-black/5" />

        {/* SECTION 3: MANUAL ACTION & STATUS */}
        <div className="space-y-4">
          <div>
            <h2 className="text-base font-bold text-[#111827] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#2563EB]"></span>
              3. Eksekusi Sinkronisasi & Persiapan Roster
            </h2>
            <p className="text-xs text-[#6B7280] mt-1">
              Dorong seluruh data master mahasiswa ke sheet Anda. Mahasiswa yang belum absen otomatis masuk dengan status "Belum Hadir", dan nantinya akan ter-update otomatis saat mereka presensi.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#F8F9FA] border border-black/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center shrink-0">
                <Clock size={20} />
              </div>
              <div>
                <p className="text-xs font-bold text-[#111827]">Status Terakhir</p>
                <p className="text-xs text-[#6B7280]">
                  {lastSyncedAt
                    ? `Terakhir sinkron: ${new Date(lastSyncedAt).toLocaleString('id-ID')}`
                    : 'Belum pernah disinkronkan secara manual'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              {sheetId && (
                <a
                  href={`https://docs.google.com/spreadsheets/d/${sheetId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white text-[#4B5563] hover:text-[#111827] border border-gray-200 rounded-xl text-xs font-semibold shadow-2xs hover:bg-gray-50 transition-all"
                >
                  <ExternalLink size={14} />
                  <span>Buka Sheet</span>
                </a>
              )}

              <button
                type="button"
                onClick={handleSyncNow}
                disabled={syncing || !sheetId}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-gray-200 disabled:text-gray-400 text-white rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                <span>{syncing ? 'Menyinkronkan...' : 'Siapkan & Sinkron Roster'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
