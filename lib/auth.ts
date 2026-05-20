/**
 * LifeSync Authentication
 * Phone + SMS verification using Twilio
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { query } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
const JWT_EXPIRY = '7d';

/**
 * Generate a random 6-digit SMS verification code
 */
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Hash a verification code for secure storage
 */
export async function hashCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

/**
 * Verify a code against hashed stored code
 */
export async function verifyCode(code: string, hashedCode: string): Promise<boolean> {
  return bcrypt.compare(code, hashedCode);
}

/**
 * Create JWT token for user
 */
export function createToken(userId: string, phoneNumber: string): string {
  return jwt.sign(
    {
      userId,
      phoneNumber,
      iat: Math.floor(Date.now() / 1000),
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): { userId: string; phoneNumber: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    return {
      userId: decoded.userId,
      phoneNumber: decoded.phoneNumber,
    };
  } catch (error) {
    return null;
  }
}

/**
 * Get user by phone number
 */
export async function getUserByPhone(phoneNumber: string) {
  const result = await query(
    'SELECT id, phone_number, name, email, created_at FROM users WHERE phone_number = $1',
    [phoneNumber]
  );
  return result.rows[0] || null;
}

/**
 * Create new user
 */
export async function createUser(phoneNumber: string, name?: string, email?: string) {
  const result = await query(
    `INSERT INTO users (phone_number, name, email, created_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING id, phone_number, name, email, created_at`,
    [phoneNumber, name || null, email || null]
  );
  return result.rows[0];
}

/**
 * Store SMS verification code (temp storage, expires in 10 minutes)
 */
export async function storeSMSCode(phoneNumber: string, hashedCode: string) {
  await query(
    `INSERT INTO sms_verification (phone_number, code, expires_at, created_at)
     VALUES ($1, $2, NOW() + INTERVAL '10 minutes', NOW())
     ON CONFLICT (phone_number) DO UPDATE SET
     code = $2, expires_at = NOW() + INTERVAL '10 minutes'`,
    [phoneNumber, hashedCode]
  );
}

/**
 * Verify SMS code
 */
export async function verifySMSCode(
  phoneNumber: string,
  code: string
): Promise<{ valid: boolean; message: string }> {
  const result = await query(
    `SELECT code, expires_at FROM sms_verification
     WHERE phone_number = $1 AND expires_at > NOW()`,
    [phoneNumber]
  );

  if (!result.rows[0]) {
    return { valid: false, message: 'Code expired or not found' };
  }

  const isValid = await verifyCode(code, result.rows[0].code);

  if (!isValid) {
    return { valid: false, message: 'Invalid code' };
  }

  // Delete the code after successful verification
  await query('DELETE FROM sms_verification WHERE phone_number = $1', [phoneNumber]);

  return { valid: true, message: 'Code verified' };
}
