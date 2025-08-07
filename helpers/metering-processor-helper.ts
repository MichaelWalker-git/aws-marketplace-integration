
// Initialize AWS SDK clients outside the handler for connection reuse
import {MarketplaceMeteringClient, MeterUsageCommand, MeterUsageRequest} from "@aws-sdk/client-marketplace-metering";
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
    region: process.env.AWS_REGION,
    maxAttempts: 3,
    retryMode: 'adaptive'
});

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

// Environment variables
const DYNAMODB_TABLE_NAME = process.env.AWSMarketplaceMeteringRecordsTableName;
const PRODUCT_CODE = process.env.AWS_MARKETPLACE_PRODUCT_CODE;

// Constants
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

interface MeteringMessageBody {
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
function validateMeteringRecord(record: MeteringMessageBody): void {
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

/**
 * Sends usage record to AWS Marketplace Metering API with retries
 */
async function sendUsageRecord(
    record: MeteringMessageBody,
    retryCount = 0
): Promise<void> {
    try {
        // Create the metering request
        const meteringRequest: MeterUsageRequest = {
            ProductCode: PRODUCT_CODE!,
            Timestamp: new Date(record.timestamp),
            UsageDimension: record.dimension!,
            UsageQuantity: record.quantity!,
            DryRun: false, // Set to true for testing
            UsageAllocations: [
                {
                    AllocatedUsageQuantity: record.quantity!,
                    Tags: [
                        {
                            Key: 'CustomerIdentifier',
                            Value: record.customerIdentifier
                        }
                    ]
                }
            ]
        };

        console.log('Sending usage record to AWS Marketplace:', {
            customerIdentifier: record.customerIdentifier,
            dimension: record.dimension,
            quantity: record.quantity,
            timestamp: record.timestamp,
            productCode: PRODUCT_CODE
        });

        const command = new MeterUsageCommand(meteringRequest);
        const response = await meteringClient.send(command);

        console.log('Successfully sent usage record to AWS Marketplace:', {
            customerIdentifier: record.customerIdentifier,
            meteringRecordId: response.MeteringRecordId,
        });

    } catch (error: any) {
        // Handle specific AWS Marketplace errors
        if (error.name === 'ThrottlingException' && retryCount < MAX_RETRIES) {
            const delay = RETRY_DELAY_MS * Math.pow(2, retryCount);
            console.log(`Throttling detected, retrying in ${delay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);

            await new Promise(resolve => setTimeout(resolve, delay));
            return sendUsageRecord(record, retryCount + 1);
        }

        if (error.name === 'InvalidUsageDimensionException') {
            console.error('Invalid usage dimension:', record.dimension);
            throw new Error(`Invalid usage dimension: ${record.dimension}`);
        }

        if (error.name === 'InvalidProductCodeException') {
            console.error('Invalid product code:', PRODUCT_CODE);
            throw new Error(`Invalid product code: ${PRODUCT_CODE}`);
        }

        if (error.name === 'TimestampOutOfBoundsException') {
            console.error('Timestamp out of bounds:', record.timestamp);
            throw new Error(`Timestamp out of bounds: ${record.timestamp}`);
        }

        if (error.name === 'DuplicateRequestException') {
            // This is actually OK - AWS already processed this request
            console.warn('Duplicate request - AWS Marketplace already processed this usage record');
            return;
        }

        console.error('Error sending usage record to AWS Marketplace:', error);
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
        await sendUsageRecord(meteringRecord);

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
