import {Context, ScheduledEvent, ScheduledHandler} from "aws-lambda";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand, BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

const BATCH_SIZE = 25;

interface MeteringRecord {
    customerIdentifier: string;
    create_timestamp: number;
    metering_pending: string;
    dimension?: string;
    quantity?: number;
    timestamp?: number;
}

// Initialize AWS SDK clients outside the handler for connection reuse
const dynamoDBClient = new DynamoDBClient({
    region: process.env.AWS_REGION,
    maxAttempts: 3,
    retryMode: 'adaptive'
});

const docClient = DynamoDBDocumentClient.from(dynamoDBClient, {
    marshallOptions: {
        convertEmptyValues: false,
        removeUndefinedValues: true,
        convertClassInstanceToMap: false,
    },
    unmarshallOptions: {
        wrapNumbers: false,
    },
});

const sqsClient = new SQSClient({
    region: process.env.AWS_REGION,
    maxAttempts: 3,
    retryMode: 'adaptive'
});

// Environment variables
const SQS_QUEUE_URL = process.env.SQSMeteringRecordsUrl;
const DYNAMODB_TABLE_NAME = process.env.AWSMarketplaceMeteringRecordsTableName;
const GSI_NAME = 'PendingMeteringRecordsIndex';

/**
 * Validates required environment variables
 */
export function validateEnvironment(): void {
    if (!SQS_QUEUE_URL) {
        throw new Error('SQSMeteringRecordsUrl environment variable is required');
    }
    if (!DYNAMODB_TABLE_NAME) {
        throw new Error('AWSMarketplaceMeteringRecordsTableName environment variable is required');
    }
}

/**
 * Queries DynamoDB for pending metering records using GSI
 */
export async function queryPendingMeteringRecords(exclusiveStartKey?: Record<string, any>): Promise<{
    items: MeteringRecord[];
    lastEvaluatedKey?: Record<string, any>;
}> {
    try {
        const command = new QueryCommand({
            TableName: DYNAMODB_TABLE_NAME,
            IndexName: GSI_NAME,
            KeyConditionExpression: 'metering_pending = :pending',
            ExpressionAttributeValues: {
                ':pending': 'true'
            },
            Limit: BATCH_SIZE,
            ExclusiveStartKey: exclusiveStartKey
        });

        const response = await docClient.send(command);

        return {
            items: (response.Items as MeteringRecord[]) || [],
            lastEvaluatedKey: response.LastEvaluatedKey
        };
    } catch (error) {
        console.error('Error querying DynamoDB:', error);
        throw new Error(`Failed to query pending metering records: ${error}`);
    }
}

/**
 * Updates records to mark them as processing to avoid duplicate processing
 */
async function markRecordsAsProcessing(records: MeteringRecord[]): Promise<void> {
    const updatePromises = records.map(async (record) => {
        try {
            const command = new UpdateCommand({
                TableName: DYNAMODB_TABLE_NAME,
                Key: {
                    customerIdentifier: record.customerIdentifier,
                    create_timestamp: record.create_timestamp
                },
                UpdateExpression: 'SET metering_pending = :processing, processing_started = :timestamp',
                ConditionExpression: 'metering_pending = :pending', // Only update if still pending
                ExpressionAttributeValues: {
                    ':processing': 'processing',
                    ':pending': 'true',
                    ':timestamp': Date.now()
                }
            });

            await docClient.send(command);
            console.log(`Marked record as processing for customer: ${record.customerIdentifier}, timestamp: ${record.create_timestamp}`);
        } catch (error: any) {
            if (error.name === 'ConditionalCheckFailedException') {
                console.log(`Record already being processed: ${record.customerIdentifier}-${record.create_timestamp}`);
                // This is OK - another process is already handling this record
                return;
            }
            console.error(`Failed to mark record as processing:`, error);
            throw error;
        }
    });

    // Use Promise.allSettled to continue even if some updates fail
    const results = await Promise.allSettled(updatePromises);

    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length > 0) {
        console.warn(`${failures.length} records failed to be marked as processing`);
    }
}

/**
 * Marks records as failed and resets them to pending for retry
 */
async function markRecordsAsFailed(records: MeteringRecord[], error: string): Promise<void> {
    const updatePromises = records.map(async (record) => {
        try {
            const command = new UpdateCommand({
                TableName: DYNAMODB_TABLE_NAME,
                Key: {
                    customerIdentifier: record.customerIdentifier,
                    create_timestamp: record.create_timestamp
                },
                UpdateExpression: 'SET metering_pending = :pending, #status = :failed, error_message = :error, last_failed = :timestamp ADD retry_count :inc',
                ExpressionAttributeNames: {
                    '#status': 'status'
                },
                ExpressionAttributeValues: {
                    ':pending': 'true', // Reset to pending for retry
                    ':failed': 'failed',
                    ':error': error,
                    ':timestamp': Date.now(),
                    ':inc': 1
                }
            });

            await docClient.send(command);
        } catch (updateError) {
            console.error(`Failed to mark record as failed:`, updateError);
        }
    });

    await Promise.allSettled(updatePromises);
}

/**
 * Sends a batch of metering records to SQS
 */
async function sendRecordsToSQS(records: MeteringRecord[]): Promise<void> {
    const promises = records.map(async (record, index) => {
        try {
            // Create message with deduplication ID for FIFO queue
            const messageBody = JSON.stringify({
                customerIdentifier: record.customerIdentifier,
                timestamp: record.create_timestamp,
                dimension: record.dimension,
                quantity: record.quantity,
                originalRecord: record
            });

            const command = new SendMessageCommand({
                QueueUrl: SQS_QUEUE_URL,
                MessageBody: messageBody,
                MessageGroupId: record.customerIdentifier, // Group by customer for FIFO
                MessageDeduplicationId: `${record.customerIdentifier}-${record.create_timestamp}-${Date.now()}`,
                MessageAttributes: {
                    customerIdentifier: {
                        DataType: 'String',
                        StringValue: record.customerIdentifier
                    },
                    recordType: {
                        DataType: 'String',
                        StringValue: 'metering'
                    }
                }
            });

            await sqsClient.send(command);
            console.log(`Successfully sent record ${index + 1} to SQS for customer: ${record.customerIdentifier}`);

        } catch (error) {
            console.error(`Failed to send record ${index + 1} to SQS:`, error);
            throw error;
        }
    });

    await Promise.all(promises);
}

/**
 * Processes a batch of metering records with proper status management
 */
export async function processBatch(records: MeteringRecord[]): Promise<{
    successCount: number;
    errorCount: number;
    errors: string[];
}> {
    const result = {
        successCount: 0,
        errorCount: 0,
        errors: [] as string[]
    };

    if (records.length === 0) {
        return result;
    }

    try {
        // Step 1: Mark records as processing to prevent duplicate processing
        console.log(`Marking ${records.length} records as processing...`);
        await markRecordsAsProcessing(records);

        // Step 2: Send to SQS
        console.log(`Sending ${records.length} records to SQS...`);
        await sendRecordsToSQS(records);

        // Step 3: If successful, the records are now in SQS queue
        // The processor Lambda will update their status when processed
        result.successCount = records.length;
        console.log(`Successfully processed batch of ${records.length} records`);

    } catch (error) {
        // Step 4: If failed, mark records as failed and reset to pending for retry
        console.error(`Batch processing failed:`, error);
        const errorMessage = `Failed to process batch: ${error}`;

        await markRecordsAsFailed(records, errorMessage);

        result.errorCount = records.length;
        result.errors.push(errorMessage);
    }

    return result;
}

/**
 * Cleanup function to reset stuck "processing" records back to "pending"
 * Run this periodically to handle cases where Lambda crashed during processing
 */
export async function cleanupStuckProcessingRecords(): Promise<void> {
    const PROCESSING_TIMEOUT = 30 * 60 * 1000; // 30 minutes
    const cutoffTime = Date.now() - PROCESSING_TIMEOUT;

    try {
        // Query for records stuck in processing state
        const command = new QueryCommand({
            TableName: DYNAMODB_TABLE_NAME,
            IndexName: GSI_NAME,
            KeyConditionExpression: 'metering_pending = :processing',
            FilterExpression: 'processing_started < :cutoff',
            ExpressionAttributeValues: {
                ':processing': 'processing',
                ':cutoff': cutoffTime
            }
        });

        const response = await docClient.send(command);
        const stuckRecords = response.Items as MeteringRecord[];

        if (stuckRecords && stuckRecords.length > 0) {
            console.log(`Found ${stuckRecords.length} stuck processing records, resetting to pending`);

            // Reset stuck records back to pending
            const resetPromises = stuckRecords.map(record => {
                return docClient.send(new UpdateCommand({
                    TableName: DYNAMODB_TABLE_NAME,
                    Key: {
                        customerIdentifier: record.customerIdentifier,
                        create_timestamp: record.create_timestamp
                    },
                    UpdateExpression: 'SET metering_pending = :pending, #status = :timeout REMOVE processing_started',
                    ExpressionAttributeNames: {
                        '#status': 'status'
                    },
                    ExpressionAttributeValues: {
                        ':pending': 'true',
                        ':timeout': 'timeout_reset'
                    }
                }));
            });

            await Promise.allSettled(resetPromises);
            console.log(`Reset ${stuckRecords.length} stuck records`);
        }
    } catch (error) {
        console.error('Error cleaning up stuck processing records:', error);
        // Don't throw - this is a cleanup operation
    }
}
