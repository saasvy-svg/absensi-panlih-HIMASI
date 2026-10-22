import fs from 'fs';
import path from 'path';

// Parse .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
const content = fs.readFileSync(envPath, 'utf8');
const lines = content.split(/\r?\n/);
let currentKey: string | null = null;
let currentValue = '';
let inQuotes = false;
let quoteChar = '';

for (const line of lines) {
  if (!inQuotes) {
    const match = line.match(/^\s*([A-Za-z_0-9]+)\s*=\s*(.*)$/);
    if (match) {
      currentKey = match[1];
      let val = match[2];
      if (val.startsWith('"') || val.startsWith("'")) {
        quoteChar = val[0];
        inQuotes = true;
        currentValue = val.slice(1);
        if (currentValue.endsWith(quoteChar) && !currentValue.endsWith('\\' + quoteChar)) {
          inQuotes = false;
          process.env[currentKey] = currentValue.slice(0, -1);
          currentKey = null;
        }
      } else {
        process.env[currentKey] = val;
        currentKey = null;
      }
    }
  } else {
    if (line.endsWith(quoteChar) && !line.endsWith('\\' + quoteChar)) {
      currentValue += '\n' + line.slice(0, -1);
      inQuotes = false;
      if (currentKey) process.env[currentKey] = currentValue;
      currentKey = null;
    } else {
      currentValue += '\n' + line;
    }
  }
}

import { createClient } from '@supabase/supabase-js';
import { syncCategorizedWithMasterRoster } from '../src/lib/googleSheets';
import { getWIBDate } from '../src/lib/utils';
import { resolveActiveDay } from '../src/lib/dayHelper';

async function run() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: config } = await supabase
    .from('sheet_configs')
    .select('*')
    .eq('sheet_role', 'admin')
    .maybeSingle();

  if (!config?.sheet_id) {
    console.error('No sheet_id found in sheet_configs');
    return;
  }

  const { data: landingData } = await supabase
    .from('landing_settings')
    .select('extra_texts')
    .maybeSingle();

  const extraTexts = landingData?.extra_texts || {};
  const lecturers: string[] = extraTexts.lecturers || [];
  const onlineMembers: Record<string, 'online' | 'offline'> = extraTexts.online_members || {};

  const { data: distinctAtts } = await supabase
    .from('attendances')
    .select('attendance_date');

  const historicalDates = Array.from(
    new Set((distinctAtts || []).map((a: any) => a.attendance_date).filter(Boolean))
  ) as string[];

  const configuredDaysList = extraTexts.days || [];
  const configuredDates = [
    ...configuredDaysList.map((d: any) => d.date),
    extraTexts.day1_date,
    extraTexts.day2_date,
  ].filter(Boolean) as string[];

  const targetDate = getWIBDate();

  const datesWithAttendance = new Set(historicalDates);
  const validConfiguredDates = new Set(configuredDates);

  const candidateDates = new Set([...historicalDates, ...configuredDates]);
  if (datesWithAttendance.has(targetDate) || validConfiguredDates.has(targetDate)) {
    candidateDates.add(targetDate);
  }
  if (candidateDates.size === 0 && targetDate && targetDate !== 'all') {
    candidateDates.add(targetDate);
  }

  const allUniqueDates = Array.from(candidateDates).filter((d) => d && d !== 'all').sort();
  console.log('Unique dates found:', allUniqueDates);

  const days = allUniqueDates.map((dStr, idx) => {
    const configured = configuredDaysList.find((d: any) => d.date === dStr);
    const parts = dStr.split('-');
    const formatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : dStr;
    return {
      dayNumber: idx + 1,
      date: dStr,
      label: configured?.label || formatted,
    };
  });

  console.log('Days to render:', days);

  const dayResolution = resolveActiveDay(extraTexts, targetDate);

  const { data: allStudents } = await supabase
    .from('students')
    .select('*')
    .eq('is_active', true)
    .order('nim', { ascending: true });

  const { data: attendances } = await supabase
    .from('attendances')
    .select('*')
    .in('attendance_date', allUniqueDates)
    .order('check_in_time', { ascending: true });

  console.log(`Starting sync for ${allStudents?.length} students, ${attendances?.length} attendances...`);

  const results = await syncCategorizedWithMasterRoster(
    config.sheet_id,
    allStudents || [],
    attendances || [],
    targetDate,
    lecturers,
    {
      days,
      activeDay: dayResolution.activeDay,
      onlineMembers,
    }
  );

  console.log('Sync completed successfully!', results);
}

run().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
