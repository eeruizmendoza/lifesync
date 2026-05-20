/**
 * POST /api/auth/send-code
 * Send SMS verification code to phone number
 */

import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';
import { z } from 'zod';
import { query } from '@/lib/db';
import { generateVerificationCode, hashCode, storeSMSCode } from '@/lib/auth';

const schema = z.object({
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
});

// Lazy initialization of Twilio client
let client: ReturnType<typeof twilio> | null = null;

function getTwilioClient() {
  if (!client) {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      throw new Error('Twilio credentials not configured');
    }
    client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
  return client;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phoneNumber } = schema.parse(body);

    // Generate 6-digit code
    const code = generateVerificationCode();
    const hashedCode = await hashCode(code);

    // Store code in database
    await storeSMSCode(phoneNumber, hashedCode);

    // Send SMS via Twilio
    const twilioClient = getTwilioClient();
    const message = await twilioClient.messages.create({
      body: `Your LifeSync verification code is: ${code}. Valid for 10 minutes.`,
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: phoneNumber,
    });

    return NextResponse.json(
      {
        ok: true,
        message: 'SMS sent successfully',
        messageId: message.sid,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[send-code]', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { ok: false, error: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to send SMS',
      },
      { status: 500 }
    );
  }
}
