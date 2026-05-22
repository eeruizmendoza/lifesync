/**
 * POST /api/files/send
 *
 * Send a file or photo to another platform user.
 * Accepts base64-encoded file content.
 * Stores in messages table (channel='file' or 'photo').
 * File size limits: photos 300KB base64, files 700KB base64.
 * (S3 will handle larger files when AWS credentials are configured)
 *
 * Body: {
 *   receiverUserId: string,
 *   fileBase64: string,       — base64-encoded file content (no data: prefix)
 *   fileName: string,         — original file name
 *   mimeType: string,         — MIME type (determines channel: photo vs file)
 *   fileSizeBytes?: number,
 *   language?: string,
 * }
 *
 * Returns: { ok, message: { id, mediaUrl, mediaName, mediaType, createdAt, channel } }
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const MAX_PHOTO_BASE64 = 400 * 1024;  // ~300KB binary
const MAX_FILE_BASE64  = 800 * 1024;  // ~600KB binary

const PHOTO_MIMES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
  'image/webp', 'image/heic', 'image/heif',
]);

function isPhotoMime(mime: string): boolean {
  return PHOTO_MIMES.has(mime.toLowerCase().split(';')[0].trim());
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const receiverUserId = String(body.receiverUserId ?? '').trim();
    const fileBase64     = String(body.fileBase64 ?? '');
    const fileName       = String(body.fileName ?? 'file').slice(0, 255);
    const mimeType       = String(body.mimeType ?? 'application/octet-stream').slice(0, 100);
    const language       = String(body.language ?? user.language ?? 'en').slice(0, 5);

    if (!receiverUserId) return NextResponse.json({ error: 'receiverUserId is required' }, { status: 400 });
    if (!fileBase64)     return NextResponse.json({ error: 'fileBase64 is required' }, { status: 400 });
    if (receiverUserId === user.id) return NextResponse.json({ error: 'Cannot send to yourself' }, { status: 400 });

    const isPhoto  = isPhotoMime(mimeType);
    const channel  = isPhoto ? 'photo' : 'file';
    const maxBytes = isPhoto ? MAX_PHOTO_BASE64 : MAX_FILE_BASE64;

    if (fileBase64.length > maxBytes) {
      const maxMB = (maxBytes * 0.75 / 1024 / 1024).toFixed(1);
      return NextResponse.json({
        error: `${isPhoto ? 'Photo' : 'File'} too large. Max ${maxMB}MB. Compress or resize before sending.`,
      }, { status: 413 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Verify receiver
    const [receiver] = await sql`
      SELECT id, language_preference FROM users
      WHERE id = ${receiverUserId}::uuid
        AND (private IS NULL OR private = false)
    `;
    if (!receiver) return NextResponse.json({ error: 'Recipient not found' }, { status: 404 });

    // Build data URL
    const dataUrl       = `data:${mimeType};base64,${fileBase64}`;
    const fileSizeBytes = Math.round(fileBase64.length * 0.75);

    // Insert message
    const [msg] = await sql`
      INSERT INTO messages (
        sender_user_id, receiver_user_id, channel, direction,
        language, status,
        media_url, media_type, media_size_bytes, media_name
      ) VALUES (
        ${user.id}::uuid, ${receiverUserId}::uuid, ${channel}, 'outbound',
        ${language}, 'delivered',
        ${dataUrl}, ${mimeType}, ${fileSizeBytes}, ${fileName}
      )
      RETURNING id, channel, media_url, media_type, media_name, media_size_bytes, created_at
    `;

    // Notify receiver
    try {
      const senderName = user.name ?? 'Someone';
      const notifBody  = isPhoto
        ? `Photo from ${senderName}`
        : `${fileName} shared by ${senderName}`;
      await sql`
        INSERT INTO user_notifications (user_id, type, title, body, metadata)
        VALUES (
          ${receiverUserId}::uuid, 'incoming_message',
          ${notifBody}, ${notifBody},
          ${JSON.stringify({ senderId: user.id, senderName, channel, fileName })}::jsonb
        )
      `;
    } catch { /* optional */ }

    return NextResponse.json({
      ok: true,
      message: {
        id:            msg.id,
        channel:       msg.channel,
        mediaUrl:      msg.media_url,
        mediaType:     msg.media_type,
        mediaName:     msg.media_name,
        mediaSizeBytes:msg.media_size_bytes,
        createdAt:     msg.created_at,
      },
    });
  } catch (err) {
    console.error('[files/send]', err);
    return NextResponse.json({ error: 'Failed to send file' }, { status: 500 });
  }
}
