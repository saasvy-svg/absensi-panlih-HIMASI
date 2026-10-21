import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    const supabase = createAdminClient();

    // 1. Direct Signed Upload URL Request
    // Memungkinkan upload foto resolusi tinggi hingga 25 MB langsung dari browser ke Supabase
    // tanpa melewati batas body payload Vercel (4.5 MB) dan TANPA kompresi (kualitas asli 100%)
    if (contentType.includes('application/json')) {
      const body = await request.json();
      const { fileName, fileType, folder = 'banners' } = body;

      if (!fileName || !fileType) {
        return NextResponse.json({ error: 'Nama dan tipe file wajib diisi' }, { status: 400 });
      }

      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'];
      if (!validTypes.includes(fileType)) {
        return NextResponse.json(
          { error: 'Format file tidak didukung. Harap upload gambar (JPG, PNG, WebP, SVG).' },
          { status: 400 }
        );
      }

      const ext = fileName.split('.').pop() || 'png';
      const cleanFileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

      const { data: signData, error: signError } = await supabase.storage
        .from('landing-assets')
        .createSignedUploadUrl(cleanFileName);

      if (signError || !signData) {
        return NextResponse.json(
          { error: `Gagal membuat URL upload: ${signError?.message || 'Unknown error'}` },
          { status: 500 }
        );
      }

      const { data: urlData } = supabase.storage
        .from('landing-assets')
        .getPublicUrl(cleanFileName);

      return NextResponse.json({
        success: true,
        cleanPath: cleanFileName,
        token: signData.token,
        signedUrl: signData.signedUrl,
        publicUrl: urlData.publicUrl,
      });
    }

    // 2. Fallback FormData Upload (untuk file kecil < 4.5 MB)
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const folder = (formData.get('folder') as string) || 'uploads';

    if (!file) {
      return NextResponse.json({ error: 'File tidak ditemukan' }, { status: 400 });
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Format file tidak didukung. Harap upload gambar (JPG, PNG, WebP, SVG).' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const ext = file.name.split('.').pop() || 'png';
    const cleanFileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

    const { error } = await supabase.storage
      .from('landing-assets')
      .upload(cleanFileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (error) {
      return NextResponse.json(
        { error: `Gagal upload ke Supabase Storage: ${error.message}` },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage
      .from('landing-assets')
      .getPublicUrl(cleanFileName);

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      fileName: file.name,
    });
  } catch (error: any) {
    console.error('Upload Error:', error);
    return NextResponse.json({ error: error.message || 'Terjadi kesalahan sistem saat upload' }, { status: 500 });
  }
}
