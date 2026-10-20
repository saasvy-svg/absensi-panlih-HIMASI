import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { normalizeAngkatan } from '@/utils/angkatan';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const className = searchParams.get('class');

    const supabase = createAdminClient();

    // 1. Ambil data master mahasiswa
    let studentQuery = supabase
      .from('students')
      .select('id, nim, name, class_name')
      .eq('is_active', true);

    if (className && className !== 'all' && className !== 'Dosen') {
      studentQuery = studentQuery.eq('class_name', className);
    }

    const { data: allStudents, error: studentError } = await studentQuery;
    if (studentError) {
      return NextResponse.json({ error: studentError.message }, { status: 500 });
    }

    // 2. Ambil data dosen dari landing settings
    const { data: landingData } = await supabase
      .from('landing_settings')
      .select('extra_texts')
      .maybeSingle();

    const registeredLecturers: string[] = landingData?.extra_texts?.lecturers || [];

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

        if (attendanceMapByNim.has(upperNim)) {
          const item = attendanceMapByNim.get(upperNim);
          presentList.push({
            ...item,
            class_name: normalizeAngkatan(item.class_name),
          });
        } else {
          absentList.push({
            id: student.id,
            nim: student.nim,
            name: student.name,
            class_name: normalizedClass,
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

        const foundAtt = attendanceMapByName.get(upperName);
        if (foundAtt) {
          presentList.push({
            ...foundAtt,
            class_name: 'Dosen',
            lecturer_name: docName,
          });
        } else {
          absentList.push({
            id: `dosen-${idx + 1}`,
            nim: `DOSEN-${String(idx + 1).padStart(2, '0')}`,
            name: docName,
            class_name: 'Dosen',
            lecturer_name: docName,
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
          presentList.push({
            ...att,
            class_name: 'Dosen',
            lecturer_name: att.name,
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
          presentList.push({
            ...att,
            class_name: normalizeAngkatan(att.class_name),
          });
        }
      }
    });

    const totalTarget = presentList.length + absentList.length;
    const totalPresent = presentList.length;
    const totalAbsent = absentList.length;
    const attendancePercentage = totalTarget > 0 ? Math.round((totalPresent / totalTarget) * 100) : 0;

    return NextResponse.json({
      date,
      totalStudents: (allStudents || []).length,
      totalLecturers: registeredLecturers.length,
      totalTarget,
      totalPresent,
      totalAbsent,
      attendancePercentage,
      presentList,
      absentList,
      allCombined: [...presentList, ...absentList],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
