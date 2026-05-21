import { query } from './lib/db.js';
import { decryptContent, getUserEncryptionKey } from './lib/encryption.js';

async function verifyEncryption() {
  try {
    console.log('🔍 Verifying AES-256-GCM Encryption...\n');
    
    // Get the latest post
    const result = await query(
      'SELECT id, user_id, content_encrypted, created_at FROM posts ORDER BY created_at DESC LIMIT 1'
    );
    
    if (result.rows.length === 0) {
      console.log('No posts found');
      return;
    }
    
    const post = result.rows[0];
    console.log('✅ Post found in database');
    console.log('Post ID:', post.id);
    console.log('User ID:', post.user_id);
    console.log('');
    
    console.log('🔐 Encrypted content in database:');
    console.log('Type: Base64-encoded AES-256-GCM');
    console.log('Length:', post.content_encrypted.length, 'characters');
    console.log('First 100 chars:', post.content_encrypted.substring(0, 100));
    console.log('');
    
    console.log('📊 Decryption test:');
    try {
      const userKey = getUserEncryptionKey(post.user_id);
      const decrypted = decryptContent(post.content_encrypted, userKey);
      console.log('✅ Successfully decrypted!');
      console.log('Decrypted content:', decrypted);
    } catch (err) {
      console.error('❌ Decryption failed:', err.message);
    }
    
    console.log('');
    console.log('📋 Encryption Details:');
    console.log('Algorithm: AES-256-GCM');
    console.log('Key Derivation: PBKDF2 (100,000 iterations)');
    console.log('IV Length: 128 bits (16 bytes)');
    console.log('Auth Tag Length: 128 bits (16 bytes)');
    console.log('Salt Length: 128 bits (16 bytes)');
    console.log('');
    console.log('Structure of encrypted data:');
    console.log('├─ Salt (16 bytes)');
    console.log('├─ IV (16 bytes)');
    console.log('├─ Auth Tag (16 bytes)');
    console.log('└─ Ciphertext (variable)');
    console.log('All base64 encoded for storage');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

verifyEncryption();
