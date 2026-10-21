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

    // 2. Ambil konfigurasi landing settings (dosen, tanggal Hari 1 & Hari 2)
    const { data: landingData } = await supabase
      .from('landing_settings')
      .select('extra_texts')
      .maybeSingle();

    const extraTexts = landingData?.extra_texts;
    const dayResolution = resolveActiveDay(extraTexts, date);
    const days = dayResolution.days;
    const day1Date = dayResolution.day1Date;
    const day2Date = dayResolution.day2Date;
    const lecturers: string[] = extraTexts?.lecturers || [];

    // 3. Ambil seluruh data master mahasiswa aktif
    const { data: allStudents, error: studentError } = await supabase
      .from('students')
      .select('*')
      .eq('is_active', true)
      .order('nim', { ascending: true });

    if (studentError) {
      return NextResponse.json({ error: studentError.message }, { status: 500 });
    }

    // 4. Ambil data absensi untuk seluruh hari yang dikonfigurasi
    const configuredDates = Array.from(new Set([
      ...days.map((d) => d.date),
      dayResolution.day1Date,
      dayResolution.day2Date,
      ...(date !== 'all' ? [date] : [])
    ])).filter(Boolean);

    let query = supabase
      .from('attendances')
      .select('*')
      .order('check_in_time', { ascending: true });

    if (date !== 'all' && configuredDates.length > 0) {
      query = query.in('attendance_date', configuredDates);
    }

    const { data: attendances, error: attError } = await query;

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
        date,
      });
    }

    // 5. Sinkronkan Roster Master Lengkap ke Tab Model B Matriks
    // [No, NIM / NIP, Nama Lengkap, Angkatan, Hari 1, Hari 2, ..., Total Hadir, Catatan, Sinkron Terakhir]
    const syncResults = await syncCategorizedWithMasterRoster(
      config.sheet_id,
      studentList,
      attendanceList,
      date,
      lecturers,
      {
        days,
        activeDay: dayResolution.activeDay,
      }
    );

    // 6. Update last_synced_at
    await supabase
      .from('sheet_configs')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', config.id);

    const summaryText = syncResults
      .map((r) => `${r.tabName} (${r.count} data${r.day2Generated ? ' • Termasuk Hari 2' : ''})`)
      .join(', ');

    return NextResponse.json({
      success: true,
      message: `Berhasil sinkronisasi roster lengkap ke Google Sheets: ${summaryText}. Status mahasiswa yang belum absen diset 'Belum Hadir' dan akan ter-update otomatis saat mereka presensi.`,
      totalStudents: studentList.length,
      totalPresent: attendanceList.length,
      tabs: syncResults,
      activeDay: dayResolution.activeDay,
      day1Date,
      day2Date,
      date,
    });
  } catch (error: any) {
    console.error('Sheets sync error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
