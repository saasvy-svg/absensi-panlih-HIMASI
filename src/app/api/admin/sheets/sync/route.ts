import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { syncCategorizedWithMasterRoster } from '@/lib/googleSheets';
import { getWIBDate } from '@/lib/utils';
import { getNextWIBDate, resolveActiveDay } from '@/lib/dayHelper';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || getWIBDate();

    const supabase = createAdminClient();

    // 1. Get Sheet Config
    const { data: config } = await supabase
      .from('sheet_configs')
      .select('*')
      .eq('sheet_role', 'admin')
      .maybeSingle();

    if (!config || !config.sheet_id) {
      return NextResponse.json(
        { error: 'Konfigurasi Google Sheets belum diatur.' },
        { status: 400 }
      );
    }

    // 2. Ambil konfigurasi landing settings & tanggal-tanggal yang ada
    const { data: landingData } = await supabase
      .from('landing_settings')
      .select('extra_texts')
      .maybeSingle();

    const extraTexts = landingData?.extra_texts || {};
    const lecturers: string[] = extraTexts.lecturers || [];
    const onlineMembers: Record<string, 'online' | 'offline'> = extraTexts.online_members || {};

    // Ambil seluruh tanggal unik yang pernah memiliki catatan presensi
    const { data: distinctAtts } = await supabase
      .from('attendances')
      .select('attendance_date');

    const historicalDates = Array.from(new Set(
      (distinctAtts || []).map((a) => a.attendance_date).filter(Boolean)
    )) as string[];

    // Kumpulkan tanggal dari konfigurasi
    const configuredDaysList = extraTexts.days || [];
    const configuredDates = [
      ...configuredDaysList.map((d: any) => d.date),
      extraTexts.day1_date,
      extraTexts.day2_date,
    ].filter(Boolean) as string[];

    // Target tanggal sesi yang sedang disinkronkan
    const targetDate = date !== 'all' ? date : getWIBDate();

    // Gabungkan seluruh tanggal unik secara urut (cth: '2026-10-21', '2026-10-23')
    const allUniqueDates = Array.from(new Set([
      ...historicalDates,
      ...configuredDates,
      targetDate
    ])).filter((d) => d && d !== 'all').sort();

    // Susun daftar hari/tanggal dinamis (jika ada tanggal baru, otomatis nambah kolom)
    const days = allUniqueDates.map((dStr, idx) => {
      const configured = configuredDaysList.find((d: any) => d.date === dStr);
      const parts = dStr.split('-');
      const formatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dStr;
      return {
        dayNumber: idx + 1,
        date: dStr,
        label: configured?.label || formatted,
      };
    });

    const dayResolution = resolveActiveDay(extraTexts, targetDate);

    // 3. Ambil seluruh data master mahasiswa aktif
    const { data: allStudents, error: studentError } = await supabase
      .from('students')
      .select('*')
      .eq('is_active', true)
      .order('nim', { ascending: true });

    if (studentError) {
      return NextResponse.json({ error: studentError.message }, { status: 500 });
    }

    // 4. Ambil data absensi untuk seluruh tanggal yang terdaftar (kemarin + besok dst)
    const { data: attendances, error: attError } = await supabase
      .from('attendances')
      .select('*')
      .in('attendance_date', allUniqueDates)
      .order('check_in_time', { ascending: true });

    if (attError) {
      return NextResponse.json({ error: attError.message }, { status: 500 });
    }

    const studentList = allStudents || [];
    const attendanceList = attendances || [];

    if (studentList.length === 0 && attendanceList.length === 0 && lecturers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Belum ada data master mahasiswa, dosen, atau absensi untuk disinkronkan.',
        rowsSynced: 0,
        date: targetDate,
      });
    }

    // 5. Sinkronkan Roster Master Lengkap ke Tab Model B Matriks
    // [No, NIM / NIP, Nama Lengkap, Angkatan, Tipe Presensi, 21/10/2026, 23/10/2026, ..., Total Hadir, Catatan, Sinkron Terakhir]
    const syncResults = await syncCategorizedWithMasterRoster(
      config.sheet_id,
      studentList,
      attendanceList,
      targetDate,
      lecturers,
      {
        days,
        activeDay: dayResolution.activeDay,
        onlineMembers,
      }
    );

    // 6. Update last_synced_at
    await supabase
      .from('sheet_configs')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', config.id);

    const summaryText = syncResults
      .map((r: any) => `${r.tabName} (${r.count} data${r.day2Generated ? ' • Termasuk Hari 2' : ''})`)
      .join(', ');

    return NextResponse.json({
      success: true,
      message: `Berhasil sinkronisasi roster lengkap ke Google Sheets: ${summaryText}. Status mahasiswa yang belum absen diset 'Belum Hadir' dan akan ter-update otomatis saat mereka presensi.`,
      totalStudents: studentList.length,
      totalPresent: attendanceList.length,
      tabs: syncResults,
      activeDay: dayResolution.activeDay,
      day1Date: dayResolution.day1Date,
      day2Date: dayResolution.day2Date,
      days,
      date: targetDate,
    });
  } catch (error: any) {
    console.error('Sheets sync error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
