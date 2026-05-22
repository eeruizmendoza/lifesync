/**
 * Recording Announcement API
 * POST /api/calls/recording-announcement
 * Generate and serve recording announcement audio
 * Enhanced for Phase 13.3: Legal compliance with jurisdiction-specific warnings
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { getRecordingAnnouncementService } from '@/lib/recording-announcement-service';

interface RecordingAnnouncementRequest {
  callId: string;
  jurisdiction?: string; // e.g., 'two-party-consent', 'california', 'florida'
  language?: string; // e.g., 'en', 'es', 'zh'
  state?: string; // e.g., 'CA', 'FL' - will be used to detect jurisdiction if not provided
}

interface RecordingAnnouncementResponse {
  callId: string;
  jurisdiction: string;
  language: string;
  audioUrl?: string; // URL to download announcement audio
  announcementText: string;
  durationMs: number;
  isTwoPartyConsent: boolean;
  generatedAt: number;
}

/**
 * POST /api/calls/recording-announcement
 * Generate jurisdiction-specific recording announcement
 */
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request
    const body = (await request.json()) as RecordingAnnouncementRequest;
    const { callId, jurisdiction, language = 'en', state } = body;

    // Validate
    if (!callId) {
      return NextResponse.json(
        { error: 'Missing required field: callId' },
        { status: 400 }
      );
    }

    // Get announcement service
    const announcementService = getRecordingAnnouncementService();

    // Detect jurisdiction from state if not provided
    const detectedJurisdiction = jurisdiction || announcementService.detectJurisdiction(state);

    // Get announcement text
    const announcementText = announcementService.getAnnouncementText(
      detectedJurisdiction,
      language
    );

    // Generate announcement audio
    const audioBuffer = await announcementService.generateAnnouncement({
      jurisdiction: detectedJurisdiction,
      language,
    });

    // Estimate duration (rough estimate: 2.5 words per second)
    const words = announcementText.split(/\s+/).length;
    const estimatedDurationMs = Math.ceil((words / 2.5) * 1000);

    // Determine if two-party consent
    const twoPartyConsentStates = [
      'CA', 'FL', 'PA', 'IL', 'NY', 'WA', 'HI', 'MD', 'MT', 'NH', 'NJ', 'VA', 'VT',
    ];
    const isTwoPartyConsent =
      detectedJurisdiction === 'two-party-consent' ||
      twoPartyConsentStates.includes((state || '').toUpperCase());

    // Log the announcement generation
    console.log(
      `📢 Recording announcement generated: ${callId} (${detectedJurisdiction}, ${language})`
    );

    const response: RecordingAnnouncementResponse = {
      callId,
      jurisdiction: detectedJurisdiction,
      language,
      announcementText,
      durationMs: estimatedDurationMs,
      isTwoPartyConsent,
      generatedAt: Date.now(),
    };

    // Return the announcement data
    // Note: In production, you'd store the audio and return a URL
    // For now, the frontend will use the service directly
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Failed to generate recording announcement:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to generate announcement',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/calls/recording-announcement
 * Retrieve announcement for a call (query params: callId, jurisdiction, language)
 */
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await verifyAuthWithTestSupport(authHeader);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const callId = searchParams.get('callId');
    const jurisdiction = searchParams.get('jurisdiction');
    const language = searchParams.get('language') || 'en';
    const state = searchParams.get('state');

    if (!callId) {
      return NextResponse.json(
        { error: 'Missing required parameter: callId' },
        { status: 400 }
      );
    }

    // Get announcement service
    const announcementService = getRecordingAnnouncementService();

    // Detect jurisdiction
    const detectedJurisdiction = jurisdiction || announcementService.detectJurisdiction(state || undefined);

    // Get announcement text
    const announcementText = announcementService.getAnnouncementText(
      detectedJurisdiction,
      language
    );

    // Estimate duration
    const words = announcementText.split(/\s+/).length;
    const estimatedDurationMs = Math.ceil((words / 2.5) * 1000);

    // Determine if two-party consent
    const twoPartyConsentStates = [
      'CA', 'FL', 'PA', 'IL', 'NY', 'WA', 'HI', 'MD', 'MT', 'NH', 'NJ', 'VA', 'VT',
    ];
    const isTwoPartyConsent =
      detectedJurisdiction === 'two-party-consent' ||
      twoPartyConsentStates.includes((state || '').toUpperCase());

    const response: RecordingAnnouncementResponse = {
      callId,
      jurisdiction: detectedJurisdiction,
      language,
      announcementText,
      durationMs: estimatedDurationMs,
      isTwoPartyConsent,
      generatedAt: Date.now(),
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Failed to retrieve announcement:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to retrieve announcement',
      },
      { status: 500 }
    );
  }
}
