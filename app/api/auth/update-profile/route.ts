/**
 * POST /api/auth/update-profile
 * Update user profile (name and email)
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToken } from '@/lib/auth';
import { query } from '@/lib/db';

const SUPPORTED_LANGUAGES = ['en','es','fr','de','it','pt','zh','ja','ko','ar','ru','hi','nl','pl','tr','sv','uk','vi','id','th'];

const schema = z.object({
  name: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  language: z.string()
    .refine(v => !v || SUPPORTED_LANGUAGES.includes(v), { message: 'Unsupported language code' })
    .optional()
    .nullable(),
});

export async function POST(request: NextRequest) {
  try {
    // Accept Bearer token (portal localStorage) OR cookie (SSR login flow)
    let rawToken: string | undefined;
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      rawToken = authHeader.slice(7);
    } else {
      rawToken = request.cookies.get('lifesync_token')?.value;
    }

    if (!rawToken) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const decoded = verifyToken(rawToken);

    if (!decoded) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Parse and validate request body
    const body = await request.json();
    const { name, email, language } = schema.parse(body);

    // Update user profile (language_preference may not exist on all DBs — use DO NOTHING on conflict)
    const result = await query(
      `UPDATE users
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           language_preference = COALESCE($3, language_preference),
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, phone_number, name, email, language_preference`,
      [name ?? null, email ?? null, language ?? null, decoded.userId]
    );

    if (!result.rows[0]) {
      return NextResponse.json(
        { ok: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const updatedUser = result.rows[0];

    return NextResponse.json(
      {
        ok: true,
        message: 'Profile updated successfully',
        user: {
          id: updatedUser.id,
          phoneNumber: updatedUser.phone_number,
          name: updatedUser.name,
          email: updatedUser.email,
          language: updatedUser.language_preference ?? 'en',
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[update-profile]', error);

    if (error instanceof z.ZodError) {
      const firstError = error.issues[0];
      return NextResponse.json(
        { ok: false, error: firstError?.message || 'Validation error' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to update profile',
      },
      { status: 500 }
    );
  }
}
