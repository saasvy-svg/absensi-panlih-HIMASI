import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { extractSheetId } from '@/lib/googleSheets';

export async function GET() {
  try {
    const supabase = createAdminClient();
    const { data: config } = await supabase
      .from('sheet_configs')
      .select('*')
      .eq('sheet_role', 'admin')
      .maybeSingle();

    // Extract service account email from env
    let serviceAccountEmail = 'crm-bot@dogwood-cinema-504217-e0.iam.gserviceaccount.com';
    const keyEnv = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (keyEnv) {
      try {
        const creds = JSON.parse(keyEnv);
        if (creds.client_email) {
          serviceAccountEmail = creds.client_email;
        }
      } catch (e) {}
    }

    return NextResponse.json({
      config: config || {
        sheet_id: '',
        sheet_role: 'admin',
        sheet_name: 'Presensi',
        sync_mode: 'manual',
      },
      serviceAccountEmail,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sheet_id, sync_mode = 'manual', sheet_name = 'Presensi' } = body;

    const cleanedSheetId = extractSheetId(sheet_id || '');
    if (!cleanedSheetId) {
      return NextResponse.json({ error: 'Sheet ID tidak boleh kosong' }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('sheet_configs')
      .upsert(
        {
          sheet_role: 'admin',
          sheet_id: cleanedSheetId,
          sheet_name,
          sync_mode,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'sheet_role' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Konfigurasi Google Sheets berhasil disimpan!',
      data,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
