/**
 * POST /api/feed/create
 * Create a new post in the user's feed
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToken } from '@/lib/auth';
import { query } from '@/lib/db';
import { encryptContent, getUserEncryptionKeyFromDatabase } from '@/lib/encryption';

const schema = z.object({
  content: z.string().min(1, 'Post content is required').max(5000, 'Post content too long'),
  contentType: z.enum(['text', 'photo', 'video']).default('text'),
  postType: z.enum(['feed', 'story', 'reel']).default('feed'),
  mediaUrls: z.array(z.string().url()).optional(),
});

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
    const { content, contentType, postType, mediaUrls } = schema.parse(body);

    // Get user's encryption key (password-based or fallback to deterministic)
    const userEncryptionKey = await getUserEncryptionKeyFromDatabase(decoded.userId);

    // Encrypt content using AES-256-GCM
    const contentEncrypted = encryptContent(content, userEncryptionKey);

    // Insert post into database
    const result = await query(
      `INSERT INTO posts (
        user_id,
        content_encrypted,
        content_type,
        post_type,
        media_urls,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING id, user_id, content_encrypted, content_type, post_type, media_urls, created_at`,
      [
        decoded.userId,
        contentEncrypted,
        contentType,
        postType,
        mediaUrls && mediaUrls.length > 0 ? JSON.stringify(mediaUrls) : null,
      ]
    );

    const post = result.rows[0];

    // Return decrypted content in response (client already knows this content)
    return NextResponse.json(
      {
        ok: true,
        message: 'Post created successfully',
        post: {
          id: post.id,
          userId: post.user_id,
          content: content, // Return plaintext
          contentType: post.content_type,
          postType: post.post_type,
          mediaUrls: post.media_urls,
          createdAt: post.created_at,
          encrypted: true, // Indicate that this content is encrypted in storage
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[feed/create]', error);

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
        error: error instanceof Error ? error.message : 'Failed to create post',
      },
      { status: 500 }
    );
  }
}
