import {MarketplaceMeteringClient,     BatchMeterUsageCommand,
    UsageRecord,
    BatchMeterUsageRequest,} from "@aws-sdk/client-marketplace-metering";
import {DynamoDBClient} from "@aws-sdk/client-dynamodb";
import {DynamoDBDocumentClient, UpdateCommand} from "@aws-sdk/lib-dynamodb";
import {SQSRecord} from "aws-lambda";


export interface ProcessingResult {
    totalProcessed: number;
    successCount: number;
    errorCount: number;
    errors: Array<{
        messageId: string;
        error: string;
        customerIdentifier?: string;
    }>;
}

const meteringClient = new MarketplaceMeteringClient({
    region: process.env.REGION,
    maxAttempts: 3,
    retryMode: 'adaptive'
});

const dynamoDBClient = new DynamoDBClient({
    region: process.env.REGION,
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

// Environment variables
const DYNAMODB_TABLE_NAME = process.env.AWSMarketplaceMeteringRecordsTableName;
const PRODUCT_CODE = process.env.AWS_MARKETPLACE_PRODUCT_CODE;

// Constants
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export interface MeteringMessageBody {
    customerIdentifier: string;
    timestamp: number;
    dimension?: string;
    quantity?: number;
    originalRecord: {
        customerIdentifier: string;
        create_timestamp: number;
        metering_pending: string;
        dimension?: string;
        quantity?: number;
        [key: string]: any;
    };
}

export type EnrichedUsage = {
    key: string; // correlation key
    messageId: string;
    body: MeteringMessageBody;
    usage: UsageRecord;
};

/**
 * Validates required environment variables
 */
export function validateEnvironment(): void {
    if (!DYNAMODB_TABLE_NAME) {
        throw new Error('AWSMarketplaceMeteringRecordsTableName environment variable is required');
    }
    if (!PRODUCT_CODE) {
        throw new Error('AWS_MARKETPLACE_PRODUCT_CODE environment variable is required');
    }
}

/**
 * Parses SQS message body
 */
export function parseMessageBody(body: string): MeteringMessageBody {
    try {
        return JSON.parse(body);
    } catch (error) {
        throw new Error(`Invalid JSON in message body: ${error}`);
    }
}

/**
 * Validates metering record data
 */
export function validateMeteringRecord(record: MeteringMessageBody): void {
    if (!record.customerIdentifier) {
        throw new Error('customerIdentifier is required');
    }
    if (!record.timestamp) {
        throw new Error('timestamp is required');
    }
    if (!record.dimension) {
        throw new Error('dimension is required');
    }
    if (typeof record.quantity !== 'number' || record.quantity <= 0) {
        throw new Error('quantity must be a positive number');
    }
}

export function correlationKey(u: UsageRecord) {
    return `${u.CustomerIdentifier}::${u.Dimension}::${u.Timestamp?.toISOString()}`;
}

async function sendBatchUsageRecord(
    record: MeteringMessageBody,
    retryCount = 0
): Promise<void> {
    try {
        const usageRecord: UsageRecord = {
            CustomerIdentifier: record.customerIdentifier,
            Dimension: record.dimension!,
            Quantity: record.quantity,
            Timestamp: new Date(record.timestamp),
        };

        const batchRequest: BatchMeterUsageRequest = {
            ProductCode: PRODUCT_CODE!,
            UsageRecords: [usageRecord], // you can add up to 25
        };

        console.log("Sending batch usage to AWS Marketplace:", batchRequest);

        const command = new BatchMeterUsageCommand(batchRequest);
        const response = await meteringClient.send(command);

        if (response.Results?.length) {
            console.log("Batch metering result:", response.Results[0]);
        }

        if (response.UnprocessedRecords?.length) {
            console.warn("Unprocessed usage records:", response.UnprocessedRecords);
        }

    } catch (error: any) {
        console.error("Error sending batch usage:", error);

        // Retry logic if needed
        if (error.name === "ThrottlingException" && retryCount < MAX_RETRIES) {
            const delay = RETRY_DELAY_MS * Math.pow(2, retryCount);
            console.log(`Throttling detected, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return sendBatchUsageRecord(record, retryCount + 1);
        }

        throw error;
    }
}


/**
 * Updates the DynamoDB record to mark as processed or handles deletion
 */
async function updateMeteringRecord(
    record: MeteringMessageBody,
    success: boolean,
    errorMessage?: string
): Promise<void> {
    try {
        if (success) {
            // Option 1: Mark as processed (keeps audit trail)
            const updateCommand = new UpdateCommand({
                TableName: DYNAMODB_TABLE_NAME,
                Key: {
                    customerIdentifier: record.originalRecord.customerIdentifier,
                    create_timestamp: record.originalRecord.create_timestamp
                },
                UpdateExpression: 'SET metering_pending = :processed, processed_timestamp = :processedTime, #status = :status',
                ExpressionAttributeNames: {
                    '#status': 'status'
                },
                ExpressionAttributeValues: {
                    ':processed': 'false',
                    ':processedTime': Date.now(),
                    ':status': 'completed'
                },
                ConditionExpression: 'attribute_exists(customerIdentifier)'
            });

            await docClient.send(updateCommand);

            // Option 2: Delete the record (uncomment if you prefer this approach)
            /*
            const deleteCommand = new DeleteCommand({
                TableName: DYNAMODB_TABLE_NAME,
                Key: {
                    customerIdentifier: record.originalRecord.customerIdentifier,
                    create_timestamp: record.originalRecord.create_timestamp
                },
                ConditionExpression: 'attribute_exists(customerIdentifier)'
            });

            await docClient.send(deleteCommand);
            */

            console.log(`Successfully updated DynamoDB record for customer: ${record.customerIdentifier}`);
        } else {
            // Mark as failed for retry or manual investigation
            const updateCommand = new UpdateCommand({
                TableName: DYNAMODB_TABLE_NAME,
                Key: {
                    customerIdentifier: record.originalRecord.customerIdentifier,
                    create_timestamp: record.originalRecord.create_timestamp
                },
                UpdateExpression: 'SET #status = :status, error_message = :error, last_attempt = :lastAttempt ADD retry_count :inc',
                ExpressionAttributeNames: {
                    '#status': 'status'
                },
                ExpressionAttributeValues: {
                    ':status': 'failed',
                    ':error': errorMessage || 'Unknown error',
                    ':lastAttempt': Date.now(),
                    ':inc': 1
                },
                ConditionExpression: 'attribute_exists(customerIdentifier)'
            });

            await docClient.send(updateCommand);
            console.log(`Marked DynamoDB record as failed for customer: ${record.customerIdentifier}`);
        }
    } catch (error) {
        console.error('Error updating DynamoDB record:', error);
        // Don't throw here - we don't want to fail the entire Lambda because of DynamoDB issues
        // The metering was successful, which is the most important part
    }
}

/**
 * Processes a single SQS message
 */
export async function processMessage(sqsRecord: SQSRecord): Promise<{
    success: boolean;
    error?: string;
}> {
    try {
        console.log(`Processing message: ${sqsRecord.messageId}`);

        // Parse the message body
        const meteringRecord = parseMessageBody(sqsRecord.body);

        // Validate the record
        validateMeteringRecord(meteringRecord);

        // Send usage record to AWS Marketplace
        // await sendUsageRecord(meteringRecord);
        await sendBatchUsageRecord(meteringRecord);

        // Update the DynamoDB record
        await updateMeteringRecord(meteringRecord, true);

        console.log(`Successfully processed message: ${sqsRecord.messageId}`);
        return { success: true };

    } catch (error: any) {
        const errorMessage = `Failed to process message ${sqsRecord.messageId}: ${error.message || error}`;
        console.error(errorMessage, error);

        // Try to update DynamoDB with error info if we can parse the message
        try {
            const meteringRecord = parseMessageBody(sqsRecord.body);
            await updateMeteringRecord(meteringRecord, false, error.message || error.toString());
        } catch (parseError) {
            console.error('Could not parse message for error handling:', parseError);
        }

        return {
            success: false,
            error: errorMessage
        };
    }
}

export async function updateDdbFailure(record: MeteringMessageBody, errorMessage: string) {
    await dynamoDBClient.send(
        new UpdateCommand({
            TableName: DYNAMODB_TABLE_NAME,
            Key: {
                customerIdentifier: record.originalRecord.customerIdentifier,
                create_timestamp: record.originalRecord.create_timestamp,
            },
            UpdateExpression:
                'SET #status = :status, error_message = :err, last_attempt = :la ADD retry_count :inc',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':status': 'failed',
                ':err': errorMessage || 'Unknown error',
                ':la': Date.now(),
                ':inc': 1,
            },
            ConditionExpression: 'attribute_exists(customerIdentifier)',
        })
    );
}

export function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

async function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

export async function sendBatchWithRetry(usageRecords: UsageRecord[], attempt = 0) {
    try {
        const req: BatchMeterUsageRequest = { ProductCode: PRODUCT_CODE, UsageRecords: usageRecords };
        return await meteringClient.send(new BatchMeterUsageCommand(req));
    } catch (e: any) {
        if (e?.name === 'ThrottlingException' && attempt < MAX_RETRIES) {
            const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
            console.log(`Throttled (attempt ${attempt + 1}/${MAX_RETRIES}). Retrying in ${delay}ms`);
            await sleep(delay);
            return sendBatchWithRetry(usageRecords, attempt + 1);
        }
        throw e;
    }
}

export async function updateDdbSuccess(record: MeteringMessageBody) {
    await dynamoDBClient.send(
        new UpdateCommand({
            TableName: DYNAMODB_TABLE_NAME,
            Key: {
                customerIdentifier: record.originalRecord.customerIdentifier,
                create_timestamp: record.originalRecord.create_timestamp,
            },
            UpdateExpression:
                'SET metering_pending = :processed, processed_timestamp = :ts, #status = :status',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':processed': 'false',
                ':ts': Date.now(),
                ':status': 'completed',
            },
            ConditionExpression: 'attribute_exists(customerIdentifier)',
        })
    );
}
