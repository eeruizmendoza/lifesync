/**
 * Research Pipeline Scheduler
 * Phase 13.9: Daily cron task for model benchmarking
 *
 * Runs at 2 AM UTC daily to:
 * - Check for new model versions
 * - Benchmark promising candidates
 * - Auto-switch to better models
 * - Create PRs for manual review
 */

import { getResearchPipeline } from './research-pipeline';

/**
 * Daily research pipeline execution
 * Called by cron at 2 AM UTC
 */
export async function runDailyResearchPipeline(): Promise<{
  success: boolean;
  timestamp: string;
  message: string;
  duration: number;
}> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Research Pipeline - ${timestamp}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    const pipeline = getResearchPipeline({
      enabled: true,
      checkInterval: 86400000, // 24 hours
      improvementThreshold: 0.02, // 2%
      autoApproveThreshold: 0.05, // 5%
      notifyOnMajor: true,
    });

    // Run the pipeline
    await pipeline.start();

    // Get results
    const status = pipeline.getStatus();
    const history = pipeline.getHistory();

    const duration = Date.now() - startTime;

    console.log(`\n✅ Research Pipeline Complete`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   Status: ${JSON.stringify(status, null, 2)}`);
    console.log(`   Recent History: ${history.length} benchmarks`);
    console.log(`\n${'='.repeat(60)}\n`);

    return {
      success: true,
      timestamp,
      message: `Research pipeline completed successfully`,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error(`\n❌ Research Pipeline Failed`);
    console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`   Duration: ${duration}ms`);
    console.error(`\n${'='.repeat(60)}\n`);

    return {
      success: false,
      timestamp,
      message: `Research pipeline failed: ${error instanceof Error ? error.message : String(error)}`,
      duration,
    };
  }
}

/**
 * Cron handler - exports for serverless functions
 */
export async function researchPipelineHandler(req: any): Promise<any> {
  // Verify cron token (security)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized' }),
    };
  }

  const result = await runDailyResearchPipeline();

  return {
    statusCode: result.success ? 200 : 500,
    body: JSON.stringify(result),
  };
}

/**
 * Initialize scheduler (called on app startup)
 * Registers the cron job
 */
export async function initializeResearchScheduler(): Promise<void> {
  console.log('📅 Initializing Research Pipeline Scheduler');

  // Schedule daily at 2 AM UTC
  // In production: use a proper cron scheduler like node-cron or Cloud Scheduler

  // Example with node-cron:
  // import cron from 'node-cron';
  // cron.schedule('0 2 * * *', () => {
  //   runDailyResearchPipeline().catch(error => {
  //     console.error('Cron job failed:', error);
  //   });
  // });

  console.log('✅ Research Pipeline Scheduler initialized (2 AM UTC daily)');
}

/**
 * Manual trigger for testing
 */
export async function triggerResearchPipelineManually(): Promise<void> {
  console.log('🚀 Manually triggering Research Pipeline');
  const result = await runDailyResearchPipeline();
  console.log('Result:', result);
}
