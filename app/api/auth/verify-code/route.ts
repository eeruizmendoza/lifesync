/**
 * POST /api/auth/verify-code
 * Verify SMS code and return JWT token
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  verifySMSCode,
  getUserByPhone,
  createUser,
  createToken,
} from '@/lib/auth';

const schema = z.object({
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number'),
  code: z.string().length(6, 'Code must be 6 digits'),
  name: z.string().optional(),
  email: z.string().email().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phoneNumber, code, name, email } = schema.parse(body);

    // Verify SMS code
    const verification = await verifySMSCode(phoneNumber, code);

    if (!verification.valid) {
      return NextResponse.json(
        { ok: false, error: verification.message },
        { status: 400 }
      );
    }

    // Check if user exists
    let user = await getUserByPhone(phoneNumber);

    // Create user if doesn't exist
    if (!user) {
      user = await createUser(phoneNumber, name, email);
    }

    // Create JWT token
    const token = createToken(user.id, phoneNumber);

    // Set secure HTTP-only cookie
    const response = NextResponse.json(
      {
        ok: true,
        message: 'Logged in successfully',
        user: {
          id: user.id,
          phoneNumber: user.phone_number,
          name: user.name,
          email: user.email,
        },
      },
      { status: 200 }
    );

    response.cookies.set('lifesync_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[verify-code]', error);

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
        error: error instanceof Error ? error.message : 'Verification failed',
      },
      { status: 500 }
    );
  }
}
