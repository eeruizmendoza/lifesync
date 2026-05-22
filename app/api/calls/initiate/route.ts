/**
 * Initiate Call API
 * POST /api/calls/initiate
 * Caller initiates a new call to a contact
 * Enhanced for Phase 13.3: WebSocket URL generation, state machine integration, recording announcements
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthWithTestSupport } from '@/lib/auth-helper';
import { getMediasoupSFU } from '@/lib/mediasoup-handler';
import { getCallRegistry, CallStateContext } from '@/lib/call-state-machine';
import { getRecordingAnnouncementService } from '@/lib/recording-announcement-service';
import { db } from '@/lib/db';
import { requireOrgContext, recordCallUsage } from '@/lib/tenant-middleware';

interface InitiateCallRequest {
  contactId: string; // UUID of person being called
  contactPhone?: string; // E.164 phone number
  sourceLanguage: string; // 'es', 'zh', etc. (caller's language)
  targetLanguage: string; // 'zh', 'es', etc. (receiver's language)
  callType: 'audio' | 'video'; // Audio or video call
  userState?: string; // Caller's state for jurisdiction detection (e.g., 'CA', 'FL')
}

interface InitiateCallResponse {
  callId: string;
  callerId: string;
  receiverId: string;
  sourceLanguage: string;
  targetLanguage: string;
  callType: 'audio' | 'video';
  status: 'ringing'; // Call initiated, waiting for answer
  stunServers: string[];
  turnServers: Array<{ urls: string[]; username?: string; credential?: string }>;
  mediasoupConfig?: {
    routerRtpCapabilities: any; // RTP capabilities for WebRTC
  };
  wsUrl: string; // WebSocket URL for real-time updates (metrics, transcripts, captions)
  metricsWsUrl: string; // Separate WebSocket for streaming metrics
  createdAt: number;
  expiresAt: number; // Call expires if not answered in 30 seconds
  // Recording announcement information
  announcement?: {
    jurisdiction: string;
    language: string;
    isTwoPartyConsent: boolean;
  };
}

/**
 * POST /api/calls/initiate
 */
export async function POST(request: NextRequest) {
  try {
    // Verify caller authentication (supports both production auth and test tokens)
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const caller = await verifyAuthWithTestSupport(authHeader);
    if (!caller) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Phase 3: enforce org quota before initiating call
    if (caller.orgId) {
      const { quotaError } = await requireOrgContext(caller, { checkQuotas: true, resource: 'calls' });
      if (quotaError) return quotaError;
    }

    // Parse request
    const body = (await request.json()) as InitiateCallRequest;
    const { contactId, contactPhone, sourceLanguage, targetLanguage, callType = 'audio', userState } = body;

    // Validate required fields
    if (!contactId || !sourceLanguage || !targetLanguage) {
      return NextResponse.json(
        {
          error: 'Missing required fields: contactId, sourceLanguage, targetLanguage',
        },
        { status: 400 }
      );
    }

    // Get announcement service for recording compliance
    const announcementService = getRecordingAnnouncementService();
    const jurisdiction = announcementService.detectJurisdiction(userState);
    const twoPartyConsentStates = [
      'CA', 'FL', 'PA', 'IL', 'NY', 'WA', 'HI', 'MD', 'MT', 'NH', 'NJ', 'VA', 'VT',
    ];
    const isTwoPartyConsent =
      jurisdiction === 'two-party-consent' ||
      twoPartyConsentStates.includes((userState || '').toUpperCase());

    // Validate language codes
    const validLanguages = ['en', 'es', 'zh', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko'];
    if (!validLanguages.includes(sourceLanguage) || !validLanguages.includes(targetLanguage)) {
      return NextResponse.json(
        { error: 'Invalid language code. Supported: ' + validLanguages.join(', ') },
        { status: 400 }
      );
    }

    // TODO: Verify contact exists and is not blocked
    // const contact = await db.user.findUnique({ where: { id: contactId } });
    // if (!contact) return NextResponse.json({ error: 'Contact not found' }, { status: 404 });

    // Generate call ID
    const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Get STUN/TURN servers
    const stunServers = process.env.STUN_SERVERS?.split(',') || [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
    ];

    const turnServers = process.env.TURN_SERVERS ? JSON.parse(process.env.TURN_SERVERS) : [];

    // Initialize Mediasoup for this call
    const sfu = getMediasoupSFU();
    const routerRtpCapabilities = sfu.getRouterRtpCapabilities();

    // Generate WebSocket URLs
    const protocol = request.nextUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = request.headers.get('host') || 'localhost:3000';
    const wsUrl = `${protocol}//${host}/api/calls/${callId}/status`;
    const metricsWsUrl = `${protocol}//${host}/api/calls/${callId}/metrics`;

    // Create call in state machine registry
    const registry = getCallRegistry();
    const callContext: CallStateContext = {
      callId,
      currentState: 'ringing',
      callerId: caller.id,
      receiverId: contactId,
      sourceLanguage,
      targetLanguage,
      callType,
      createdAt: Date.now(),
      wsUrl,
    };

    try {
      registry.createCall(callContext);
    } catch (error) {
      console.error('Failed to create call in registry:', error);
      return NextResponse.json(
        { error: 'Failed to register call' },
        { status: 500 }
      );
    }

    // Create conversation record in database
    // TODO: Uncomment when database is ready
    /*
    const conversation = await db.conversation.create({
      data: {
        id: callId,
        type: callType,
        sourceLanguage,
        targetLanguage,
        callerId: caller.id,
        receiverId: contactId,
        status: 'ringing',
        startTime: new Date(),
      },
    });
    */

    // Prepare response
    const expiresAt = Date.now() + 30000; // 30 seconds to answer

    const response: InitiateCallResponse = {
      callId,
      callerId: caller.id,
      receiverId: contactId,
      sourceLanguage,
      targetLanguage,
      callType,
      status: 'ringing',
      stunServers,
      turnServers,
      mediasoupConfig: {
        routerRtpCapabilities,
      },
      wsUrl,
      metricsWsUrl,
      createdAt: Date.now(),
      expiresAt,
      // Include announcement information for compliance
      announcement: {
        jurisdiction,
        language: sourceLanguage,
        isTwoPartyConsent,
      },
    };

    // Phase 3: record usage for quota tracking
    if (caller.orgId) {
      recordCallUsage(caller.orgId); // fire-and-forget, non-blocking
    }

    console.log(`📞 Call initiated: ${callId} (${caller.id} → ${contactId})`);
    console.log(`   Languages: ${sourceLanguage} → ${targetLanguage}`);
    console.log(`   Type: ${callType}`);
    console.log(`   Recording: ${jurisdiction} (${isTwoPartyConsent ? 'two-party consent required' : 'one-party consent'})`);
    console.log(`   Expires at: ${new Date(expiresAt).toISOString()}`);

    // TODO: Send push notification to receiver
    // await sendPushNotification(contactId, {
    //   type: 'incoming_call',
    //   callId,
    //   callerId: caller.id,
    //   callerName: caller.name,
    //   languages: `${sourceLanguage} → ${targetLanguage}`,
    // });

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Failed to initiate call:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to initiate call',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/calls/initiate/:callId
 * Check if call is still active (not expired)
 */
export async function GET(request: NextRequest) {
  try {
    const callId = request.nextUrl.searchParams.get('callId');
    if (!callId) {
      return NextResponse.json({ error: 'Missing callId parameter' }, { status: 400 });
    }

    // TODO: Fetch call from database
    // const call = await db.conversation.findUnique({ where: { id: callId } });

    // For now, return placeholder
    return NextResponse.json(
      {
        callId,
        status: 'ringing',
        // Additional call details
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Failed to get call status:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to get call status',
      },
      { status: 500 }
    );
  }
}
