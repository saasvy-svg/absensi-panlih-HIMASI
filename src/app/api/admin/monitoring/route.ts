import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { normalizeAngkatan } from '@/utils/angkatan';
import { getWIBDate } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || getWIBDate();
    const className = searchParams.get('class');

    const supabase = createAdminClient();

    // 1. Ambil data master mahasiswa
    let studentQuery = supabase
      .from('students')
      .select('*')
      .eq('is_active', true);

    if (className && className !== 'all' && className !== 'Dosen') {
      studentQuery = studentQuery.eq('class_name', className);
    }

    const { data: allStudents, error: studentError } = await studentQuery;
    if (studentError) {
      return NextResponse.json({ error: studentError.message }, { status: 500 });
    }

    // 2. Ambil data dosen & online_members dari landing settings
    const { data: landingData } = await supabase
      .from('landing_settings')
      .select('extra_texts')
      .maybeSingle();

    const registeredLecturers: string[] = landingData?.extra_texts?.lecturers || [];
    const onlineMembers: Record<string, 'online' | 'offline'> = landingData?.extra_texts?.online_members || {};

    const studentTypeMap = new Map<string, 'online' | 'offline'>();
    (allStudents || []).forEach((s: any) => {
      const uNim = String(s.nim).trim().toUpperCase();
      const t = s.attendance_type === 'online' || onlineMembers[uNim] === 'online' ? 'online' : 'offline';
      studentTypeMap.set(uNim, t);
    });

    // 3. Ambil data absensi pada tanggal tersebut
    let attQuery = supabase
      .from('attendances')
      .select('*')
      .eq('attendance_date', date)
      .order('check_in_time', { ascending: false });

    if (className && className !== 'all') {
      if (className === 'Dosen') {
        attQuery = attQuery.or('class_name.ilike.%dosen%,nim.ilike.DOSEN%');
      } else {
        attQuery = attQuery.eq('class_name', className);
      }
    }

    const { data: attendances, error: attError } = await attQuery;
    if (attError) {
      return NextResponse.json({ error: attError.message }, { status: 500 });
    }

    // 4. Petakan siapa yang sudah absen dan siapa yang belum
    const attendanceMapByNim = new Map();
    const attendanceMapByName = new Map();

    (attendances || []).forEach((att) => {
      if (att.nim) attendanceMapByNim.set(String(att.nim).trim().toUpperCase(), att);
      if (att.name) attendanceMapByName.set(String(att.name).trim().toUpperCase(), att);
    });

    const presentList: any[] = [];
    const absentList: any[] = [];

    // Proses Mahasiswa (jika filter bukan khusus Dosen)
    if (!className || className === 'all' || className !== 'Dosen') {
      (allStudents || []).forEach((student) => {
        const normalizedClass = normalizeAngkatan(student.class_name);
        const upperNim = String(student.nim).trim().toUpperCase();
        const attType = studentTypeMap.get(upperNim) || 'offline';

        if (attendanceMapByNim.has(upperNim)) {
          const item = attendanceMapByNim.get(upperNim);
          presentList.push({
            ...item,
            class_name: normalizeAngkatan(item.class_name),
            attendance_type: attType,
          });
        } else {
          absentList.push({
            id: student.id,
            nim: student.nim,
            name: student.name,
            class_name: normalizedClass,
            attendance_type: attType,
            status: 'Belum Hadir',
            check_in_time: null,
            attendance_date: date,
          });
        }
      });
    }

    // Proses Dosen (jika filter 'all' atau 'Dosen')
    if (!className || className === 'all' || className === 'Dosen') {
      const processedDosenNames = new Set<string>();

      registeredLecturers.forEach((docName, idx) => {
        const upperName = docName.trim().toUpperCase();
        processedDosenNames.add(upperName);
        const docNim = `DOSEN-${String(idx + 1).padStart(2, '0')}`;
        const docType = onlineMembers[upperName] || onlineMembers[docNim] || 'offline';

        const foundAtt = attendanceMapByName.get(upperName);
        if (foundAtt) {
          presentList.push({
            ...foundAtt,
            class_name: 'Dosen',
            lecturer_name: docName,
            attendance_type: docType,
          });
        } else {
          absentList.push({
            id: `dosen-${idx + 1}`,
            nim: docNim,
            name: docName,
            class_name: 'Dosen',
            lecturer_name: docName,
            attendance_type: docType,
            status: 'Belum Hadir',
            check_in_time: null,
            attendance_date: date,
          });
        }
      });

      // Dosen lain yang presensi tapi namanya belum ada di registeredLecturers
      (attendances || []).forEach((att) => {
        const isDosen =
          att.lecturer_name ||
          (att.nim && String(att.nim).toUpperCase().startsWith('DOSEN')) ||
          (att.class_name && String(att.class_name).toLowerCase().includes('dosen'));

        if (isDosen && att.name && !processedDosenNames.has(String(att.name).trim().toUpperCase())) {
          const upperName = String(att.name).trim().toUpperCase();
          const docType = onlineMembers[upperName] || 'offline';
          presentList.push({
            ...att,
            class_name: 'Dosen',
            lecturer_name: att.name,
            attendance_type: docType,
          });
        }
      });
    }

    // Presensi mahasiswa yang mungkin tidak ada di master students
    (attendances || []).forEach((att) => {
      const isDosen =
        att.lecturer_name ||
        (att.nim && String(att.nim).toUpperCase().startsWith('DOSEN')) ||
        (att.class_name && String(att.class_name).toLowerCase().includes('dosen'));

      if (!isDosen && !allStudents?.some((s) => s.nim === att.nim)) {
        if (!presentList.some((p) => p.nim === att.nim)) {
          const uNim = String(att.nim || '').trim().toUpperCase();
          presentList.push({
            ...att,
            class_name: normalizeAngkatan(att.class_name),
            attendance_type: studentTypeMap.get(uNim) || onlineMembers[uNim] || 'offline',
          });
        }
      }
    });

    const totalTarget = presentList.length + absentList.length;
    const totalPresent = presentList.length;
    const totalAbsent = absentList.length;
    const attendancePercentage = totalTarget > 0 ? Math.round((totalPresent / totalTarget) * 100) : 0;

    // Metrik Pemilih / Peserta Online
    const onlinePresent = presentList.filter((p) => p.attendance_type === 'online').length;
    const onlineAbsent = absentList.filter((a) => a.attendance_type === 'online').length;
    const onlineTotal = onlinePresent + onlineAbsent;

    return NextResponse.json({
      date,
      totalStudents: (allStudents || []).length,
      totalLecturers: registeredLecturers.length,
      totalTarget,
      totalPresent,
      totalAbsent,
      attendancePercentage,
      onlineStats: {
        total: onlineTotal,
        present: onlinePresent,
        absent: onlineAbsent,
        turnoutPercentage: onlineTotal > 0 ? Math.round((onlinePresent / onlineTotal) * 100) : 0,
      },
      presentList,
      absentList,
      allCombined: [...presentList, ...absentList],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
