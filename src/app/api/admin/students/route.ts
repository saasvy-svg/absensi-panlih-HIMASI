import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { normalizeAngkatan } from '@/utils/angkatan';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const className = searchParams.get('class');

    const supabase = createAdminClient();
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

    return NextResponse.json({ data: data || [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const supabase = createAdminClient();

    // Check if bulk insert
    if (Array.isArray(body.students)) {
      const records = body.students.map((s: any) => ({
        nim: String(s.nim).trim(),
        name: String(s.name).trim(),
        class_name: normalizeAngkatan(String(s.class_name || s.class || s.angkatan || '25')),
        is_active: true,
      }));

      const { data, error } = await supabase
        .from('students')
        .upsert(records, { onConflict: 'nim' })
        .select();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: `Berhasil mengimpor ${records.length} data mahasiswa!`,
        count: records.length,
      });
    }

    // Single student insert
    const { nim, name, class_name, phone } = body;
    if (!nim || !name || !class_name) {
      return NextResponse.json(
        { error: 'NIM, Nama, dan Angkatan wajib diisi' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('students')
      .upsert(
        {
          nim: String(nim).trim(),
          name: String(name).trim(),
          class_name: normalizeAngkatan(String(class_name)),
          phone: phone ? String(phone).trim() : null,
          is_active: true,
        },
        { onConflict: 'nim' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Data mahasiswa berhasil disimpan!',
      data,
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
