/**
 * POST /api/auth/set-encryption-password
 * Set user's encryption password and derive encryption key
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToken } from '@/lib/auth';
import { query } from '@/lib/db';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const schema = z.object({
  encryptionPassword: z
    .string()
    .min(8, 'Encryption password must be at least 8 characters')
    .max(255, 'Encryption password too long'),
});

/**
 * Derive encryption key from password using PBKDF2
 */
function deriveEncryptionKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
}

/**
 * Encrypt the derived key with master key (server-side master key)
 */
function encryptDerivedKey(derivedKey: Buffer, masterKey: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(
    'aes-256-gcm',
    Buffer.from(masterKey, 'hex'),
    iv
  );

  let encrypted = cipher.update(derivedKey);
  encrypted = Buffer.concat([encrypted, cipher.final()]);

  const authTag = cipher.getAuthTag();
  const result = Buffer.concat([iv, authTag, encrypted]);

  return result.toString('base64');
}

export async function POST(request: NextRequest) {
  try {
    // Get token from cookie
    const token = request.cookies.get('lifesync_token')?.value;
    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify token
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json(
        { ok: false, error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { encryptionPassword } = schema.parse(body);

    // Get master key from environment
    const masterKey = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterKey) {
      console.error('ENCRYPTION_MASTER_KEY not configured');
      return NextResponse.json(
        { ok: false, error: 'Server encryption not configured' },
        { status: 500 }
      );
    }

    // Generate random salt for PBKDF2
    const salt = crypto.randomBytes(16);
    const saltBase64 = salt.toString('base64');

    // Hash encryption password with bcrypt
    const encryptionPasswordHash = await bcrypt.hash(encryptionPassword, 10);

    // Derive encryption key from password
    const derivedKey = deriveEncryptionKey(encryptionPassword, salt);

    // Encrypt the derived key with master key
    const encryptedKey = encryptDerivedKey(derivedKey, masterKey);

    // Store in database
    const result = await query(
      `UPDATE users
       SET encryption_password_hash = $1,
           encryption_key_salt = $2,
           encryption_key_encrypted = $3,
           encryption_enabled = true,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, encryption_enabled`,
      [encryptionPasswordHash, saltBase64, encryptedKey, decoded.userId]
    );

    if (!result.rows[0]) {
      return NextResponse.json(
        { ok: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        message: 'Encryption password set successfully',
        encryptionEnabled: true,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[auth/set-encryption-password]', error);

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
        error: error instanceof Error ? error.message : 'Failed to set encryption password',
      },
      { status: 500 }
    );
  }
}
