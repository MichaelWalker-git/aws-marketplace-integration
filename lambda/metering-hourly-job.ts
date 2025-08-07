import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { ScheduledEvent, Context, ScheduledHandler } from 'aws-lambda';
import {
    processBatch,
    queryPendingMeteringRecords,
    validateEnvironment,
    cleanupStuckProcessingRecords
} from "../helpers/metering-hourly-job-helper";

// Constants
const BATCH_SIZE = 25; // SQS batch size limit
const MAX_RECORDS_PER_EXECUTION = 1000; // Prevent Lambda timeout

interface ProcessingResult {
    totalProcessed: number;
    successCount: number;
    errorCount: number;
    errors: string[];
}

/**
 * Main handler function for the scheduled Lambda
 */
export const handler: ScheduledHandler = async (
    event: ScheduledEvent,
    context: Context
): Promise<void> => {
    console.log('Starting hourly metering job', {
        requestId: context.awsRequestId,
        remainingTimeInMillis: context.getRemainingTimeInMillis(),
        eventTime: event.time
    });

    try {
        // Validate environment variables
        validateEnvironment();

        // Step 1: Cleanup any stuck processing records from previous runs
        console.log('Cleaning up stuck processing records...');
        await cleanupStuckProcessingRecords();

        const processingResult: ProcessingResult = {
            totalProcessed: 0,
            successCount: 0,
            errorCount: 0,
            errors: []
        };

        let lastEvaluatedKey: Record<string, any> | undefined;
        let iterationCount = 0;
        const maxIterations = Math.ceil(MAX_RECORDS_PER_EXECUTION / BATCH_SIZE);

        do {
            // Check remaining execution time
            const remainingTime = context.getRemainingTimeInMillis();
            if (remainingTime < 30000) { // 30 seconds buffer
                console.log(`Approaching Lambda timeout, stopping processing, remainingTime: ${remainingTime}`);
                break;
            }

            iterationCount++;
            console.log(`Processing iteration ${iterationCount}, remaining time: ${remainingTime}ms`);

            // Query for pending records (metering_pending = 'true')
            const queryResult = await queryPendingMeteringRecords(lastEvaluatedKey);

            if (queryResult.items.length === 0) {
                console.log('No more pending metering records found');
                break;
            }

            console.log(`Found ${queryResult.items.length} pending metering records`);

            // Process the batch (this will mark them as 'processing', then send to SQS)
            const batchResult = await processBatch(queryResult.items);

            // Update overall results
            processingResult.totalProcessed += queryResult.items.length;
            processingResult.successCount += batchResult.successCount;
            processingResult.errorCount += batchResult.errorCount;
            processingResult.errors.push(...batchResult.errors);

            // Set up for next iteration
            lastEvaluatedKey = queryResult.lastEvaluatedKey;

            // Safety check to prevent infinite loops
            if (iterationCount >= maxIterations) {
                console.log(`Reached maximum iterations (${maxIterations}), stopping`);
                break;
            }

        } while (lastEvaluatedKey);

        // Log final results
        console.log('Hourly metering job completed', {
            totalProcessed: processingResult.totalProcessed,
            successCount: processingResult.successCount,
            errorCount: processingResult.errorCount,
            executionTimeUsed: context.getRemainingTimeInMillis(),
            iterations: iterationCount
        });

        // Log errors if any
        if (processingResult.errors.length > 0) {
            console.error('Errors encountered during processing:', processingResult.errors);
        }

    } catch (error) {
        console.error('Fatal error in hourly metering job:', error);

        // Re-throw to mark Lambda execution as failed
        throw error;
    }
};
