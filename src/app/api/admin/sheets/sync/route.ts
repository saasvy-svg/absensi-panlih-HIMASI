import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { syncCategorizedWithMasterRoster } from '@/lib/googleSheets';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];

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

    // 2. Ambil seluruh data master mahasiswa aktif
    const { data: allStudents, error: studentError } = await supabase
      .from('students')
      .select('*')
      .eq('is_active', true)
      .order('nim', { ascending: true });

    if (studentError) {
      return NextResponse.json({ error: studentError.message }, { status: 500 });
    }

    // 3. Ambil data absensi pada tanggal tersebut
    let query = supabase
      .from('attendances')
      .select('*')
      .order('check_in_time', { ascending: true });

    if (date !== 'all') {
      query = query.eq('attendance_date', date);
    }

    const { data: attendances, error: attError } = await query;

    if (attError) {
      return NextResponse.json({ error: attError.message }, { status: 500 });
    }

    const studentList = allStudents || [];
    const attendanceList = attendances || [];

    // Ambil daftar dosen aktif dari landing settings
    const { data: landingData } = await supabase
      .from('landing_settings')
      .select('extra_texts')
      .maybeSingle();

    const lecturers: string[] = landingData?.extra_texts?.lecturers || [];

    if (studentList.length === 0 && attendanceList.length === 0 && lecturers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Belum ada data master mahasiswa, dosen, atau absensi untuk disinkronkan.',
        rowsSynced: 0,
        date,
      });
    }

    // 4. Sinkronkan Roster Master Lengkap ke Tab masing-masing (Angkatan 25, Angkatan 26, Dosen)
    // Mahasiswa dan Dosen yang belum absen otomatis tercatat "Belum Hadir" (dengan jam "-")
    // Mahasiswa dan Dosen yang sudah absen tercatat "Hadir" lengkap dengan jam masuk
    const syncResults = await syncCategorizedWithMasterRoster(
      config.sheet_id,
      studentList,
      attendanceList,
      date,
      lecturers
    );

    // 5. Update last_synced_at
    await supabase
      .from('sheet_configs')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', config.id);

    const summaryText = syncResults
      .map((r) => `${r.tabName} (${r.count} data)`)
      .join(', ');

    return NextResponse.json({
      success: true,
      message: `Berhasil sinkronisasi roster lengkap ke Google Sheets: ${summaryText}. Status mahasiswa yang belum absen diset 'Belum Hadir' dan akan ter-update otomatis saat mereka presensi.`,
      totalStudents: studentList.length,
      totalPresent: attendanceList.length,
      tabs: syncResults,
      date,
    });
  } catch (error: any) {
    console.error('Sheets sync error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
