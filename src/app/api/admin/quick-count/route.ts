import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getWIBDate, getWIBLocaleString } from '@/lib/utils';
import { QuickCountCandidate, QuickCountConfig } from '@/types/database';
import { getAuthClient } from '@/lib/googleSheets';
import { google } from 'googleapis';
import { getOnlineVotingStats } from '@/lib/onlineVoting';

const DEFAULT_CANDIDATES: QuickCountCandidate[] = [
  {
    id: 'paslon-1',
    number: '01',
    name: 'Paslon 01 (Calon Ketua & Wakil)',
    tagline: 'Sinergi, Kolaboratif, dan Berintegritas',
    votes: 0,
  },
  {
    id: 'paslon-2',
    number: '02',
    name: 'Paslon 02 (Calon Ketua & Wakil)',
    tagline: 'Inovatif, Progresif, dan Transparan',
    votes: 0,
  },
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || getWIBDate();
    const supabase = createAdminClient();

    // 1. Ambil config landing settings
    const { data: landingData } = await supabase
      .from('landing_settings')
      .select('extra_texts')
      .maybeSingle();

    const extraTexts = landingData?.extra_texts || {};
    const votingRecords = extraTexts.voting_records || {};
    const quickCountConfig: QuickCountConfig = extraTexts.quick_count || {
      candidates: DEFAULT_CANDIDATES,
      invalid_votes: 0,
      notes: '',
      is_locked: false,
    };

    const candidates = quickCountConfig.candidates && quickCountConfig.candidates.length > 0
      ? quickCountConfig.candidates
      : DEFAULT_CANDIDATES;

    // 2. Ambil total DPT & Pemilih di bilik suara
    const { count: studentCount } = await supabase
      .from('students')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    const { count: attCount } = await supabase
      .from('attendances')
      .select('*', { count: 'exact', head: true })
      .eq('attendance_date', date);

    const lecturersCount = (extraTexts.lecturers || []).length;
    const totalDpt = (studentCount || 0) + lecturersCount;
    const totalPresent = attCount || 0;

    // Total pemilih yang sudah mencoblos di bilik suara (has_voted === true)
    const votedVotersCount = Object.values(votingRecords).filter((v: any) => v.has_voted).length;

    // Hitung total suara masuk
    const totalValidVotes = candidates.reduce((sum, c) => sum + (c.votes || 0), 0);
    const totalInvalidVotes = quickCountConfig.invalid_votes || 0;
    const totalBallotsCounted = totalValidVotes + totalInvalidVotes;

    // Rekonsiliasi akurasi suara
    const discrepancy = totalBallotsCounted - votedVotersCount;

    // Ambil statistik pemungutan suara online (HANYA AGREGAT)
    const onlineStats = await getOnlineVotingStats(date);

    return NextResponse.json({
      success: true,
      config: {
        candidates,
        invalid_votes: totalInvalidVotes,
        notes: quickCountConfig.notes || '',
        is_locked: Boolean(quickCountConfig.is_locked),
        updated_at: quickCountConfig.updated_at || null,
        is_online_merged: onlineStats.isMerged,
      },
      onlineStats,
      stats: {
        totalDpt,
        totalPresent,
        votedVotersCount, // DPT yang masuk bilik suara
        totalValidVotes,
        totalInvalidVotes,
        totalBallotsCounted, // Total kertas suara dihitung
        discrepancy, // 0 = 100% klop
        isBalanced: discrepancy === 0,
      },
    });
  } catch (error: any) {
    console.error('Quick count GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, candidates, invalid_votes, notes, is_locked } = body;
    const supabase = createAdminClient();

    // 1. Ambil landing settings saat ini
    const { data: landingData, error: fetchErr } = await supabase
      .from('landing_settings')
      .select('*')
      .maybeSingle();

    if (fetchErr || !landingData) {
      return NextResponse.json({ error: 'Pengaturan sistem tidak ditemukan' }, { status: 500 });
    }

    const extraTexts = landingData.extra_texts || {};
    const nowWib = getWIBLocaleString();

    // Aksi: Tambahkan / Gabungkan Suara Online ke Quick Count
    if (action === 'merge_online_votes') {
      const onlineStats = await getOnlineVotingStats();
      if (extraTexts.online_votes_merged) {
        return NextResponse.json(
          { error: 'Suara online sudah pernah ditambahkan ke Quick Count.' },
          { status: 400 }
        );
      }

      const curQuickCount: QuickCountConfig = extraTexts.quick_count || {
        candidates: DEFAULT_CANDIDATES,
        invalid_votes: 0,
      };
      const baseCandidates: QuickCountCandidate[] = curQuickCount.candidates && curQuickCount.candidates.length > 0
        ? curQuickCount.candidates
        : DEFAULT_CANDIDATES;

      const mergedCandidates = baseCandidates.map((c) => {
        const addVotes = onlineStats.candidateTallies[c.id]?.votes || 0;
        return {
          ...c,
          votes: (c.votes || 0) + addVotes,
        };
      });

      const mergedInvalidVotes = (curQuickCount.invalid_votes || 0) + onlineStats.golputCount;

      const updatedQuickCount: QuickCountConfig = {
        ...curQuickCount,
        candidates: mergedCandidates,
        invalid_votes: mergedInvalidVotes,
        updated_at: nowWib,
      };

      const updatedExtra = {
        ...extraTexts,
        quick_count: updatedQuickCount,
        online_votes_merged: true,
      };

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
        message: `Berhasil menambahkan ${onlineStats.totalOnlineVotesCast} suara online (${onlineStats.onlineVoted - onlineStats.golputCount} suara paslon + ${onlineStats.golputCount} golput) ke Quick Count! 🎉`,
        quickCount: updatedQuickCount,
        isMerged: true,
      });
    }

    // Aksi: Batalkan Penambahan Suara Online dari Quick Count
    if (action === 'unmerge_online_votes') {
      const onlineStats = await getOnlineVotingStats();
      const curQuickCount: QuickCountConfig = extraTexts.quick_count || {
        candidates: DEFAULT_CANDIDATES,
        invalid_votes: 0,
      };
      const baseCandidates: QuickCountCandidate[] = curQuickCount.candidates || DEFAULT_CANDIDATES;

      const unmergedCandidates = baseCandidates.map((c) => {
        const subVotes = onlineStats.candidateTallies[c.id]?.votes || 0;
        return {
          ...c,
          votes: Math.max(0, (c.votes || 0) - subVotes),
        };
      });

      const unmergedInvalidVotes = Math.max(0, (curQuickCount.invalid_votes || 0) - onlineStats.golputCount);

      const updatedQuickCount: QuickCountConfig = {
        ...curQuickCount,
        candidates: unmergedCandidates,
        invalid_votes: unmergedInvalidVotes,
        updated_at: nowWib,
      };

      const updatedExtra = {
        ...extraTexts,
        quick_count: updatedQuickCount,
        online_votes_merged: false,
      };

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
        message: 'Suara online berhasil ditarik kembali dari Quick Count.',
        quickCount: updatedQuickCount,
        isMerged: false,
      });
    }

    if (action === 'sync_to_sheets') {
      // 2. Sinkronkan Hasil Quick Count ke Google Sheets di tab "Quick Count Pemira"
      const { data: config } = await supabase
        .from('sheet_configs')
        .select('*')
        .eq('sheet_role', 'admin')
        .maybeSingle();

      if (!config || !config.sheet_id) {
        return NextResponse.json(
          { error: 'Google Sheets ID belum dikonfigurasi di Pengaturan Sheets.' },
          { status: 400 }
        );
      }

      const quickCountData = extraTexts.quick_count || {};
      const curCandidates: QuickCountCandidate[] = quickCountData.candidates || DEFAULT_CANDIDATES;
      const curInvalid = quickCountData.invalid_votes || 0;
      const votingRecords = extraTexts.voting_records || {};
      const votedVotersCount = Object.values(votingRecords).filter((v: any) => v.has_voted).length;

      const totalValid = curCandidates.reduce((sum, c) => sum + (c.votes || 0), 0);
      const totalAll = totalValid + curInvalid;

      // Pemenang sementara
      const sortedByVotes = [...curCandidates].sort((a, b) => (b.votes || 0) - (a.votes || 0));
      const leader = sortedByVotes[0];
      const isTie = sortedByVotes.length > 1 && sortedByVotes[0].votes === sortedByVotes[1].votes;
      const winnerText = isTie
        ? 'HASIL SEMENTARA SEIMBANG'
        : `${leader?.number || ''} - ${leader?.name || ''} (${leader?.votes || 0} Suara)`;

      // Build Sheet Table
      const auth = getAuthClient();
      const sheets = google.sheets({ version: 'v4', auth });
      const tabName = 'Quick Count Pemira';

      // Ensure tab exists
      const meta = await sheets.spreadsheets.get({ spreadsheetId: config.sheet_id });
      const allSheets = meta.data.sheets || [];
      let found = allSheets.find((s) => s.properties?.title === tabName);
      let sheetNumericId = found?.properties?.sheetId;

      if (!found) {
        const addRes = await sheets.spreadsheets.batchUpdate({
          spreadsheetId: config.sheet_id,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: tabName,
                    tabColor: { red: 0.55, green: 0.15, blue: 0.75 }, // Purple
                  },
                },
              },
            ],
          },
        });
        sheetNumericId = addRes.data.replies?.[0]?.addSheet?.properties?.sheetId ?? Date.now();
      }

      // Prepare Rows
      const rows: any[] = [
        ['REKAPITULASI HASIL QUICK COUNT - PEMILIHAN KETUA HIMA (PEMIRA)', '', '', ''],
        [`Waktu Rekapitulasi: ${nowWib} • Sistem Pemira HIMASI Terintegrasi`, '', '', ''],
        ['', '', '', ''],
        ['HASIL PEROLEHAN SUARA PASANGAN CALON', '', '', ''],
        ['Nomor', 'Nama Pasangan Calon', 'Total Suara', 'Persentase (%)'],
        ...curCandidates.map((c) => {
          const pct = totalAll > 0 ? ((c.votes / totalAll) * 100).toFixed(1) + '%' : '0%';
          return [c.number, c.name, c.votes, pct];
        }),
        ['', 'Suara Tidak Sah / Rusak', curInvalid, totalAll > 0 ? ((curInvalid / totalAll) * 100).toFixed(1) + '%' : '0%'],
        ['', 'TOTAL SUARA MASUK DI KOTAK', totalAll, '100%'],
        ['', '', '', ''],
        ['REKONSILIASI DENGAN BILIK SUARA', '', '', ''],
        ['Keterangan', 'Jumlah', 'Status Rekonsiliasi', ''],
        ['Total Pemilih Terverifikasi (Bilik Suara)', votedVotersCount, 'Pemilih yang sudah mencoblos', ''],
        ['Total Kertas Suara Terhitung', totalAll, totalAll === votedVotersCount ? '100% Sesuai (Klop) ✅' : `Selisih ${Math.abs(totalAll - votedVotersCount)} Suara ⚠️`, ''],
        ['', '', '', ''],
        ['HASIL AKHIR / STATUS PEMENANG:', winnerText, '', ''],
        ['CATATAN & BERITA ACARA SAKSI:', quickCountData.notes || 'Perhitungan suara berjalan tertib dan transparan.', '', ''],
      ];

      // Clear & Write
      try {
        await sheets.spreadsheets.values.clear({
          spreadsheetId: config.sheet_id,
          range: `'${tabName}'!B2:G50`,
        });
      } catch (e) {}

      await sheets.spreadsheets.values.update({
        spreadsheetId: config.sheet_id,
        range: `'${tabName}'!B2:E${2 + rows.length}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows },
      });

      // Format Sheet
      if (sheetNumericId !== undefined) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: config.sheet_id,
          requestBody: {
            requests: [
              {
                updateDimensionProperties: {
                  range: { sheetId: sheetNumericId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, // B
                  properties: { pixelSize: 80 },
                  fields: 'pixelSize',
                },
              },
              {
                updateDimensionProperties: {
                  range: { sheetId: sheetNumericId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, // C
                  properties: { pixelSize: 280 },
                  fields: 'pixelSize',
                },
              },
              {
                updateDimensionProperties: {
                  range: { sheetId: sheetNumericId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, // D
                  properties: { pixelSize: 120 },
                  fields: 'pixelSize',
                },
              },
              {
                updateDimensionProperties: {
                  range: { sheetId: sheetNumericId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, // E
                  properties: { pixelSize: 120 },
                  fields: 'pixelSize',
                },
              },
              // Header Title B2:E2
              {
                repeatCell: {
                  range: { sheetId: sheetNumericId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 5 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.45, green: 0.15, blue: 0.65 },
                      textFormat: { bold: true, fontSize: 12, foregroundColor: { red: 1, green: 1, blue: 1 } },
                      horizontalAlignment: 'CENTER',
                      verticalAlignment: 'MIDDLE',
                    },
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
                },
              },
              // Subtitle B3:E3
              {
                repeatCell: {
                  range: { sheetId: sheetNumericId, startRowIndex: 2, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 5 },
                  cell: {
                    userEnteredFormat: {
                      backgroundColor: { red: 0.95, green: 0.92, blue: 0.98 },
                      textFormat: { italic: true, fontSize: 9, foregroundColor: { red: 0.35, green: 0.1, blue: 0.5 } },
                      horizontalAlignment: 'CENTER',
                      verticalAlignment: 'MIDDLE',
                    },
                  },
                  fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
                },
              },
            ],
          },
        });
      }

      return NextResponse.json({
        success: true,
        message: 'Hasil Quick Count berhasil disinkronkan ke Google Sheets pada tab "Quick Count Pemira"! 🎉',
        tabName,
        totalBallotsCounted: totalAll,
        leader: winnerText,
      });
    }

    // Default: Save Tally and Candidate Settings
    const updatedQuickCount: QuickCountConfig = {
      candidates: candidates || extraTexts.quick_count?.candidates || DEFAULT_CANDIDATES,
      invalid_votes: invalid_votes !== undefined ? Number(invalid_votes) : extraTexts.quick_count?.invalid_votes || 0,
      notes: notes !== undefined ? notes : extraTexts.quick_count?.notes || '',
      is_locked: is_locked !== undefined ? Boolean(is_locked) : extraTexts.quick_count?.is_locked || false,
      updated_at: nowWib,
    };

    const updatedExtra = {
      ...extraTexts,
      quick_count: updatedQuickCount,
    };

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
      message: 'Data Quick Count berhasil disimpan!',
      quickCount: updatedQuickCount,
    });
  } catch (error: any) {
    console.error('Quick count POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
