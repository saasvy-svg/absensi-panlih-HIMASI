import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getWIBDate, getWIBLocaleString } from '@/lib/utils';
import { resolveActiveDay } from '@/lib/dayHelper';
import { normalizeAngkatan } from '@/utils/angkatan';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || getWIBDate();
    const supabase = createAdminClient();

    // 1. Ambil config landing settings (voting records, dosen, day settings)
    const { data: landingData } = await supabase
      .from('landing_settings')
      .select('extra_texts')
      .maybeSingle();

    const extraTexts = landingData?.extra_texts || {};
    const votingRecords: Record<string, { has_voted: boolean; voted_at?: string; notes?: string }> =
      extraTexts.voting_records || {};
    const onlineMembers: Record<string, 'online' | 'offline'> = extraTexts.online_members || {};
    const lecturers: string[] = extraTexts.lecturers || [];

    // 2. Ambil master mahasiswa
    const { data: allStudents, error: stdError } = await supabase
      .from('students')
      .select('*')
      .eq('is_active', true)
      .order('nim', { ascending: true });

    if (stdError) {
      return NextResponse.json({ error: stdError.message }, { status: 500 });
    }

    const studentTypeMap = new Map<string, 'online' | 'offline'>();
    (allStudents || []).forEach((s: any) => {
      const uNim = String(s.nim).trim().toUpperCase();
      const t = s.attendance_type === 'online' || onlineMembers[uNim] === 'online' ? 'online' : 'offline';
      studentTypeMap.set(uNim, t);
    });

    // 3. Ambil absensi pada tanggal target
    const { data: attendances, error: attError } = await supabase
      .from('attendances')
      .select('*')
      .eq('attendance_date', date)
      .order('check_in_time', { ascending: true });

    if (attError) {
      return NextResponse.json({ error: attError.message }, { status: 500 });
    }

    const attMap = new Map<string, any>();
    (attendances || []).forEach((att) => {
      if (att.nim) attMap.set(String(att.nim).trim().toUpperCase(), att);
      if (att.name) attMap.set(String(att.name).trim().toUpperCase(), att);
    });

    // 4. Susun daftar hadir (Berhak Mencoblos / Antrean Bilik Suara)
    // Diurutkan berdasarkan jam presensi paling awal (check_in_time ASC)
    const presentList = (attendances || []).map((att, idx) => {
      const nimKey = String(att.nim || '').trim().toUpperCase();
      const voteInfo = votingRecords[nimKey] || { has_voted: false, voted_at: null };
      const attType = studentTypeMap.get(nimKey) || onlineMembers[nimKey] || onlineMembers[String(att.name || '').trim().toUpperCase()] || 'offline';

      return {
        queue_number: idx + 1,
        id: att.id,
        nim: att.nim,
        name: att.name,
        class_name: normalizeAngkatan(att.class_name),
        check_in_time: att.check_in_time,
        attendance_date: att.attendance_date,
        status: att.status,
        attendance_type: attType,
        has_voted: Boolean(voteInfo.has_voted),
        voted_at: voteInfo.voted_at || null,
        notes: voteInfo.notes || att.notes || null,
      };
    });

    // 5. Susun daftar yang belum hadir
    const absentList: any[] = [];
    (allStudents || []).forEach((s) => {
      const nimKey = String(s.nim || '').trim().toUpperCase();
      if (!attMap.has(nimKey)) {
        absentList.push({
          id: s.id,
          nim: s.nim,
          name: s.name,
          class_name: normalizeAngkatan(s.class_name),
          attendance_type: studentTypeMap.get(nimKey) || 'offline',
          has_voted: false,
        });
      }
    });

    // Dosen yang belum hadir
    lecturers.forEach((docName, idx) => {
      const docNim = `DOSEN-${String(idx + 1).padStart(2, '0')}`;
      const docKey = docName.toUpperCase();
      const docType = onlineMembers[docKey] || onlineMembers[docNim] || 'offline';

      if (!attMap.has(docName.toUpperCase()) && !attMap.has(docNim)) {
        absentList.push({
          id: `dosen-${idx + 1}`,
          nim: docNim,
          name: docName,
          class_name: 'Dosen',
          attendance_type: docType,
          has_voted: false,
        });
      }
    });

    // 6. Hitung metrik rekapitulasi bilik suara
    const totalDpt = (allStudents?.length || 0) + lecturers.length;
    const totalPresent = presentList.length;
    const votedCount = presentList.filter((p) => p.has_voted).length;
    const waitingCount = totalPresent - votedCount;
    const turnoutPercentage = totalPresent > 0 ? Math.round((votedCount / totalPresent) * 100) : 0;

    return NextResponse.json({
      success: true,
      date,
      stats: {
        totalDpt,
        totalPresent,
        votedCount,
        waitingCount,
        turnoutPercentage,
      },
      presentList,
      absentList,
    });
  } catch (error: any) {
    console.error('Voting queue API error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { nim, has_voted, notes } = body;

    if (!nim) {
      return NextResponse.json({ error: 'NIM wajib disertakan' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const nimKey = String(nim).trim().toUpperCase();

    // 1. Ambil landing settings saat ini
    const { data: landingData, error: fetchErr } = await supabase
      .from('landing_settings')
      .select('*')
      .maybeSingle();

    if (fetchErr || !landingData) {
      return NextResponse.json({ error: 'Gagal mengambil data pengaturan' }, { status: 500 });
    }

    const extraTexts = landingData.extra_texts || {};
    const votingRecords = extraTexts.voting_records || {};

    const nowWib = getWIBLocaleString();

    if (has_voted) {
      votingRecords[nimKey] = {
        has_voted: true,
        voted_at: nowWib,
        notes: notes || null,
      };
    } else {
      // Un-vote / Undo
      delete votingRecords[nimKey];
    }

    const updatedExtra = {
      ...extraTexts,
      voting_records: votingRecords,
    };

    // 2. Simpan kembali ke Supabase
    const { error: updateErr } = await supabase
      .from('landing_settings')
      .update({
        extra_texts: updatedExtra,
        updated_at: new Date().toISOString(),
      })
      .eq('id', landingData.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      nim: nimKey,
      has_voted: Boolean(has_voted),
      voted_at: has_voted ? nowWib : null,
      message: has_voted
        ? `Pemilih ${nimKey} berhasil ditandai SUDAH MENCOBLOS! 🗳️`
        : `Status mencoblos untuk ${nimKey} berhasil dibatalkan.`,
    });
  } catch (error: any) {
    console.error('Voting toggle API error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
