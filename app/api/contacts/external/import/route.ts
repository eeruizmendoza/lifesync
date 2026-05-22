/**
 * POST /api/contacts/external/import
 * Bulk-import external contacts from CSV text.
 *
 * Body (JSON): { csv: string, isOrgShared?: boolean }
 * Expected CSV columns (header row required):
 *   name, phone, email, company, language, tags
 *
 * - Tags can be semicolon-separated within a field: "Adjuster;Insurance"
 * - Language should be a 2-letter ISO code (default: en)
 * - Returns { imported, skipped, errors }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const MAX_ROWS = 500;

/** Minimal CSV parser: handles quoted fields with commas, returns string[][] */
function parseCSV(text: string): string[][] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  return lines
    .filter(l => l.trim().length > 0)
    .map(line => {
      const fields: string[] = [];
      let current = '';
      let inQuote  = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuote && line[i + 1] === '"') { current += '"'; i++; }
          else { inQuote = !inQuote; }
        } else if (ch === ',' && !inQuote) {
          fields.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      fields.push(current.trim());
      return fields;
    });
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const csvText    = String(body.csv ?? '').trim();
    const isOrgShared = Boolean(body.isOrgShared) && !!user.orgId;

    if (!csvText) return NextResponse.json({ error: 'CSV data is required' }, { status: 400 });

    const rows = parseCSV(csvText);
    if (rows.length < 2) return NextResponse.json({ error: 'CSV must have a header row and at least one data row' }, { status: 400 });

    // Map header → column index (case-insensitive)
    const headers = rows[0].map(h => h.toLowerCase().replace(/[^a-z]/g, ''));
    const col = (name: string) => headers.indexOf(name);
    const nameIdx    = col('name');
    const phoneIdx   = col('phone');
    const emailIdx   = col('email');
    const companyIdx = col('company');
    const langIdx    = col('language');
    const tagsIdx    = col('tags');

    if (nameIdx === -1) return NextResponse.json({ error: 'CSV must contain a "name" column' }, { status: 400 });

    const dataRows = rows.slice(1, MAX_ROWS + 1);
    const orgId = isOrgShared ? (user.orgId ?? null) : null;
    const sql = neon(process.env.DATABASE_URL!);

    let imported = 0;
    let skipped  = 0;
    const errors: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row     = dataRows[i];
      const name    = nameIdx  >= 0 ? row[nameIdx]?.trim()  : '';
      const phone   = phoneIdx >= 0 ? row[phoneIdx]?.trim() : '';
      const email   = emailIdx >= 0 ? row[emailIdx]?.trim() : '';

      if (!name) { skipped++; continue; }
      if (!phone && !email) { skipped++; errors.push(`Row ${i + 2}: "${name}" skipped — no phone or email`); continue; }

      const company  = companyIdx >= 0 ? (row[companyIdx]?.trim() || null) : null;
      const language = langIdx    >= 0 ? (row[langIdx]?.trim()    || 'en') : 'en';
      const tagsRaw  = tagsIdx    >= 0 ? (row[tagsIdx]?.trim()    || '')  : '';
      // Tags: semicolon or pipe separated
      const tags = tagsRaw ? tagsRaw.split(/[;|]/).map(t => t.trim()).filter(Boolean) : [];

      try {
        await sql`
          INSERT INTO external_contacts
            (org_id, owner_user_id, is_org_shared, name, phone, email, company, language, tags)
          VALUES (
            ${orgId ? `${orgId}` : null}::uuid,
            ${user.id}::uuid,
            ${isOrgShared},
            ${name},
            ${phone || null},
            ${email || null},
            ${company},
            ${language},
            ${tags}
          )
        `;
        imported++;
      } catch (e) {
        errors.push(`Row ${i + 2}: "${name}" failed — ${e instanceof Error ? e.message : 'unknown error'}`);
        skipped++;
      }
    }

    return NextResponse.json({ ok: true, imported, skipped, errors: errors.slice(0, 20) });
  } catch (err) {
    console.error('[external contacts import]', err);
    return NextResponse.json({ error: 'Failed to import contacts' }, { status: 500 });
  }
}
