import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { resetAttendanceInSheet } from '@/lib/googleSheets';
import { resolveActiveDay } from '@/lib/dayHelper';

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const nim = searchParams.get('nim');
    const date = searchParams.get('date');

    const supabase = createAdminClient();

    let targetAttendance: any = null;

    if (id) {
      const { data } = await supabase
        .from('attendances')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      targetAttendance = data;
    } else if (nim && date) {
      const { data } = await supabase
        .from('attendances')
        .select('*')
        .eq('nim', nim)
        .eq('attendance_date', date)
        .maybeSingle();
      targetAttendance = data;
    }

    if (!targetAttendance) {
      return NextResponse.json(
        { error: 'Data presensi tidak ditemukan di database' },
        { status: 404 }
      );
    }

    // 1. Hapus dari Supabase table attendances
    const { error: deleteError } = await supabase
      .from('attendances')
      .delete()
      .eq('id', targetAttendance.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // 2. Tentukan apakah presensi ini berada di Hari 1 atau Hari 2
    let extraTexts: any = null;
    try {
      const { data: landingData } = await supabase
        .from('landing_settings')
        .select('extra_texts')
        .maybeSingle();
      extraTexts = landingData?.extra_texts || null;
    } catch (e) {}

    const dayResolution = resolveActiveDay(extraTexts, targetAttendance.attendance_date);
    const day =
      targetAttendance.attendance_date === dayResolution.day2Date ||
      (targetAttendance.attendance_date && targetAttendance.attendance_date > dayResolution.day1Date)
        ? 2
        : 1;

    // 3. Reset status pada baris mahasiswa di Google Sheets kembali ke "Belum Hadir" & jam "-"
    try {
      const { data: config } = await supabase
        .from('sheet_configs')
        .select('*')
        .eq('sheet_role', 'admin')
        .maybeSingle();

      if (config && config.sheet_id) {
        await resetAttendanceInSheet(
          config.sheet_id,
          {
            nim: targetAttendance.nim,
            name: targetAttendance.name,
            class_name: targetAttendance.class_name,
            attendance_date: targetAttendance.attendance_date,
          },
          day
        );
      }
    } catch (sheetErr: any) {
      console.error('Google Sheets reset error:', sheetErr);
    }

    return NextResponse.json({
      success: true,
      message: `Presensi ${targetAttendance.name} (${targetAttendance.nim}) berhasil dihapus dan dikembalikan ke 'Belum Hadir'.`,
      deletedRecord: targetAttendance,
    });
  } catch (err: any) {
    console.error('API Delete Attendance Error:', err);
    return NextResponse.json(
      { error: err.message || 'Terjadi kesalahan sistem' },
      { status: 500 }
    );
  }
}
