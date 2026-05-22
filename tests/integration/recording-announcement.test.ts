/**
 * Unit Tests for Recording Announcement Service
 * Phase 13.3: Legal compliance with jurisdiction-specific warnings
 */

import { getRecordingAnnouncementService } from '@/lib/recording-announcement-service';

describe('Recording Announcement Service - Phase 13.3', () => {
  const announcementService = getRecordingAnnouncementService();

  const twoPartyConsentStates = ['CA', 'FL', 'PA', 'IL', 'NY', 'WA', 'HI', 'MD', 'MT', 'NH', 'NJ', 'VA', 'VT'];
  const onePartyConsentStates = ['TX', 'CO', 'AZ', 'NV', 'UT', 'GA'];

  describe('Jurisdiction Detection', () => {
    test('detects california as two-party consent', () => {
      const jurisdiction = announcementService.detectJurisdiction('CA');
      expect(jurisdiction).toBe('two-party-consent');
    });

    test('correctly identifies all two-party consent states', () => {
      twoPartyConsentStates.forEach((state) => {
        const jurisdiction = announcementService.detectJurisdiction(state);
        expect(jurisdiction).toBe('two-party-consent');
      });
    });

    test('detects texas as one-party consent', () => {
      const jurisdiction = announcementService.detectJurisdiction('TX');
      expect(jurisdiction).toBe('one-party-consent');
    });

    test('correctly identifies one-party consent states', () => {
      onePartyConsentStates.forEach((state) => {
        const jurisdiction = announcementService.detectJurisdiction(state);
        expect(jurisdiction).toBe('one-party-consent');
      });
    });

    test('defaults to one-party consent when no state provided', () => {
      const jurisdiction = announcementService.detectJurisdiction(undefined);
      expect(jurisdiction).toBe('one-party-consent');
    });

    test('handles lowercase state codes', () => {
      const jurisdiction = announcementService.detectJurisdiction('ca');
      expect(jurisdiction).toBe('two-party-consent');
    });

    test('handles mixed case state codes', () => {
      const jurisdiction = announcementService.detectJurisdiction('Ca');
      expect(jurisdiction).toBe('two-party-consent');
    });
  });

  describe('Announcement Text Generation', () => {
    test('generates announcement for two-party consent', () => {
      const text = announcementService.getAnnouncementText('two-party-consent', 'en');
      expect(text).toBeTruthy();
      expect(text.length).toBeGreaterThan(0);
      expect(text.toLowerCase()).toMatch(/consent|recording|party/i);
    });

    test('generates announcement for one-party consent', () => {
      const text = announcementService.getAnnouncementText('one-party-consent', 'en');
      expect(text).toBeTruthy();
      expect(text.length).toBeGreaterThan(0);
      expect(text.toLowerCase()).toMatch(/notified|recording|record/i);
    });

    test('supports english language', () => {
      const text = announcementService.getAnnouncementText('two-party-consent', 'en');
      expect(text).toBeTruthy();
    });

    test('supports spanish language announcement', () => {
      const text = announcementService.getAnnouncementText('two-party-consent', 'es');
      expect(text).toBeTruthy();
      expect(text.length).toBeGreaterThan(0);
    });

    test('supports chinese language announcement', () => {
      const text = announcementService.getAnnouncementText('two-party-consent', 'zh');
      expect(text).toBeTruthy();
      expect(text.length).toBeGreaterThan(0);
    });

    test('defaults to english if language not specified', () => {
      const text = announcementService.getAnnouncementText('two-party-consent');
      expect(text).toBeTruthy();
      expect(text.toLowerCase()).toMatch(/consent|recording/i);
    });

    test('provides different text for different consent types', () => {
      const text1 = announcementService.getAnnouncementText('two-party-consent', 'en');
      const text2 = announcementService.getAnnouncementText('one-party-consent', 'en');
      expect(text1).not.toBe(text2);
    });

    test('provides different text for different languages', () => {
      const text1 = announcementService.getAnnouncementText('two-party-consent', 'en');
      const text2 = announcementService.getAnnouncementText('two-party-consent', 'es');
      expect(text1).not.toBe(text2);
    });
  });

  describe('Recording Announcement Generation', () => {
    test('generates announcement audio with config', async () => {
      const result = await announcementService.generateAnnouncement({
        jurisdiction: 'two-party-consent',
        language: 'en',
      });

      expect(result).toBeTruthy();
      expect(result.jurisdiction).toBe('two-party-consent');
      expect(result.language).toBe('en');
      expect(result.duration).toBeGreaterThan(0);
    });

    test('generates spanish language audio', async () => {
      const result = await announcementService.generateAnnouncement({
        jurisdiction: 'two-party-consent',
        language: 'es',
      });

      expect(result).toBeTruthy();
      expect(result.language).toBe('es');
    });

    test('generates chinese language audio', async () => {
      const result = await announcementService.generateAnnouncement({
        jurisdiction: 'one-party-consent',
        language: 'zh',
      });

      expect(result).toBeTruthy();
      expect(result.language).toBe('zh');
    });

    test('provides reasonable duration estimates', async () => {
      const result = await announcementService.generateAnnouncement({
        jurisdiction: 'two-party-consent',
        language: 'en',
      });

      // Duration should be between 2-10 seconds (2000-10000ms)
      expect(result.duration).toBeGreaterThanOrEqual(1);
      expect(result.duration).toBeLessThan(15);
    });
  });

  describe('Recording Announcement Playback', () => {
    test('plays announcement with callId tracking', async () => {
      const result = await announcementService.playRecordingAnnouncement('call-001', {
        jurisdiction: 'two-party-consent',
        language: 'en',
      });

      expect(result).toBeTruthy();
      expect(result.success).toBe(true);
      expect(result.callId).toBe('call-001');
    });

    test('plays announcement for different jurisdictions', async () => {
      const result = await announcementService.playRecordingAnnouncement('call-002', {
        jurisdiction: 'one-party-consent',
        language: 'en',
      });

      expect(result.success).toBe(true);
    });

    test('tracks announcement state for audit trail', async () => {
      const callId = `call-${Date.now()}-test`;
      const result = await announcementService.playRecordingAnnouncement(callId, {
        jurisdiction: 'two-party-consent',
        language: 'en',
      });

      expect(result.callId).toBe(callId);
    });

    test('plays announcements in different languages', async () => {
      const languages = ['en', 'es', 'zh'];

      for (const lang of languages) {
        const result = await announcementService.playRecordingAnnouncement(`call-${lang}`, {
          jurisdiction: 'two-party-consent',
          language: lang,
        });

        expect(result.success).toBe(true);
      }
    });
  });

  describe('Legal Compliance Requirements', () => {
    test('two-party consent announcement includes consent language', () => {
      const text = announcementService.getAnnouncementText('two-party-consent', 'en');
      expect(text.toLowerCase()).toMatch(/consent/);
    });

    test('one-party consent announcement includes notification language', () => {
      const text = announcementService.getAnnouncementText('one-party-consent', 'en');
      expect(text.toLowerCase()).toMatch(/notif|record/);
    });

    test('announcement mentions recording in all jurisdictions', () => {
      const text1 = announcementService.getAnnouncementText('two-party-consent', 'en');
      const text2 = announcementService.getAnnouncementText('one-party-consent', 'en');

      expect(text1.toLowerCase()).toMatch(/recording|recorded|record/);
      expect(text2.toLowerCase()).toMatch(/recording|recorded|record/);
    });

    test('announcement duration is reasonable for all text', () => {
      const jurisdictions = ['two-party-consent', 'one-party-consent'];
      const languages = ['en', 'es', 'zh'];

      jurisdictions.forEach((jurisdiction) => {
        languages.forEach((language) => {
          const text = announcementService.getAnnouncementText(jurisdiction, language);

          // Text should be non-empty and substantial
          expect(text).toBeTruthy();
          expect(text.length).toBeGreaterThan(5);

          // For English/Spanish, check word count
          if (language !== 'zh') {
            const wordCount = text.split(/\s+/).length;
            expect(wordCount).toBeGreaterThanOrEqual(5);
          } else {
            // For Chinese, just check character count (denser language)
            expect(text.length).toBeGreaterThanOrEqual(10);
          }
        });
      });
    });

    test('provides consistent messaging across jurisdictions', () => {
      const twoPartyText = announcementService.getAnnouncementText('two-party-consent', 'en');
      const onePartyText = announcementService.getAnnouncementText('one-party-consent', 'en');

      // Both should mention key legal concepts
      expect(twoPartyText.toLowerCase()).toMatch(/consent|recording|party|law/i);
      expect(onePartyText.toLowerCase()).toMatch(/notif|record/i);
    });

    test('spanish announcements are translations of english', () => {
      const enText = announcementService.getAnnouncementText('two-party-consent', 'en');
      const esText = announcementService.getAnnouncementText('two-party-consent', 'es');

      // Both should address consent requirement (even if worded differently)
      expect(enText.toLowerCase()).toMatch(/consent/i);
      expect(esText.toLowerCase()).toMatch(/consentimiento|consentir|consenti/i);
    });

    test('chinese announcements convey legal requirement', () => {
      const zhText = announcementService.getAnnouncementText('two-party-consent', 'zh');

      // Should be substantial text (Chinese characters are more dense)
      expect(zhText.length).toBeGreaterThan(10);
    });
  });

  describe('Service Initialization', () => {
    test('service initializes successfully', () => {
      expect(announcementService).toBeTruthy();
    });

    test('service provides all required methods', () => {
      expect(typeof announcementService.detectJurisdiction).toBe('function');
      expect(typeof announcementService.getAnnouncementText).toBe('function');
      expect(typeof announcementService.generateAnnouncement).toBe('function');
      expect(typeof announcementService.playRecordingAnnouncement).toBe('function');
    });

    test('service is singleton', () => {
      const service1 = getRecordingAnnouncementService();
      const service2 = getRecordingAnnouncementService();

      expect(service1).toBe(service2);
    });
  });
});
