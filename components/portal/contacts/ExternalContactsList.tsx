'use client';

/**
 * ExternalContactsList
 * Contact book for non-platform users (homeowners, adjusters, contractors, etc.).
 * Features: search, tag filter, create/edit modal, delete, CSV import.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Plus, Phone, Mail, Globe, Tag, Users2,
  Pencil, Trash2, Upload, X, Check, Loader2,
  AlertCircle, Building2, Share2, Lock, Download,
  ChevronDown,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExternalContact {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  language: string;
  tags: string[];
  notes: string | null;
  isOrgShared: boolean;
  isOwner: boolean;
  createdAt: string;
}

interface ContactFormData {
  name: string;
  phone: string;
  email: string;
  company: string;
  language: string;
  tags: string[];
  notes: string;
  isOrgShared: boolean;
}

const EMPTY_FORM: ContactFormData = {
  name: '', phone: '', email: '', company: '',
  language: 'en', tags: [], notes: '', isOrgShared: false,
};

// ─── Constants ────────────────────────────────────────────────────────────────

const PREDEFINED_TAGS = [
  'Adjuster', 'Homeowner', 'Contractor', 'Subcontractor',
  'Insurance', 'Supplier', 'Property Manager', 'Other',
];

const TAG_COLORS: Record<string, string> = {
  Adjuster:           'bg-blue-100 text-blue-700',
  Homeowner:          'bg-green-100 text-green-700',
  Contractor:         'bg-orange-100 text-orange-700',
  Subcontractor:      'bg-amber-100 text-amber-700',
  Insurance:          'bg-purple-100 text-purple-700',
  Supplier:           'bg-teal-100 text-teal-700',
  'Property Manager': 'bg-indigo-100 text-indigo-700',
  Other:              'bg-gray-100 text-gray-600',
};

const TAG_ACTIVE_COLORS: Record<string, string> = {
  Adjuster:           'bg-blue-600 text-white',
  Homeowner:          'bg-green-600 text-white',
  Contractor:         'bg-orange-600 text-white',
  Subcontractor:      'bg-amber-500 text-white',
  Insurance:          'bg-purple-600 text-white',
  Supplier:           'bg-teal-600 text-white',
  'Property Manager': 'bg-indigo-600 text-white',
  Other:              'bg-gray-600 text-white',
};

const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },   { code: 'es', label: 'Spanish' },
  { code: 'zh', label: 'Chinese' },   { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },    { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },    { code: 'pt', label: 'Portuguese' },
  { code: 'ar', label: 'Arabic' },    { code: 'ru', label: 'Russian' },
  { code: 'hi', label: 'Hindi' },     { code: 'it', label: 'Italian' },
  { code: 'nl', label: 'Dutch' },     { code: 'sv', label: 'Swedish' },
  { code: 'pl', label: 'Polish' },    { code: 'tr', label: 'Turkish' },
  { code: 'vi', label: 'Vietnamese' },{ code: 'th', label: 'Thai' },
  { code: 'id', label: 'Indonesian' },{ code: 'uk', label: 'Ukrainian' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0] ?? '').join('').slice(0, 2).toUpperCase();
}

function langLabel(code: string) {
  return LANGUAGES.find(l => l.code === code)?.label ?? code.toUpperCase();
}

function tagColor(tag: string, active = false) {
  const map = active ? TAG_ACTIVE_COLORS : TAG_COLORS;
  return map[tag] ?? (active ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-600');
}

// ─── Contact Form Modal ───────────────────────────────────────────────────────

function ContactModal({
  initial,
  hasOrg,
  onSave,
  onClose,
}: {
  initial: ContactFormData;
  hasOrg: boolean;
  onSave: (data: ContactFormData) => Promise<void>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ContactFormData>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const set = (field: keyof ContactFormData, value: unknown) =>
    setForm(f => ({ ...f, [field]: value }));

  const toggleTag = (tag: string) =>
    set('tags', form.tags.includes(tag) ? form.tags.filter(t => t !== tag) : [...form.tags, tag]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.phone.trim() && !form.email.trim()) { setError('Phone or email is required'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            {initial.name ? 'Edit Contact' : 'Add External Contact'}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
            <input
              type="text" value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Maria Gonzalez"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Phone + Email */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
              <input
                type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
                placeholder="+1 555 000 0000"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email" value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="name@company.com"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Company + Language */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
              <input
                type="text" value={form.company} onChange={e => set('company', e.target.value)}
                placeholder="Company name"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Language</label>
              <div className="relative">
                <select
                  value={form.language} onChange={e => set('language', e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white pr-8"
                >
                  {LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Role Tags</label>
            <div className="flex flex-wrap gap-2">
              {PREDEFINED_TAGS.map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    form.tags.includes(tag) ? tagColor(tag, true) : tagColor(tag)
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Any relevant notes about this contact…"
              rows={3} maxLength={2000}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">{form.notes.length}/2000</p>
          </div>

          {/* Org Share Toggle */}
          {hasOrg && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-800">Share with org</p>
                <p className="text-xs text-blue-600 mt-0.5">All org members can view and use this contact</p>
              </div>
              <button
                type="button"
                onClick={() => set('isOrgShared', !form.isOrgShared)}
                className={`relative w-11 h-6 rounded-full transition-colors ${form.isOrgShared ? 'bg-blue-600' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.isOrgShared ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {initial.name ? 'Save changes' : 'Add contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── CSV Import Modal ─────────────────────────────────────────────────────────

function ImportModal({
  hasOrg,
  onImport,
  onClose,
}: {
  hasOrg: boolean;
  onImport: (csv: string, isOrgShared: boolean) => Promise<{ imported: number; skipped: number; errors: string[] }>;
  onClose: () => void;
}) {
  const [csv, setCsv]           = useState('');
  const [isOrgShared, setOrg]   = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult]     = useState<{ imported: number; skipped: number; errors: string[] } | null>(null);
  const [error, setError]       = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = e => setCsv(String(e.target?.result ?? ''));
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const preview = csv.trim().split('\n').slice(0, 6);

  const handleImport = async () => {
    if (!csv.trim()) { setError('Please select or paste a CSV file'); return; }
    setImporting(true);
    setError(null);
    try {
      const res = await onImport(csv, isOrgShared);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const TEMPLATE = 'name,phone,email,company,language,tags\nJohn Smith,+15551234567,john@allstate.com,Allstate Insurance,en,Adjuster;Insurance\nMaria Garcia,+15559876543,,Acme Restoration,es,Homeowner';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Import Contacts from CSV</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {!result ? (
          <div className="p-5 space-y-4">
            {/* Template download */}
            <div className="p-3 bg-blue-50 rounded-xl text-sm text-blue-700 flex items-start gap-2">
              <Download size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Expected columns: name, phone, email, company, language, tags</p>
                <p className="text-blue-600 text-xs mt-0.5">Tags are semicolon-separated (e.g. "Adjuster;Insurance"). Language is 2-letter code (en, es, zh…)</p>
                <button
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`;
                    a.download = 'contacts_template.csv';
                    a.click();
                  }}
                  className="mt-1.5 text-xs underline font-medium hover:text-blue-900"
                >
                  Download template CSV
                </button>
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
            >
              <Upload size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm font-medium text-gray-600">Drop CSV file here or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">Max 500 rows</p>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileInput} />
            </div>

            {/* Or paste */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Or paste CSV text</label>
              <textarea
                value={csv}
                onChange={e => setCsv(e.target.value)}
                placeholder={TEMPLATE}
                rows={5}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* Preview */}
            {preview.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">Preview ({preview.length} rows shown)</p>
                <div className="overflow-x-auto border border-gray-100 rounded-xl">
                  <table className="w-full text-xs">
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} className={i === 0 ? 'bg-gray-50 font-semibold' : 'hover:bg-gray-50'}>
                          {row.split(',').slice(0, 6).map((cell, j) => (
                            <td key={j} className="px-3 py-2 border-b border-gray-100 truncate max-w-[120px]">
                              {cell.replace(/^"|"$/g, '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Org share */}
            {hasOrg && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
                <Share2 size={14} className="text-blue-600 flex-shrink-0" />
                <p className="text-sm text-blue-800 flex-1">Share imported contacts with my org</p>
                <button
                  type="button"
                  onClick={() => setOrg(!isOrgShared)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${isOrgShared ? 'bg-blue-600' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${isOrgShared ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={!csv.trim() || importing}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Import contacts
              </button>
            </div>
          </div>
        ) : (
          /* Result screen */
          <div className="p-5 space-y-4 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <Check size={28} className="text-green-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">Import complete</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-50 rounded-xl p-4">
                <p className="text-3xl font-bold text-green-700">{result.imported}</p>
                <p className="text-sm text-green-600 mt-1">Imported</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-3xl font-bold text-gray-600">{result.skipped}</p>
                <p className="text-sm text-gray-500 mt-1">Skipped</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="text-left bg-red-50 rounded-xl p-3 space-y-1">
                <p className="text-xs font-medium text-red-700">Issues ({result.errors.length}):</p>
                {result.errors.slice(0, 5).map((e, i) => (
                  <p key={i} className="text-xs text-red-600">• {e}</p>
                ))}
                {result.errors.length > 5 && (
                  <p className="text-xs text-red-500">…and {result.errors.length - 5} more</p>
                )}
              </div>
            )}
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Delete Confirmation ──────────────────────────────────────────────────────

function DeleteConfirm({ name, onConfirm, onCancel }: { name: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
          <Trash2 size={20} className="text-red-600" />
        </div>
        <h3 className="text-base font-bold text-gray-900">Delete contact?</h3>
        <p className="text-sm text-gray-500 mt-1">&ldquo;{name}&rdquo; will be permanently removed.</p>
        <div className="flex gap-3 mt-5">
          <button onClick={onCancel} className="flex-1 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onConfirm} className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-xl hover:bg-red-700">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ExternalContactsList({ hasOrg = false }: { hasOrg?: boolean }) {
  const [contacts, setContacts]   = useState<ExternalContact[]>([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState('');
  const [selectedTag, setTag]     = useState('');
  const [scope, setScope]         = useState<'all' | 'personal' | 'org'>('all');
  const [offset, setOffset]       = useState(0);
  const LIMIT = 30;

  // Modal state
  const [showCreate, setShowCreate]     = useState(false);
  const [editContact, setEditContact]   = useState<ExternalContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExternalContact | null>(null);
  const [showImport, setShowImport]     = useState(false);

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = getToken();
    try {
      const params = new URLSearchParams({
        search, tag: selectedTag, scope, limit: String(LIMIT), offset: String(offset),
      });
      const res = await fetch(`/api/contacts/external?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setContacts(data.contacts ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError('Could not load external contacts');
    } finally {
      setLoading(false);
    }
  }, [search, selectedTag, scope, offset]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  // Debounce search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (v: string) => {
    setSearch(v);
    setOffset(0);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(fetchContacts, 300);
  };

  // ── CRUD ────────────────────────────────────────────────────────────────────

  const handleCreate = async (form: ContactFormData) => {
    const token = getToken();
    const res = await fetch('/api/contacts/external', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: 'include',
      body: JSON.stringify({
        name: form.name, phone: form.phone || null, email: form.email || null,
        company: form.company || null, language: form.language, tags: form.tags,
        notes: form.notes || null, isOrgShared: form.isOrgShared,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed to create');
    setShowCreate(false);
    fetchContacts();
  };

  const handleEdit = async (form: ContactFormData) => {
    if (!editContact) return;
    const token = getToken();
    const res = await fetch(`/api/contacts/external/${editContact.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: 'include',
      body: JSON.stringify({
        name: form.name, phone: form.phone || null, email: form.email || null,
        company: form.company || null, language: form.language, tags: form.tags,
        notes: form.notes || null, isOrgShared: form.isOrgShared,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Failed to update');
    setEditContact(null);
    fetchContacts();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const token = getToken();
    await fetch(`/api/contacts/external/${deleteTarget.id}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    setDeleteTarget(null);
    fetchContacts();
  };

  const handleImport = async (csv: string, isOrgShared: boolean) => {
    const token = getToken();
    const res = await fetch('/api/contacts/external/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      credentials: 'include',
      body: JSON.stringify({ csv, isOrgShared }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'Import failed');
    fetchContacts();
    return data;
  };

  const toFormData = (c: ExternalContact): ContactFormData => ({
    name: c.name, phone: c.phone ?? '', email: c.email ?? '',
    company: c.company ?? '', language: c.language,
    tags: c.tags, notes: c.notes ?? '', isOrgShared: c.isOrgShared,
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name, phone, email, company…"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Scope filter */}
        {hasOrg && (
          <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm">
            {(['all', 'personal', 'org'] as const).map(s => (
              <button
                key={s}
                onClick={() => { setScope(s); setOffset(0); }}
                className={`px-3 py-2 font-medium transition-colors ${scope === s ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
              >
                {s === 'all' ? 'All' : s === 'personal' ? <Lock size={13} /> : <Share2 size={13} />}
                {s === 'all' ? '' : s === 'personal' ? ' Mine' : ' Org'}
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors whitespace-nowrap"
        >
          <Upload size={15} /> Import CSV
        </button>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors whitespace-nowrap"
        >
          <Plus size={15} /> Add Contact
        </button>
      </div>

      {/* Tag filter strip */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => { setTag(''); setOffset(0); }}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${!selectedTag ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          All
        </button>
        {PREDEFINED_TAGS.map(tag => (
          <button
            key={tag}
            onClick={() => { setTag(selectedTag === tag ? '' : tag); setOffset(0); }}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedTag === tag ? tagColor(tag, true) : tagColor(tag)}`}
          >
            {tag}
          </button>
        ))}
      </div>

      {/* Stats */}
      <p className="text-xs text-gray-500">
        {total} external contact{total !== 1 ? 's' : ''}
        {selectedTag && ` tagged "${selectedTag}"`}
        {search && ` matching "${search}"`}
      </p>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {error}
        </div>
      ) : contacts.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Users2 size={24} className="text-gray-300" />
          </div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">No external contacts yet</h3>
          <p className="text-xs text-gray-400 mb-4">Add clients, adjusters, and contractors who aren&apos;t on LifeSync.</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              <Upload size={14} /> Import CSV
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700"
            >
              <Plus size={14} /> Add first contact
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {contacts.map(c => (
              <div key={c.id} className="group bg-white rounded-2xl border border-gray-200 p-4 hover:shadow-md transition-shadow">
                {/* Header */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-sm">{getInitials(c.name)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                    {c.company && (
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5 truncate">
                        <Building2 size={10} /> {c.company}
                      </p>
                    )}
                  </div>
                  {/* Org shared badge */}
                  {c.isOrgShared ? (
                    <span title="Shared with org" className="flex-shrink-0 p-1.5 bg-blue-50 rounded-lg">
                      <Share2 size={12} className="text-blue-500" />
                    </span>
                  ) : (
                    <span title="Personal contact" className="flex-shrink-0 p-1.5 bg-gray-50 rounded-lg">
                      <Lock size={12} className="text-gray-400" />
                    </span>
                  )}
                </div>

                {/* Contact info */}
                <div className="space-y-1 mb-3">
                  {c.phone && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <Phone size={11} className="text-gray-400 flex-shrink-0" />
                      <span className="truncate">{c.phone}</span>
                    </div>
                  )}
                  {c.email && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <Mail size={11} className="text-gray-400 flex-shrink-0" />
                      <span className="truncate">{c.email}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Globe size={11} className="flex-shrink-0" />
                    <span>{langLabel(c.language)}</span>
                  </div>
                </div>

                {/* Tags */}
                {c.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {c.tags.slice(0, 3).map(tag => (
                      <span key={tag} className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${tagColor(tag)}`}>
                        {tag}
                      </span>
                    ))}
                    {c.tags.length > 3 && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] text-gray-400 bg-gray-100">
                        +{c.tags.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 pt-2 border-t border-gray-50">
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-blue-600 border border-blue-100 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      <Phone size={12} /> Call
                    </a>
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-600 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Mail size={12} /> Email
                    </a>
                  )}
                  <div className="flex-1" />
                  {/* Edit / Delete — only owner sees edit; owner or admin sees delete */}
                  {c.isOwner && (
                    <button
                      onClick={() => setEditContact(c)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteTarget(c)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {total > LIMIT && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}
              </span>
              <button
                disabled={offset + LIMIT >= total}
                onClick={() => setOffset(offset + LIMIT)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showCreate && (
        <ContactModal
          initial={EMPTY_FORM}
          hasOrg={hasOrg}
          onSave={handleCreate}
          onClose={() => setShowCreate(false)}
        />
      )}
      {editContact && (
        <ContactModal
          initial={toFormData(editContact)}
          hasOrg={hasOrg}
          onSave={handleEdit}
          onClose={() => setEditContact(null)}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          name={deleteTarget.name}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {showImport && (
        <ImportModal
          hasOrg={hasOrg}
          onImport={handleImport}
          onClose={() => { setShowImport(false); fetchContacts(); }}
        />
      )}
    </div>
  );
}
