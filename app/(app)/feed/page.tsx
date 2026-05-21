'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Post {
  id: string;
  userId: string;
  content: string;
  contentType: string;
  postType: string;
  mediaUrls?: string[];
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  author: {
    id: string;
    name?: string;
    phoneNumber: string;
    avatarUrl?: string;
  };
}

export default function FeedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [postContent, setPostContent] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('/api/auth/me');
        if (!response.ok) {
          router.push('/login');
          return;
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        router.push('/login');
        return;
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
    loadFeed();
  }, [router]);

  const loadFeed = async () => {
    try {
      const response = await fetch('/api/feed');
      if (!response.ok) {
        console.error('Failed to load feed:', response.statusText);
        return;
      }
      const data = await response.json();
      setPosts(data.posts || []);
    } catch (error) {
      console.error('Failed to load feed:', error);
    }
  };

  const handlePost = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!postContent.trim()) {
      setError('Post content cannot be empty');
      return;
    }

    setPosting(true);
    setError('');

    try {
      const response = await fetch('/api/feed/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: postContent,
          contentType: 'text',
          postType: 'feed',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create post');
      }

      const data = await response.json();
      console.log('✅ Post created:', data.post);

      // Clear form
      setPostContent('');

      // Reload feed
      await loadFeed();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create post';
      console.error('❌ Post error:', errorMessage);
      setError(errorMessage);
    } finally {
      setPosting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Feed</h1>

      {/* Post Composer */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <div className="flex gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex-shrink-0"></div>
          <div className="flex-1">
            <form onSubmit={handlePost}>
              <textarea
                value={postContent}
                onChange={(e) => setPostContent(e.target.value)}
                placeholder="What's on your mind?"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={3}
                disabled={posting}
              ></textarea>
              {error && (
                <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                  {error}
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={posting || !postContent.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-2 px-6 rounded-lg transition-colors"
                >
                  {posting ? 'Posting...' : 'Post'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Posts Feed */}
      {posts.length > 0 ? (
        <div className="space-y-6">
          {posts.map((post) => (
            <div key={post.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex-shrink-0"></div>
                <div>
                  <p className="font-semibold text-gray-900">
                    {post.author.name || post.author.phoneNumber}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(post.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <p className="text-gray-800 mb-4">{post.content}</p>
              <div className="flex gap-4 text-sm text-gray-600">
                <button className="hover:text-blue-600">❤️ {post.likesCount} Likes</button>
                <button className="hover:text-blue-600">💬 {post.commentsCount} Comments</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Feed is Empty
          </h2>
          <p className="text-gray-600">
            Follow contacts and create posts to see them here
          </p>
        </div>
      )}
    </main>
  );
}
