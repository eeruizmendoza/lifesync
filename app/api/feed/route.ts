/**
 * GET /api/feed
 * Retrieve posts for the user's feed
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { query } from '@/lib/db';
import { decryptContent, getUserEncryptionKeyFromDatabase } from '@/lib/encryption';

export async function GET(request: NextRequest) {
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

    // Get pagination params
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    // Get user's own posts and posts from connections
    // For now, just get user's own posts
    const result = await query(
      `SELECT
        p.id,
        p.user_id,
        p.content_encrypted,
        p.content_type,
        p.post_type,
        p.media_urls,
        p.likes_count,
        p.comments_count,
        p.created_at,
        p.updated_at,
        u.name,
        u.phone_number,
        u.avatar_url
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = $1 AND p.deleted_at IS NULL
      ORDER BY p.created_at DESC
      LIMIT $2 OFFSET $3`,
      [decoded.userId, limit, offset]
    );

    // Process posts and decrypt content
    const posts = await Promise.all(
      result.rows.map(async (row) => {
        // Decrypt content for display
        let decryptedContent = row.content_encrypted;
        try {
          const userEncryptionKey = await getUserEncryptionKeyFromDatabase(row.user_id);
          decryptedContent = decryptContent(row.content_encrypted, userEncryptionKey);
        } catch (decryptError) {
          console.error(`Failed to decrypt post ${row.id}:`, decryptError);
          // Fall back to encrypted content if decryption fails
          decryptedContent = '[Encrypted content - decryption failed]';
        }

        return {
          id: row.id,
          userId: row.user_id,
          content: decryptedContent,
          contentType: row.content_type,
          postType: row.post_type,
          mediaUrls: row.media_urls,
          likesCount: row.likes_count,
          commentsCount: row.comments_count,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          author: {
            id: row.user_id,
            name: row.name,
            phoneNumber: row.phone_number,
            avatarUrl: row.avatar_url,
          },
        };
      })
    );

    return NextResponse.json(
      {
        ok: true,
        posts,
        pagination: {
          limit,
          offset,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[feed]', error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Failed to fetch feed',
      },
      { status: 500 }
    );
  }
}
