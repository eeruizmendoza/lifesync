/**
 * Super-admin authentication helper.
 * The super admin phone number(s) are set via SUPER_ADMIN_PHONES env var
 * (comma-separated). Falls back to a hardcoded default for local dev.
 *
 * Usage:
 *   const isSuperAdmin = checkSuperAdmin(decoded.phoneNumber);
 *   if (!isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
 */

export function getSuperAdminPhones(): string[] {
  const raw = process.env.SUPER_ADMIN_PHONES ?? '';
  if (raw.trim()) {
    return raw.split(',').map(p => p.trim()).filter(Boolean);
  }
  // Default: empty — must be set in env to activate admin access in production
  return [];
}

export function checkSuperAdmin(phoneNumber: string): boolean {
  const admins = getSuperAdminPhones();
  if (admins.length === 0) return false;
  // Normalize: strip spaces and dashes, handle +1 prefix
  const normalize = (p: string) => p.replace(/[\s\-\(\)]/g, '');
  const normalizedPhone = normalize(phoneNumber);
  return admins.some(admin => normalize(admin) === normalizedPhone);
}
