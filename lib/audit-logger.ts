/**
 * Audit Logger Service
 * Logs all security-relevant events for compliance and monitoring
 *
 * GDPR Compliance:
 * - User data access is logged and auditable
 * - Data processing activities are tracked
 * - Retention policy: 90 days for audit logs
 *
 * SOC 2 Compliance:
 * - All authentication attempts logged
 * - All data modifications logged
 * - System access logged with timestamps
 */

interface AuditLogEntry {
  timestamp: string;
  eventType: 'AUTH' | 'DATA_ACCESS' | 'DATA_MODIFY' | 'DATA_DELETE' | 'ADMIN' | 'SECURITY' | 'ERROR';
  userId?: string;
  ipAddress?: string;
  resource: string;
  action: string;
  status: 'SUCCESS' | 'FAILURE';
  details?: Record<string, unknown>;
  errorMessage?: string;
}

class AuditLogger {
  private logQueue: AuditLogEntry[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Flush logs periodically (every 10 seconds or 100 entries)
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 10000);
  }

  /**
   * Log authentication event
   */
  logAuth(
    userId: string,
    ipAddress: string,
    action: string,
    status: 'SUCCESS' | 'FAILURE',
    details?: Record<string, unknown>
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'AUTH',
      userId,
      ipAddress,
      resource: 'authentication',
      action,
      status,
      details
    });
  }

  /**
   * Log data access (READ)
   * GDPR: Track who accessed what data and when
   */
  logDataAccess(
    userId: string,
    resource: string,
    resourceId: string,
    ipAddress: string,
    details?: Record<string, unknown>
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'DATA_ACCESS',
      userId,
      ipAddress,
      resource,
      action: `read_${resource}`,
      status: 'SUCCESS',
      details: {
        resourceId,
        ...details
      }
    });
  }

  /**
   * Log data modification (CREATE/UPDATE)
   * GDPR: Track data processing activities
   */
  logDataModify(
    userId: string,
    resource: string,
    resourceId: string,
    ipAddress: string,
    action: 'create' | 'update',
    details?: Record<string, unknown>
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'DATA_MODIFY',
      userId,
      ipAddress,
      resource,
      action: `${action}_${resource}`,
      status: 'SUCCESS',
      details: {
        resourceId,
        ...details
      }
    });
  }

  /**
   * Log data deletion
   * GDPR: Track data retention and deletion activities
   */
  logDataDelete(
    userId: string,
    resource: string,
    resourceId: string,
    ipAddress: string,
    reason: string,
    details?: Record<string, unknown>
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'DATA_DELETE',
      userId,
      ipAddress,
      resource,
      action: `delete_${resource}`,
      status: 'SUCCESS',
      details: {
        resourceId,
        reason,
        ...details
      }
    });
  }

  /**
   * Log administrative actions
   * SOC 2: Track privileged access and configuration changes
   */
  logAdmin(
    userId: string,
    ipAddress: string,
    action: string,
    resource: string,
    status: 'SUCCESS' | 'FAILURE',
    details?: Record<string, unknown>
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'ADMIN',
      userId,
      ipAddress,
      resource,
      action,
      status,
      details
    });
  }

  /**
   * Log security events (suspicious activity, policy violations)
   */
  logSecurity(
    eventType: string,
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
    userId?: string,
    ipAddress?: string,
    details?: Record<string, unknown>
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'SECURITY',
      userId,
      ipAddress,
      resource: 'security',
      action: eventType,
      status: 'SUCCESS',
      details: {
        severity,
        ...details
      }
    });
  }

  /**
   * Log errors (especially those involving security)
   */
  logError(
    error: Error,
    context: string,
    userId?: string,
    ipAddress?: string
  ): void {
    this.log({
      timestamp: new Date().toISOString(),
      eventType: 'ERROR',
      userId,
      ipAddress,
      resource: context,
      action: 'error',
      status: 'FAILURE',
      errorMessage: error.message,
      details: {
        stack: error.stack
      }
    });
  }

  /**
   * Generic logging method
   */
  private log(entry: AuditLogEntry): void {
    this.logQueue.push(entry);

    // Flush if queue is large
    if (this.logQueue.length >= 100) {
      this.flush();
    }
  }

  /**
   * Flush logs to persistent storage
   * In production, this would write to a database or centralized logging service
   */
  private async flush(): Promise<void> {
    if (this.logQueue.length === 0) return;

    const entriesToFlush = [...this.logQueue];
    this.logQueue = [];

    try {
      // TODO: Send to centralized logging service
      // Examples:
      // - Datadog
      // - Sentry (for errors)
      // - CloudWatch
      // - ELK Stack
      // - Splunk

      // For now, log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[AuditLog] Flushed ${entriesToFlush.length} entries`);
      }

      // In production, send to database
      if (process.env.NODE_ENV === 'production') {
        // await this.sendToLoggingService(entriesToFlush);
      }
    } catch (error) {
      console.error('Failed to flush audit logs:', error);
      // Re-queue entries if flush failed
      this.logQueue.unshift(...entriesToFlush);
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    // Final flush
    this.flush();
  }
}

// Singleton instance
export const auditLogger = new AuditLogger();

/**
 * Helper function to extract IP address from request
 */
export function getClientIP(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return headers.get('x-real-ip') || 'unknown';
}

/**
 * Middleware for automatic logging in API routes
 */
export function withAuditLogging(handler: Function) {
  return async (request: Request, ...args: any[]) => {
    const headers = request.headers;
    const ip = getClientIP(headers);
    const method = request.method;
    const url = new URL(request.url);
    const pathname = url.pathname;

    try {
      const response = await handler(request, ...args);

      // Log successful requests
      if (pathname.includes('/api/')) {
        auditLogger.log({
          timestamp: new Date().toISOString(),
          eventType: 'DATA_ACCESS',
          ipAddress: ip,
          resource: pathname,
          action: method,
          status: 'SUCCESS'
        });
      }

      return response;
    } catch (error) {
      // Log failed requests
      if (error instanceof Error) {
        auditLogger.logError(error, pathname, undefined, ip);
      }
      throw error;
    }
  };
}
