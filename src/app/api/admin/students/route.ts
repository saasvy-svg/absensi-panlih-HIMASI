import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { normalizeAngkatan } from '@/utils/angkatan';

function parseAttendanceType(val: any): 'online' | 'offline' {
  if (!val) return 'offline';
  const str = String(val).trim().toLowerCase();
  if (str === 'online' || str === 'daring' || str === 'on' || str === '1' || str === 'true') {
    return 'online';
  }
  return 'offline';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const className = searchParams.get('class');
    const typeFilter = searchParams.get('type'); // 'online' | 'offline' | 'all'

    const supabase = createAdminClient();

    // Ambil online_members dari landing_settings untuk sinkronisasi fallback
    const { data: landingData } = await supabase
      .from('landing_settings')
      .select('extra_texts')
      .maybeSingle();

    const onlineMembers: Record<string, 'online' | 'offline'> = landingData?.extra_texts?.online_members || {};

    let query = supabase
      .from('students')
      .select('*')
      .order('class_name', { ascending: true })
      .order('name', { ascending: true });

    if (className && className !== 'all') {
      query = query.eq('class_name', className);
    }

    if (search) {
      query = query.or(`nim.ilike.%${search}%,name.ilike.%${search}%`);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Gabungkan attendance_type dari DB atau dari extra_texts.online_members
    let list = (data || []).map((s: any) => {
      const upperNim = String(s.nim).trim().toUpperCase();
      const resolvedType: 'online' | 'offline' = s.attendance_type
        ? (s.attendance_type.toLowerCase() === 'online' ? 'online' : 'offline')
        : (onlineMembers[upperNim] || 'offline');

      return {
        ...s,
        attendance_type: resolvedType,
      };
    });

    if (typeFilter && typeFilter !== 'all') {
      list = list.filter((s) => s.attendance_type === typeFilter);
    }

    return NextResponse.json({ data: list });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    // Ambil extra_texts saat ini untuk sinkronisasi online_members
    const { data: landingData } = await supabase
      .from('landing_settings')
      .select('id, extra_texts')
      .maybeSingle();

    const extraTexts = landingData?.extra_texts || {};
    const onlineMembers: Record<string, 'online' | 'offline'> = { ...(extraTexts.online_members || {}) };

    // Check if bulk insert
    if (Array.isArray(body.students)) {
      const records = body.students.map((s: any) => {
        const nim = String(s.nim).trim();
        const attType = parseAttendanceType(s.attendance_type || s.tipe || s.type || s.mode);
        // Catat ke map online_members
        onlineMembers[nim.toUpperCase()] = attType;

        return {
          nim,
          name: String(s.name).trim(),
          class_name: normalizeAngkatan(String(s.class_name || s.class || s.angkatan || '25')),
          attendance_type: attType,
          is_active: true,
        };
      });

      // Coba upsert dengan kolom attendance_type
      let { data, error } = await supabase
        .from('students')
        .upsert(records, { onConflict: 'nim' })
        .select();

      // Fallback jika kolom attendance_type belum ditambahkan di DB
      if (error && error.message.includes('attendance_type')) {
        const strippedRecords = records.map(({ attendance_type, ...rest }: any) => rest);
        const retry = await supabase
          .from('students')
          .upsert(strippedRecords, { onConflict: 'nim' })
          .select();
        data = retry.data;
        error = retry.error;
      }

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Simpan pembaruan online_members ke landing_settings
      if (landingData) {
        await supabase
          .from('landing_settings')
          .update({
            extra_texts: {
              ...extraTexts,
              online_members: onlineMembers,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', landingData.id);
      }

      return NextResponse.json({
        success: true,
        message: `Berhasil mengimpor & memperbarui ${records.length} data mahasiswa (Online/Offline tersinkron)!`,
        count: records.length,
      });
    }

    // Single student insert
    const { nim, name, class_name, phone, attendance_type } = body;
    if (!nim || !name || !class_name) {
      return NextResponse.json(
        { error: 'NIM, Nama, dan Angkatan wajib diisi' },
        { status: 400 }
      );
    }

    const cleanNim = String(nim).trim();
    const attType = parseAttendanceType(attendance_type);
    onlineMembers[cleanNim.toUpperCase()] = attType;

    const payload: any = {
      nim: cleanNim,
      name: String(name).trim(),
      class_name: normalizeAngkatan(String(class_name)),
      phone: phone ? String(phone).trim() : null,
      attendance_type: attType,
      is_active: true,
    };

    let { data, error } = await supabase
      .from('students')
      .upsert(payload, { onConflict: 'nim' })
      .select()
      .single();

    if (error && error.message.includes('attendance_type')) {
      delete payload.attendance_type;
      const retry = await supabase
        .from('students')
        .upsert(payload, { onConflict: 'nim' })
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Simpan ke online_members
    if (landingData) {
      await supabase
        .from('landing_settings')
        .update({
          extra_texts: {
            ...extraTexts,
            online_members: onlineMembers,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', landingData.id);
    }

    return NextResponse.json({
      success: true,
      message: 'Data mahasiswa berhasil disimpan!',
      data: {
        ...data,
        attendance_type: attType,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, nim, attendance_type } = body;

    if (!nim && !id) {
      return NextResponse.json({ error: 'NIM atau ID mahasiswa wajib disertakan' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const nextType: 'online' | 'offline' = parseAttendanceType(attendance_type);

    // 1. Update landing_settings.extra_texts.online_members
    const { data: landingData } = await supabase
      .from('landing_settings')
      .select('id, extra_texts')
      .maybeSingle();

    if (landingData) {
      const extraTexts = landingData.extra_texts || {};
      const onlineMembers: Record<string, 'online' | 'offline'> = { ...(extraTexts.online_members || {}) };

      if (nim) {
        onlineMembers[String(nim).trim().toUpperCase()] = nextType;
      }

      await supabase
        .from('landing_settings')
        .update({
          extra_texts: {
            ...extraTexts,
            online_members: onlineMembers,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', landingData.id);
    }

    // 2. Coba update kolom di tabel students jika ada
    try {
      let query = supabase.from('students').update({ attendance_type: nextType });
      if (id) {
        query = query.eq('id', id);
      } else if (nim) {
        query = query.ilike('nim', String(nim).trim());
      }
      await query;
    } catch (e) {}

    return NextResponse.json({
      success: true,
      message: `Status berhasil diubah menjadi ${nextType.toUpperCase()}!`,
      attendance_type: nextType,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID wajib disertakan' }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase.from('students').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Data mahasiswa berhasil dihapus' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
