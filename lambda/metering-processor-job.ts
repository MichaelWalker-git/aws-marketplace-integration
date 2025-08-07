import { SQSEvent, SQSRecord, SQSHandler, Context } from 'aws-lambda';
import {
    validateEnvironment,
    parseMessageBody,
    ProcessingResult,
    processMessage
} from "../helpers/metering-processor-helper";

/**
 * Main handler function for SQS-triggered Lambda
 */
export const handler: SQSHandler = async (
    event: SQSEvent,
    context: Context
): Promise<void> => {
    console.log('Starting metering processor job', {
        requestId: context.awsRequestId,
        recordCount: event.Records.length,
        remainingTimeInMillis: context.getRemainingTimeInMillis()
    });

    try {
        // Validate environment variables
        validateEnvironment();

        const processingResult: ProcessingResult = {
            totalProcessed: 0,
            successCount: 0,
            errorCount: 0,
            errors: []
        };

        // Process each SQS record
        const processingPromises = event.Records.map(async (record) => {
            const result = await processMessage(record);

            processingResult.totalProcessed++;

            if (result.success) {
                processingResult.successCount++;
            } else {
                processingResult.errorCount++;

                // Try to extract customer identifier for error tracking
                let customerIdentifier: string | undefined;
                try {
                    const messageBody = parseMessageBody(record.body);
                    customerIdentifier = messageBody.customerIdentifier;
                } catch (e) {
                    // Ignore parsing errors here
                }

                processingResult.errors.push({
                    messageId: record.messageId,
                    error: result.error || 'Unknown error',
                    customerIdentifier
                });
            }
        });

        // Wait for all messages to be processed
        await Promise.allSettled(processingPromises);

        // Log final results
        console.log('Metering processor job completed', {
            totalProcessed: processingResult.totalProcessed,
            successCount: processingResult.successCount,
            errorCount: processingResult.errorCount,
            executionTimeUsed: context.getRemainingTimeInMillis()
        });

        // Log individual errors
        if (processingResult.errors.length > 0) {
            console.error('Processing errors:', processingResult.errors);
        }

        // For SQS processing, we typically don't throw here unless we want
        // all messages to go to DLQ. Individual message failures are handled
        // by the partial batch failure mechanism.

    } catch (error) {
        console.error('Fatal error in metering processor job:', error);

        // Re-throw to mark Lambda execution as failed
        throw error;
    }
};
