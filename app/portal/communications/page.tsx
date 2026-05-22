'use client';

import { useState } from 'react';
import { CallProvider } from '@/lib/hooks/useCallContext';
import { UnifiedInbox } from '@/components/portal/communications/UnifiedInbox';
import { PhoneCallDialog } from '@/components/portal/communications/PhoneCallDialog';
import { VideoCallDialog } from '@/components/portal/communications/VideoCallDialog';
import { Phone, Video } from 'lucide-react';

export default function CommunicationsPage() {
  const [phoneCallOpen, setPhoneCallOpen] = useState(false);
  const [videoCallOpen, setVideoCallOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<{
    id: string;
    name: string;
    phone: string;
    sourceLanguage: string;
    targetLanguage: string;
  } | null>(null);

  const handlePhoneCall = (contactId: string, name: string, phone: string) => {
    setSelectedContact({
      id: contactId,
      name,
      phone,
      sourceLanguage: 'es',
      targetLanguage: 'en',
    });
    setPhoneCallOpen(true);
  };

  const handleVideoCall = (contactId: string, name: string) => {
    setSelectedContact({
      id: contactId,
      name,
      phone: '',
      sourceLanguage: 'es',
      targetLanguage: 'en',
    });
    setVideoCallOpen(true);
  };

  return (
    <CallProvider>
      <div className="h-full flex flex-col bg-white">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Communications</h1>
              <p className="mt-1 text-sm text-gray-500">Real-time translation calls and messages</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handlePhoneCall('contact_1', 'John Smith', '+1 (555) 123-4567')}
                className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 transition font-medium"
              >
                <Phone size={18} />
                Phone Call
              </button>
              <button
                onClick={() => handleVideoCall('contact_1', 'John Smith')}
                className="flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-white hover:bg-purple-600 transition font-medium"
              >
                <Video size={18} />
                Video Call
              </button>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-hidden">
          <UnifiedInbox
            onSelectConversation={(id) => {
              // Handle conversation selection
            }}
          />
        </div>

        {/* Phone Call Dialog */}
        {selectedContact && (
          <PhoneCallDialog
            contactId={selectedContact.id}
            contactName={selectedContact.name}
            contactPhone={selectedContact.phone}
            sourceLanguage={selectedContact.sourceLanguage}
            targetLanguage={selectedContact.targetLanguage}
            isOpen={phoneCallOpen}
            onClose={() => {
              setPhoneCallOpen(false);
              setSelectedContact(null);
            }}
          />
        )}

        {/* Video Call Dialog */}
        {selectedContact && (
          <VideoCallDialog
            contactId={selectedContact.id}
            contactName={selectedContact.name}
            sourceLanguage={selectedContact.sourceLanguage}
            targetLanguage={selectedContact.targetLanguage}
            isOpen={videoCallOpen}
            onClose={() => {
              setVideoCallOpen(false);
              setSelectedContact(null);
            }}
          />
        )}
      </div>
    </CallProvider>
  );
}
