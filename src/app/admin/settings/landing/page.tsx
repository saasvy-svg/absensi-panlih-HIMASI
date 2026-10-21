'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { 
  Image as ImageIcon, 
  Save, 
  Loader2, 
  Trash2, 
  ExternalLink, 
  Building2, 
  UploadCloud,
  Eye,
  FileText,
  UserCheck,
  Plus,
  ShieldCheck,
  CalendarDays,
  Calendar,
  Layers,
  Sparkles,
  Clock
} from 'lucide-react';
import Link from 'next/link';
import { getWIBDate } from '@/lib/utils';
import { getNextWIBDate, resolveActiveDay, getDaysList } from '@/lib/dayHelper';
import { checkAttendanceTimeLock } from '@/lib/timeLock';
import { DayConfigItem } from '@/types/database';
import { createClient } from '@/utils/supabase/client';

export default function LandingSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    institution_name: '',
    page_title: '',
    page_subtitle: '',
    announcement: '',
    logo_url: '',
    hero_images: [] as string[],
    extra_texts: {
      badge_text: 'Presensi Dibuka',
      instruction_title: 'Panduan Presensi Mahasiswa',
      instructions: [
        'Masukkan NIM lengkap Anda pada kolom yang tersedia di formulir sebelah.',
        'Pastikan Nama dan Angkatan yang muncul otomatis sudah sesuai dengan identitas Anda.',
        'Setiap mahasiswa hanya dapat melakukan absensi 1 kali per hari perkuliahan.',
        'Jika berhalangan, pilih opsi Izin atau Sakit dan cantumkan alasan yang jelas.',
      ],
      lecturers: [] as string[],
      anti_titip_enabled: true,
      active_day: 'auto' as 'auto' | number,
      day1_date: '',
      day2_date: '',
      days: [] as DayConfigItem[],
      time_lock_enabled: false,
      open_time: '07:00',
      close_time: '15:00',
      time_lock_message: '',
      card1_title: 'Waktu Presensi',
      card1_desc: '07.00 - 17.00 WIB',
      card2_title: 'Presisi NIM',
      card2_desc: 'Anti-typo & Auto-fill',
      card3_title: 'Sinkronisasi',
      card3_desc: 'Terkoneksi Sheets',
      footer_text: 'Sistem Absensi Terintegrasi.',
    },
  });

  const [instructionText, setInstructionText] = useState('');
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [newLecturer, setNewLecturer] = useState('');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/settings/landing');
      const data = await res.json();
      if (res.ok && data.data) {
        setForm({
          institution_name: data.data.institution_name || '',
          page_title: data.data.page_title || '',
          page_subtitle: data.data.page_subtitle || '',
          announcement: data.data.announcement || '',
          logo_url: data.data.logo_url || '',
          hero_images: data.data.hero_images || [],
          extra_texts: data.data.extra_texts || form.extra_texts,
        });

        if (data.data.extra_texts?.instructions) {
          setInstructionText(data.data.extra_texts.instructions.join('\n'));
        }
      }
    } catch (e) {
      toast.error('Gagal memuat pengaturan tampilan');
    } finally {
      setLoading(false);
    }
  };

  // Helper auto-save to database immediately when logo or banner changes
  const autoSaveMedia = async (newLogoUrl?: string, newHeroImages?: string[]) => {
    try {
      const payload = {
        ...form,
        logo_url: newLogoUrl !== undefined ? newLogoUrl : form.logo_url,
        hero_images: newHeroImages !== undefined ? newHeroImages : form.hero_images,
      };

      await fetch('/api/admin/settings/landing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      window.dispatchEvent(new CustomEvent('landing-settings-updated'));
    } catch (e) {
      console.error('Auto save error:', e);
    }
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'banner') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Batas file 25 MB (langsung ke Supabase Storage, tanpa kompresi)
    if (file.size > 25 * 1024 * 1024) {
      toast.error('Ukuran file maksimal 25 MB.');
      return;
    }

    const isLogo = type === 'logo';
    if (isLogo) setUploadingLogo(true);
    else setUploadingBanner(true);

    try {
      const fileSizeMb = (file.size / (1024 * 1024)).toFixed(1);
      toast.info(`Mengunggah ${isLogo ? 'logo' : 'foto banner'} (${fileSizeMb} MB) kualitas asli tanpa kompresi langsung ke storage...`, {
        duration: 3500,
      });

      // 1. Minta Signed Upload URL ke server (bypasses Vercel payload limit)
      const resToken = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          folder: isLogo ? 'logos' : 'banners',
        }),
      });

      const tokenData = await resToken.json();
      if (!resToken.ok || !tokenData.token || !tokenData.cleanPath) {
        throw new Error(tokenData.error || 'Gagal menyiapkan URL upload ke server');
      }

      // 2. Upload LANGSUNG dari browser ke Supabase Storage (Kualitas Asli 100% Utuh!)
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from('landing-assets')
        .uploadToSignedUrl(tokenData.cleanPath, tokenData.token, file, {
          contentType: file.type,
        });

      if (uploadError) {
        throw new Error(uploadError.message || 'Gagal upload langsung ke Supabase');
      }

      const uploadedUrl = tokenData.publicUrl;

      // 3. Simpan URL ke form & database
      if (isLogo) {
        setForm((prev) => ({ ...prev, logo_url: uploadedUrl }));
        await autoSaveMedia(uploadedUrl, undefined);
        toast.success('Logo berhasil di-upload dalam kualitas asli! 🎉');
      } else {
        const nextImages = [...form.hero_images, uploadedUrl];
        setForm((prev) => ({ ...prev, hero_images: nextImages }));
        await autoSaveMedia(undefined, nextImages);
        toast.success('Foto banner berhasil di-upload dalam kualitas asli (tanpa kompresi)! 🎉');
      }
    } catch (err: any) {
      console.error('Upload Error:', err);
      toast.error(err.message || 'Terjadi kesalahan saat upload ke server.');
    } finally {
      if (isLogo) setUploadingLogo(false);
      else setUploadingBanner(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleAddManualImage = async (urlToAdd: string) => {
    const url = urlToAdd.trim();
    if (!url) return;
    if (form.hero_images.includes(url)) {
      toast.warning('Gambar ini sudah ada di galeri banner.');
      return;
    }
    const nextImages = [...form.hero_images, url];
    setForm((prev) => ({ ...prev, hero_images: nextImages }));
    setManualImageUrl('');
    await autoSaveMedia(undefined, nextImages);
    toast.success('Foto banner ditambahkan & disimpan!');
  };

  const handleRemoveImage = async (index: number) => {
    const updated = form.hero_images.filter((_, idx) => idx !== index);
    setForm((prev) => ({ ...prev, hero_images: updated }));
    await autoSaveMedia(undefined, updated);
    toast.info('Foto banner dihapus dari database');
  };

  const handleRemoveLogo = async () => {
    setForm((prev) => ({ ...prev, logo_url: '' }));
    await autoSaveMedia('', undefined);
    toast.info('Logo dihapus dari database');
  };

  // Lecturer Management
  const handleAddLecturer = async () => {
    const name = newLecturer.trim();
    if (!name) return;
    const currentLecturers = form.extra_texts?.lecturers || [];
    if (currentLecturers.includes(name)) {
      toast.warning('Dosen ini sudah ada dalam daftar.');
      return;
    }
    const updatedLecturers = [...currentLecturers, name];
    const updatedExtra = { ...form.extra_texts, lecturers: updatedLecturers };
    setForm((prev) => ({ ...prev, extra_texts: updatedExtra }));
    setNewLecturer('');

    try {
      await fetch('/api/admin/settings/landing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, extra_texts: updatedExtra }),
      });
      toast.success(`Dosen "${name}" berhasil ditambahkan & langsung aktif! 🎉`);
    } catch (e) {
      toast.error('Gagal menyimpan data dosen');
    }
  };

  const handleRemoveLecturer = async (index: number) => {
    const currentLecturers = form.extra_texts?.lecturers || [];
    const removed = currentLecturers[index];
    const updatedLecturers = currentLecturers.filter((_, idx) => idx !== index);
    const updatedExtra = { ...form.extra_texts, lecturers: updatedLecturers };
    setForm((prev) => ({ ...prev, extra_texts: updatedExtra }));

    try {
      await fetch('/api/admin/settings/landing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, extra_texts: updatedExtra }),
      });
      toast.info(`Dosen "${removed}" dihapus`);
    } catch (e) {
      toast.error('Gagal memperbarui data dosen');
    }
  };

  const handleToggleAntiTitip = async () => {
    const currentVal = form.extra_texts?.anti_titip_enabled ?? true;
    const nextVal = !currentVal;
    const updatedExtra = { ...form.extra_texts, anti_titip_enabled: nextVal };
    const updatedForm = { ...form, extra_texts: updatedExtra };
    setForm(updatedForm);

    try {
      const res = await fetch('/api/admin/settings/landing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedForm),
      });
      if (res.ok) {
        if (nextVal) {
          toast.success('🛡️ Anti-Titip Absen DIAKTIFKAN: 1 HP hanya boleh absen 1 kali!');
        } else {
          toast.info('🔓 Anti-Titip Absen DINONAKTIFKAN: Mahasiswa bebas saling pinjam HP.');
        }
      } else {
        toast.error('Gagal memperbarui saklar anti-titip absen');
      }
    } catch (e) {
      toast.error('Terjadi kesalahan jaringan');
    }
  };

  const handleToggleTimeLock = async () => {
    const currentVal = form.extra_texts?.time_lock_enabled === true;
    const nextVal = !currentVal;
    const updatedExtra = { ...form.extra_texts, time_lock_enabled: nextVal };
    const updatedForm = { ...form, extra_texts: updatedExtra };
    setForm(updatedForm);

    try {
      const res = await fetch('/api/admin/settings/landing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedForm),
      });
      if (res.ok) {
        if (nextVal) {
          toast.success('⏰ Pembatasan Jam Presensi DIAKTIFKAN!');
        } else {
          toast.info('🔓 Pembatasan Jam Presensi DINONAKTIFKAN (Dibuka 24 jam).');
        }
        window.dispatchEvent(new CustomEvent('landing-settings-updated'));
      } else {
        toast.error('Gagal memperbarui saklar jam presensi');
      }
    } catch (e) {
      toast.error('Terjadi kesalahan jaringan');
    }
  };

  const handleUpdateTimeLockTimes = async (openVal?: string, closeVal?: string) => {
    const updatedExtra = {
      ...form.extra_texts,
      open_time: openVal !== undefined ? openVal : form.extra_texts?.open_time || '07:00',
      close_time: closeVal !== undefined ? closeVal : form.extra_texts?.close_time || '15:00',
    };
    const updatedForm = { ...form, extra_texts: updatedExtra };
    setForm(updatedForm);

    try {
      await fetch('/api/admin/settings/landing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedForm),
      });
      toast.success('Jam Buka & Tutup Presensi berhasil diperbarui! ⏰');
      window.dispatchEvent(new CustomEvent('landing-settings-updated'));
    } catch (e) {
      toast.error('Gagal menyimpan jam presensi');
    }
  };

  const handleSetActiveDay = async (mode: number | 'auto') => {
    const updatedExtra = {
      ...form.extra_texts,
      active_day: mode,
    };
    const updatedForm = { ...form, extra_texts: updatedExtra };
    setForm(updatedForm);

    try {
      const res = await fetch('/api/admin/settings/landing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedForm),
      });
      if (res.ok) {
        const label =
          mode === 'auto'
            ? 'Otomatis (Sesuai Tanggal)'
            : `Paksa Hari ke-${mode}`;
        toast.success(`📅 Sesi Presensi diubah ke: ${label}`);
        window.dispatchEvent(new CustomEvent('landing-settings-updated'));
      } else {
        toast.error('Gagal memperbarui mode sesi');
      }
    } catch (e) {
      toast.error('Terjadi kesalahan jaringan');
    }
  };

  const handleAddDay = async () => {
    const currentDays = getDaysList(form.extra_texts);
    const lastDay = currentDays[currentDays.length - 1];
    const nextDate = getNextWIBDate(lastDay?.date || getWIBDate());
    const nextDayNum = currentDays.length + 1;

    const newDays: DayConfigItem[] = [
      ...currentDays,
      {
        dayNumber: nextDayNum,
        date: nextDate,
        label: `Hari ${nextDayNum}`,
      },
    ];

    const updatedExtra = {
      ...form.extra_texts,
      days: newDays,
      day1_date: newDays[0]?.date,
      day2_date: newDays[1]?.date,
    };
    const updatedForm = { ...form, extra_texts: updatedExtra };
    setForm(updatedForm);

    try {
      const res = await fetch('/api/admin/settings/landing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedForm),
      });
      if (res.ok) {
        toast.success(`Hari ke-${nextDayNum} (${nextDate}) berhasil ditambahkan! 📅`);
        window.dispatchEvent(new CustomEvent('landing-settings-updated'));
      } else {
        toast.error('Gagal menambahkan hari baru');
      }
    } catch (e) {
      toast.error('Terjadi kesalahan jaringan');
    }
  };

  const handleRemoveDay = async (index: number) => {
    const currentDays = getDaysList(form.extra_texts);
    if (currentDays.length <= 1) {
      toast.warning('Minimal harus ada 1 hari pelaksanaan presensi.');
      return;
    }

    const filtered = currentDays.filter((_, idx) => idx !== index);
    const reindexedDays: DayConfigItem[] = filtered.map((d, idx) => ({
      ...d,
      dayNumber: idx + 1,
    }));

    let nextActiveDay = form.extra_texts?.active_day;
    if (typeof nextActiveDay === 'number' && nextActiveDay > reindexedDays.length) {
      nextActiveDay = 'auto';
    }

    const updatedExtra = {
      ...form.extra_texts,
      active_day: nextActiveDay,
      days: reindexedDays,
      day1_date: reindexedDays[0]?.date,
      day2_date: reindexedDays[1]?.date,
    };
    const updatedForm = { ...form, extra_texts: updatedExtra };
    setForm(updatedForm);

    try {
      const res = await fetch('/api/admin/settings/landing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedForm),
      });
      if (res.ok) {
        toast.info('Hari pelaksanaan berhasil dihapus');
        window.dispatchEvent(new CustomEvent('landing-settings-updated'));
      } else {
        toast.error('Gagal menghapus hari');
      }
    } catch (e) {
      toast.error('Terjadi kesalahan jaringan');
    }
  };

  const handleUpdateDayItem = async (index: number, updates: Partial<DayConfigItem>) => {
    const currentDays = getDaysList(form.extra_texts);
    const updatedDays = currentDays.map((d, idx) => {
      if (idx === index) {
        return { ...d, ...updates };
      }
      return d;
    });

    const updatedExtra = {
      ...form.extra_texts,
      days: updatedDays,
      day1_date: updatedDays[0]?.date,
      day2_date: updatedDays[1]?.date,
    };
    const updatedForm = { ...form, extra_texts: updatedExtra };
    setForm(updatedForm);

    try {
      const res = await fetch('/api/admin/settings/landing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedForm),
      });
      if (res.ok) {
        window.dispatchEvent(new CustomEvent('landing-settings-updated'));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const parsedInstructions = instructionText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    const payload = {
      ...form,
      extra_texts: {
        ...form.extra_texts,
        instructions: parsedInstructions.length > 0 ? parsedInstructions : form.extra_texts.instructions,
      },
    };

    try {
      const res = await fetch('/api/admin/settings/landing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok) {
        window.dispatchEvent(new CustomEvent('landing-settings-updated'));
        toast.success('Seluruh pengaturan tampilan dan teks berhasil disimpan!');
      } else {
        toast.error(data.error || 'Gagal menyimpan perubahan');
      }
    } catch (e) {
      toast.error('Terjadi kesalahan jaringan');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-[#2563EB]" />
          <p className="text-xs text-gray-500 font-medium">Memuat pengaturan kustomisasi...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-8 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#111827] tracking-tight flex items-center gap-2.5">
            <ImageIcon className="text-[#2563EB]" size={26} />
            Kustomisasi Tampilan & Dosen
          </h1>
          <p className="text-xs text-[#6B7280] mt-1">
            Unggah logo, banner kegiatan, kelola daftar dosen, dan atur seluruh teks landing page.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white text-[#4B5563] hover:text-[#2563EB] border border-gray-200 rounded-xl text-xs font-semibold shadow-2xs hover:bg-gray-50 transition-all self-start cursor-pointer"
        >
          <Eye size={14} />
          <span>Buka Halaman Mahasiswa</span>
          <ExternalLink size={12} className="text-gray-400" />
        </Link>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* BAGIAN 1: UPLOAD LOGO */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-2xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#111827] uppercase tracking-wider text-[#2563EB] flex items-center gap-2">
              <Building2 size={16} />
              1. Logo Instansi / Kampus / Acara
            </h2>
            <span className="text-[11px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              Auto-Save Aktif
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-5 pt-2">
            <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-300 bg-[#F8F9FA] flex items-center justify-center p-2 relative shrink-0 overflow-hidden">
              {form.logo_url ? (
                <img src={form.logo_url} alt="Logo" className="max-w-full max-h-full object-contain" />
              ) : (
                <div className="text-center text-gray-400">
                  <ImageIcon size={24} className="mx-auto mb-1 text-gray-300" />
                  <span className="text-[9px] block">Belum ada logo</span>
                </div>
              )}
            </div>

            <div className="flex-1 space-y-2 w-full text-center sm:text-left">
              <input
                type="file"
                ref={logoInputRef}
                onChange={(e) => handleUploadFile(e, 'logo')}
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
              />
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <UploadCloud size={15} className={uploadingLogo ? 'animate-spin' : ''} />
                  <span>{uploadingLogo ? 'Mengunggah & Menyimpan...' : 'Pilih File Logo dari Laptop/HP'}</span>
                </button>
                {form.logo_url && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 text-rose-700 hover:bg-rose-100 text-xs font-semibold rounded-xl border border-rose-200 transition-all cursor-pointer"
                  >
                    <Trash2 size={14} />
                    <span>Hapus Logo</span>
                  </button>
                )}
              </div>
              <p className="text-[11px] text-[#6B7280]">
                Mendukung PNG transparan, SVG, JPG, atau WebP. Sekali diupload langsung otomatis tersimpan.
              </p>
            </div>
          </div>
        </div>

        {/* BAGIAN 2: UPLOAD FOTO BANNER DINAMIS */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-2xs p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#111827] uppercase tracking-wider text-[#2563EB] flex items-center gap-2">
                <ImageIcon size={16} />
                2. Galeri Foto Banner Dinamis
              </h2>
              <p className="text-xs text-[#6B7280] mt-1">
                Foto-foto ini akan berganti secara otomatis di slider halaman mahasiswa.
              </p>
            </div>
            <span className="text-[11px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              Auto-Save Aktif
            </span>
          </div>

          {/* Upload Button */}
          <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-[#1D4ED8]">
                Upload Foto Kegiatan Kampus / Acara:
              </p>
              <p className="text-[11px] text-[#1E3A8A]">
                Foto yang kamu upload otomatis masuk ke database dan langsung tampil di halaman depan.
              </p>
            </div>

            <input
              type="file"
              ref={bannerInputRef}
              onChange={(e) => handleUploadFile(e, 'banner')}
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => bannerInputRef.current?.click()}
              disabled={uploadingBanner}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold rounded-xl shadow-xs transition-all shrink-0 cursor-pointer"
            >
              <UploadCloud size={16} className={uploadingBanner ? 'animate-spin' : ''} />
              <span>{uploadingBanner ? 'Mengunggah & Menyimpan...' : 'Upload Foto Banner Baru'}</span>
            </button>
          </div>

          {/* Input Manual URL (Opsional) */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="url"
              value={manualImageUrl}
              onChange={(e) => setManualImageUrl(e.target.value)}
              placeholder="Atau tempel URL gambar langsung (https://...)"
              className="flex-1 bg-[#F8F9FA] focus:bg-white border border-gray-200 focus:border-[#2563EB] rounded-xl px-3.5 py-2 text-xs text-[#111827] outline-hidden transition-all"
            />
            <button
              type="button"
              onClick={() => handleAddManualImage(manualImageUrl)}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-[#374151] rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer"
            >
              + Tambah URL
            </button>
          </div>

          {/* Active Banners Grid */}
          <div className="space-y-2 pt-2">
            <h3 className="text-xs font-bold text-[#111827]">
              Foto yang Sedang Aktif ({form.hero_images.length})
            </h3>

            {form.hero_images.length === 0 ? (
              <div className="p-8 text-center bg-[#F8F9FA] rounded-2xl border border-dashed border-gray-300 text-xs text-gray-500 space-y-1">
                <ImageIcon size={28} className="mx-auto text-gray-400 mb-1" />
                <p className="font-semibold text-[#111827]">Belum ada foto yang di-upload</p>
                <p className="text-[11px] text-[#6B7280]">
                  Klik tombol biru <b>"Upload Foto Banner Baru"</b> di atas untuk menambahkan foto dokumentasi/kegiatan kamu.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {form.hero_images.map((imgUrl, index) => (
                  <div
                    key={index}
                    className="relative group rounded-xl overflow-hidden border border-black/10 aspect-video bg-gray-100"
                  >
                    <img src={imgUrl} alt={`Banner #${index + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(index)}
                        className="p-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-sm transition-transform active:scale-95 cursor-pointer"
                        title="Hapus foto ini"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <span className="absolute bottom-1.5 left-1.5 bg-black/60 text-white text-[10px] font-mono px-2 py-0.5 rounded-md">
                      #{index + 1}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* BAGIAN 3: SAKLAR KEAMANAN ANTI-TITIP ABSEN */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-2xs p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-sm font-bold text-[#111827] uppercase tracking-wider text-[#2563EB] flex items-center gap-2">
                  <ShieldCheck size={18} />
                  3. Saklar Keamanan Anti-Titip Absen (Batas 1 HP / IP)
                </h2>
                <span className="text-[11px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                  Auto-Save
                </span>
              </div>
              <p className="text-xs text-[#6B7280] max-w-xl">
                Bila <b>AKTIF</b>, 1 HP/perangkat hanya bisa dipakai presensi 1 kali dalam sehari. Bila <b>DINONAKTIFKAN</b>, mahasiswa bebas meminjamkan HP atau menggunakan jaringan Wi-Fi/hotspot yang sama tanpa terblokir.
              </p>
            </div>

            {/* Toggle Switch */}
            <div className="flex items-center gap-3 shrink-0">
              <span className={`text-xs font-bold ${form.extra_texts?.anti_titip_enabled !== false ? 'text-emerald-600' : 'text-gray-400'}`}>
                {form.extra_texts?.anti_titip_enabled !== false ? 'FITUR AKTIF' : 'DINONAKTIFKAN'}
              </span>
              <button
                type="button"
                onClick={handleToggleAntiTitip}
                className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                  form.extra_texts?.anti_titip_enabled !== false ? 'bg-emerald-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    form.extra_texts?.anti_titip_enabled !== false ? 'translate-x-7' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          <div className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 transition-all ${
            form.extra_texts?.anti_titip_enabled !== false
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}>
            <div className={`w-2 h-2 rounded-full shrink-0 ${form.extra_texts?.anti_titip_enabled !== false ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span>
              {form.extra_texts?.anti_titip_enabled !== false ? (
                <><b>Status Saat Ini (Ketat):</b> Mahasiswa yang mencoba absen kedua kalinya dari HP/IP yang sama akan otomatis terblokir dengan peringatan anti-titip absen.</>
              ) : (
                <><b>Status Saat Ini (Bebas / Pinjam HP Diizinkan):</b> Batasan 1 HP dimatikan. Mahasiswa dapat saling meminjamkan HP atau tethering kuota ke temannya tanpa peringatan.</>
              )}
            </span>
          </div>
        </div>

        {/* BAGIAN 3.5: PEMBATASAN JAM BUKA & TUTUP PRESENSI */}
        {(() => {
          const timeLockStatus = checkAttendanceTimeLock(form.extra_texts);
          const isEnabled = form.extra_texts?.time_lock_enabled === true;
          const openVal = form.extra_texts?.open_time || '07:00';
          const closeVal = form.extra_texts?.close_time || '15:00';

          return (
            <div className="bg-white rounded-2xl border border-black/5 shadow-2xs p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-[#111827] uppercase tracking-wider text-[#2563EB] flex items-center gap-2">
                      <Clock size={16} />
                      3.5. Pengaturan Jam Buka & Tutup Presensi
                    </h2>
                    <span className="text-[11px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      Auto-Save Aktif
                    </span>
                  </div>
                  <p className="text-xs text-[#6B7280]">
                    Kunci formulir presensi mahasiswa secara otomatis di luar jam yang ditentukan.
                  </p>
                </div>

                {/* Toggle Switch */}
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs font-bold ${isEnabled ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {isEnabled ? 'BATAS JAM AKTIF' : 'DIBUKA 24 JAM'}
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleTimeLock}
                    className={`relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
                      isEnabled ? 'bg-emerald-500' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        isEnabled ? 'translate-x-7' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Input Jam Buka & Tutup */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className={`p-3.5 rounded-xl border transition-all space-y-1.5 ${
                  isEnabled ? 'bg-blue-50/50 border-blue-200' : 'bg-gray-50 border-gray-200 opacity-60'
                }`}>
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                    <span>⏰ Jam Buka Presensi:</span>
                  </label>
                  <input
                    type="time"
                    disabled={!isEnabled}
                    value={openVal}
                    onChange={(e) => handleUpdateTimeLockTimes(e.target.value, undefined)}
                    className="w-full bg-white px-3 py-2 text-xs font-bold rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <p className="text-[10px] text-gray-400">
                    Mahasiswa baru bisa mengisi formulir mulai jam ini (WIB).
                  </p>
                </div>

                <div className={`p-3.5 rounded-xl border transition-all space-y-1.5 ${
                  isEnabled ? 'bg-rose-50/50 border-rose-200' : 'bg-gray-50 border-gray-200 opacity-60'
                }`}>
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                    <span>🛑 Jam Tutup Presensi:</span>
                  </label>
                  <input
                    type="time"
                    disabled={!isEnabled}
                    value={closeVal}
                    onChange={(e) => handleUpdateTimeLockTimes(undefined, e.target.value)}
                    className="w-full bg-white px-3 py-2 text-xs font-bold rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-rose-500 cursor-pointer disabled:cursor-not-allowed"
                  />
                  <p className="text-[10px] text-gray-400">
                    Setelah jam ini, formulir otomatis terkunci dan menolak pengisian.
                  </p>
                </div>
              </div>

              {/* Status Indicator */}
              <div className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 transition-all ${
                !isEnabled
                  ? 'bg-blue-50 border-blue-200 text-blue-800'
                  : timeLockStatus.isOpen
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  !isEnabled
                    ? 'bg-blue-500'
                    : timeLockStatus.isOpen
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-rose-500'
                }`} />
                <span>
                  <b>Waktu Server Saat Ini:</b> {timeLockStatus.currentTime} WIB •{' '}
                  <b>Status Formulir:</b>{' '}
                  {!isEnabled ? (
                    'Terbuka Bebas (Tanpa Batasan Jam)'
                  ) : timeLockStatus.isOpen ? (
                    <span className="text-emerald-700 font-bold">SEDANG DIBUKA ({openVal} - {closeVal} WIB)</span>
                  ) : (
                    <span className="text-rose-700 font-bold">TERKUNCI / DITUTUP ({timeLockStatus.reason === 'TOO_EARLY' ? `Buka pk ${openVal}` : `Tutup sejak pk ${closeVal}`})</span>
                  )}
                </span>
              </div>
            </div>
          );
        })()}

        {/* BAGIAN 4: SESI PRESENSI MULTI-HARI (MODEL B MATRIKS) */}
        {(() => {
          const resolved = resolveActiveDay(form.extra_texts);
          const currentMode = form.extra_texts?.active_day || 'auto';
          const daysList = getDaysList(form.extra_texts);

          return (
            <div className="bg-white rounded-2xl border border-black/5 shadow-2xs p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-sm font-bold text-[#111827] uppercase tracking-wider text-[#2563EB] flex items-center gap-2">
                      <CalendarDays size={18} />
                      4. Sesi Hari Presensi (Model B Matriks Terpadu)
                    </h2>
                    <span className="text-[11px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      Auto-Save Aktif
                    </span>
                  </div>
                  <p className="text-xs text-[#6B7280] max-w-2xl">
                    Sistem menggunakan <b>Model B (1 Tabel Matriks Induk per Tab)</b>. Data identitas mahasiswa ditulis sekali di sebelah kiri, dan setiap hari presensi menempati 1 kolom ringkas (<code className="text-blue-600 font-mono">Hari 1</code>, <code className="text-blue-600 font-mono">Hari 2</code>, <code className="text-blue-600 font-mono">Hari 3</code>, dst). Fleksibel untuk 2 hari, 3 hari, 4 hari atau seterusnya!
                  </p>
                </div>

                {/* Status Aktif Saat Ini Pill */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-gray-500 font-medium">Sesi Terdeteksi:</span>
                  <span className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                    resolved.activeDay > 1
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-blue-100 text-blue-800 border border-blue-300'
                  }`}>
                    <Sparkles size={13} />
                    <span>HARI KE-{resolved.activeDay} ({daysList.find(d => d.dayNumber === resolved.activeDay)?.date || resolved.effectiveDate})</span>
                  </span>
                </div>
              </div>

              {/* Selector Mode Sesi */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700 block">
                  Pilih Mode Penentuan Hari Aktif:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleSetActiveDay('auto')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      currentMode === 'auto'
                        ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20 text-[#1E3A8A]'
                        : 'bg-gray-50/70 border-gray-200 hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold flex items-center gap-1.5">
                        <Calendar size={13} className={currentMode === 'auto' ? 'text-blue-600' : 'text-gray-500'} />
                        Otomatis
                      </span>
                      {currentMode === 'auto' && (
                        <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-500 leading-tight">
                      Sesuai tanggal hari ini
                    </p>
                  </button>

                  {daysList.map((dayItem) => {
                    const isSelected = currentMode === dayItem.dayNumber;
                    return (
                      <button
                        key={dayItem.dayNumber}
                        type="button"
                        onClick={() => handleSetActiveDay(dayItem.dayNumber)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-900'
                            : 'bg-gray-50/70 border-gray-200 hover:bg-gray-100 text-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold flex items-center gap-1.5">
                            <Layers size={13} className={isSelected ? 'text-emerald-600' : 'text-gray-500'} />
                            Paksa Hari {dayItem.dayNumber}
                          </span>
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-500 leading-tight truncate">
                          Kunci ke {dayItem.label || `Hari ${dayItem.dayNumber}`}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Day List Items */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                    <span>📅 Daftar Hari Pelaksanaan ({daysList.length} Hari Terdaftar):</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleAddDay}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>+ Tambah Hari Berikutnya</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {daysList.map((dayItem, index) => {
                    const isActiveNow = resolved.activeDay === dayItem.dayNumber;
                    return (
                      <div
                        key={dayItem.dayNumber}
                        className={`p-3.5 rounded-xl border transition-all space-y-2.5 relative ${
                          isActiveNow
                            ? 'bg-blue-50/40 border-blue-300 ring-1 ring-blue-400/30'
                            : 'bg-gray-50/70 border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                              isActiveNow
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-700'
                            }`}>
                              Hari ke-{dayItem.dayNumber}
                            </span>
                            {isActiveNow && (
                              <span className="text-[10px] text-blue-700 font-semibold bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200">
                                Sesi Aktif Saat Ini
                              </span>
                            )}
                          </div>

                          {daysList.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveDay(index)}
                              className="text-gray-400 hover:text-rose-600 p-1 rounded-md transition-colors cursor-pointer"
                              title="Hapus hari ini"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div>
                            <label className="text-[11px] text-gray-500 font-medium block mb-1">
                              Label Kolom di Tabel:
                            </label>
                            <input
                              type="text"
                              value={dayItem.label || `Hari ${dayItem.dayNumber}`}
                              onChange={(e) =>
                                handleUpdateDayItem(index, { label: e.target.value })
                              }
                              placeholder={`Hari ${dayItem.dayNumber}`}
                              className="w-full bg-white px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                            />
                          </div>

                          <div>
                            <label className="text-[11px] text-gray-500 font-medium block mb-1">
                              Tanggal Pelaksanaan:
                            </label>
                            <input
                              type="date"
                              value={dayItem.date}
                              onChange={(e) =>
                                handleUpdateDayItem(index, { date: e.target.value })
                              }
                              className="w-full bg-white px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Info Banner Struktur Model B Matriks */}
              <div className="bg-linear-to-r from-blue-50 via-slate-50 to-emerald-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="font-bold text-slate-800 flex items-center gap-2">
                  <span>📊 Struktur Model B (1 Tabel Matriks Terpadu per Tab):</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 text-[11px]">
                  <div className="bg-white p-2.5 rounded-lg border border-blue-200 text-blue-900">
                    <span className="font-bold block">Kolom B - E: Identitas Master</span>
                    <span className="text-gray-500 text-[10px]">No, NIM / NIP, Nama Lengkap, Angkatan</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-emerald-300 text-emerald-900">
                    <span className="font-bold block">
                      Kolom F s/d {String.fromCharCode(70 + daysList.length - 1)}: Kolom Hari
                    </span>
                    <span className="text-gray-500 text-[10px]">
                      {daysList.map(d => `${d.label || `Hari ${d.dayNumber}`}`).join(' • ')} (Hadir / Izin / Sakit / -)
                    </span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-purple-200 text-purple-900">
                    <span className="font-bold block">Total Hadir:</span>
                    <span className="text-gray-500 text-[10px]">Otomatis dihitung (cth: "1 / {daysList.length} Hari")</span>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-slate-700">
                    <span className="font-bold block">Kolom Terakhir:</span>
                    <span className="text-gray-500 text-[10px]">Catatan / Alasan & Waktu Sinkron Terakhir</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* BAGIAN 5: KELOLA DAFTAR DOSEN */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-2xs p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#111827] uppercase tracking-wider text-[#2563EB] flex items-center gap-2">
                <UserCheck size={16} />
                5. Kelola Daftar Dosen
              </h2>
              <p className="text-xs text-[#6B7280] mt-1">
                Daftar dosen ini akan muncul pada pilihan dropdown saat tab 'Presensi Dosen' dipilih di halaman depan.
              </p>
            </div>
            <span className="text-[11px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
              Auto-Save Aktif
            </span>
          </div>

          {/* Form Tambah Dosen */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <input
              type="text"
              value={newLecturer}
              onChange={(e) => setNewLecturer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddLecturer();
                }
              }}
              placeholder="Masukkan Nama Dosen & Gelar (Contoh: Dr. Ir. Budi Santoso, M.Kom)"
              className="flex-1 bg-[#F8F9FA] focus:bg-white border border-gray-200 focus:border-[#2563EB] rounded-xl px-3.5 py-2 text-xs text-[#111827] outline-hidden transition-all"
            />
            <button
              type="button"
              onClick={handleAddLecturer}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold rounded-xl shadow-xs transition-all shrink-0 cursor-pointer"
            >
              <Plus size={15} />
              <span>+ Tambah Dosen</span>
            </button>
          </div>

          {/* List Dosen */}
          <div className="space-y-2 pt-1">
            <label className="block text-xs font-bold text-[#111827]">
              Dosen yang Sedang Aktif ({form.extra_texts?.lecturers?.length || 0}):
            </label>

            {!form.extra_texts?.lecturers || form.extra_texts.lecturers.length === 0 ? (
              <div className="p-4 bg-[#F8F9FA] rounded-xl border border-dashed border-gray-200 text-xs text-gray-400 text-center">
                Belum ada dosen yang ditambahkan. Tambahkan dosen di atas agar mahasiswa bisa memilih dosen saat absensi.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {form.extra_texts.lecturers.map((doc, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#F8F9FA] border border-black/5 hover:border-blue-200 transition-all text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-[#2563EB] text-[10px] font-bold flex items-center justify-center shrink-0">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-[#111827]">{doc}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveLecturer(idx)}
                      className="text-gray-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-all cursor-pointer"
                      title="Hapus dosen"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* BAGIAN 5: KUSTOMISASI SEMUA TEKS */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-2xs p-6 space-y-4">
          <h2 className="text-sm font-bold text-[#111827] uppercase tracking-wider text-[#2563EB] flex items-center gap-2">
            <FileText size={16} />
            5. Kustomisasi Seluruh Teks Halaman
          </h2>

          {/* Row 1: Nama & Badge */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#374151] mb-1.5">
                Nama Instansi / Perguruan Tinggi / Nama Acara <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={form.institution_name}
                onChange={(e) => setForm({ ...form, institution_name: e.target.value })}
                placeholder="Contoh: Pemira HIMASI 2026/2027"
                required
                className="w-full bg-[#F8F9FA] focus:bg-white border border-gray-200 focus:border-[#2563EB] rounded-xl px-3.5 py-2 text-xs font-semibold text-[#111827] outline-hidden transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#374151] mb-1.5">
                Teks Badge Status (Pojok Kanan Atas Navbar)
              </label>
              <input
                type="text"
                value={form.extra_texts?.badge_text || ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    extra_texts: { ...form.extra_texts, badge_text: e.target.value },
                  })
                }
                placeholder="Contoh: Presensi Dibuka / Pemilihan Aktif"
                className="w-full bg-[#F8F9FA] focus:bg-white border border-gray-200 focus:border-[#2563EB] rounded-xl px-3.5 py-2 text-xs font-semibold text-[#111827] outline-hidden transition-all"
              />
            </div>
          </div>

          {/* Row 2: Judul & Subjudul */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#374151] mb-1.5">
                Judul Utama Presensi
              </label>
              <input
                type="text"
                value={form.page_title}
                onChange={(e) => setForm({ ...form, page_title: e.target.value })}
                placeholder="Presensi Pemilihan Raya Mahasiswa"
                className="w-full bg-[#F8F9FA] focus:bg-white border border-gray-200 focus:border-[#2563EB] rounded-xl px-3.5 py-2 text-xs font-semibold text-[#111827] outline-hidden transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#374151] mb-1.5">
                Subjudul di Bawah Logo
              </label>
              <input
                type="text"
                value={form.page_subtitle}
                onChange={(e) => setForm({ ...form, page_subtitle: e.target.value })}
                placeholder="Portal Presensi Kehadiran Pemira HIMASI"
                className="w-full bg-[#F8F9FA] focus:bg-white border border-gray-200 focus:border-[#2563EB] rounded-xl px-3.5 py-2 text-xs font-semibold text-[#111827] outline-hidden transition-all"
              />
            </div>
          </div>

          {/* Pengumuman */}
          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1.5">
              Teks Pengumuman Banner (Kosongkan jika tidak ingin ditampilkan)
            </label>
            <textarea
              value={form.announcement}
              onChange={(e) => setForm({ ...form, announcement: e.target.value })}
              rows={2}
              placeholder="Contoh: Batas absensi matakuliah dibuka mulai jam 07:00 hingga 17:00 WIB."
              className="w-full bg-[#F8F9FA] focus:bg-white border border-gray-200 focus:border-[#2563EB] rounded-xl px-3.5 py-2 text-xs text-[#111827] outline-hidden transition-all"
            />
          </div>

          {/* 3 Highlight Cards */}
          <div className="pt-2">
            <label className="block text-xs font-bold text-[#111827] mb-2">
              3 Kartu Informasi di Bawah Banner:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Card 1 */}
              <div className="p-3 bg-[#F8F9FA] rounded-xl border border-gray-200 space-y-2">
                <span className="text-[11px] font-bold text-blue-600 block">Kartu 1 (Waktu)</span>
                <input
                  type="text"
                  value={form.extra_texts?.card1_title || ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      extra_texts: { ...form.extra_texts, card1_title: e.target.value },
                    })
                  }
                  placeholder="Judul: Waktu Presensi"
                  className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                />
                <input
                  type="text"
                  value={form.extra_texts?.card1_desc || ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      extra_texts: { ...form.extra_texts, card1_desc: e.target.value },
                    })
                  }
                  placeholder="Subteks: 07.00 - 17.00 WIB"
                  className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-[11px]"
                />
              </div>

              {/* Card 2 */}
              <div className="p-3 bg-[#F8F9FA] rounded-xl border border-gray-200 space-y-2">
                <span className="text-[11px] font-bold text-emerald-600 block">Kartu 2 (Presisi)</span>
                <input
                  type="text"
                  value={form.extra_texts?.card2_title || ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      extra_texts: { ...form.extra_texts, card2_title: e.target.value },
                    })
                  }
                  placeholder="Judul: Presisi NIM"
                  className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                />
                <input
                  type="text"
                  value={form.extra_texts?.card2_desc || ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      extra_texts: { ...form.extra_texts, card2_desc: e.target.value },
                    })
                  }
                  placeholder="Subteks: Anti-typo & Auto-fill"
                  className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-[11px]"
                />
              </div>

              {/* Card 3 */}
              <div className="p-3 bg-[#F8F9FA] rounded-xl border border-gray-200 space-y-2">
                <span className="text-[11px] font-bold text-indigo-600 block">Kartu 3 (Integrasi)</span>
                <input
                  type="text"
                  value={form.extra_texts?.card3_title || ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      extra_texts: { ...form.extra_texts, card3_title: e.target.value },
                    })
                  }
                  placeholder="Judul: Sinkronisasi"
                  className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                />
                <input
                  type="text"
                  value={form.extra_texts?.card3_desc || ''}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      extra_texts: { ...form.extra_texts, card3_desc: e.target.value },
                    })
                  }
                  placeholder="Subteks: Terkoneksi Sheets"
                  className="w-full bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-[11px]"
                />
              </div>
            </div>
          </div>

          {/* Panduan Presensi Text */}
          <div className="pt-2">
            <label className="block text-xs font-semibold text-[#374151] mb-1.5">
              Judul Kotak Panduan
            </label>
            <input
              type="text"
              value={form.extra_texts?.instruction_title || ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  extra_texts: { ...form.extra_texts, instruction_title: e.target.value },
                })
              }
              placeholder="Panduan Presensi Mahasiswa"
              className="w-full bg-[#F8F9FA] focus:bg-white border border-gray-200 focus:border-[#2563EB] rounded-xl px-3.5 py-2 text-xs font-semibold text-[#111827] outline-hidden mb-3"
            />

            <label className="block text-xs font-semibold text-[#374151] mb-1.5">
              Poin-Poin Panduan (1 baris = 1 poin bullet)
            </label>
            <textarea
              value={instructionText}
              onChange={(e) => setInstructionText(e.target.value)}
              rows={4}
              placeholder="Tuliskan setiap poin panduan di baris baru..."
              className="w-full bg-[#F8F9FA] focus:bg-white border border-gray-200 focus:border-[#2563EB] rounded-xl px-3.5 py-2 text-xs text-[#111827] outline-hidden"
            />
          </div>

          {/* Footer Text */}
          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1.5">
              Teks Footer Bawah
            </label>
            <input
              type="text"
              value={form.extra_texts?.footer_text || ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  extra_texts: { ...form.extra_texts, footer_text: e.target.value },
                })
              }
              placeholder="Sistem Absensi Terintegrasi."
              className="w-full bg-[#F8F9FA] focus:bg-white border border-gray-200 focus:border-[#2563EB] rounded-xl px-3.5 py-2 text-xs text-[#111827] outline-hidden"
            />
          </div>
        </div>

        {/* SUBMIT BUTTON */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white px-6 py-2.5 rounded-xl font-bold text-xs shadow-xs transition-all cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Menyimpan Seluruh Pengaturan...</span>
              </>
            ) : (
              <>
                <Save size={16} />
                <span>Simpan Perubahan Teks</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
