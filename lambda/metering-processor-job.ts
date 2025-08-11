import { SQSEvent, SQSHandler, Context } from 'aws-lambda';
import {
    parseMessageBody,
    EnrichedUsage,
    validateMeteringRecord,
    correlationKey,
    MeteringMessageBody,
    updateDdbFailure,
    chunk,
    sendBatchWithRetry, updateDdbSuccess
} from "../helpers/metering-processor-helper";
import {UsageRecord} from "@aws-sdk/client-marketplace-metering";

const MAX_BATCH = 25;
const RETRY_DELAY_MS = 1000;
const MAX_RETRIES = 3;

/**
 * Main handler function for SQS-triggered Lambda
 */
export const handler: SQSHandler = async (event: SQSEvent, context: Context): Promise<void> => {
    console.log('Starting metering processor job', {
        requestId: context.awsRequestId,
        recordCount: event.Records.length,
        remainingTimeInMillis: context.getRemainingTimeInMillis(),
    });

    // 1) Parse & validate all messages up-front, building a single usage payload
    const enriched: EnrichedUsage[] = [];
    const preValidationErrors: Array<{ messageId: string; error: string }> = [];

    for (const rec of event.Records) {
        try {
            const body = parseMessageBody(rec.body);
            validateMeteringRecord(body);
            const usage: UsageRecord = {
                CustomerIdentifier: body.customerIdentifier,
                Dimension: body.dimension!,
                Quantity: body.quantity,
                Timestamp: new Date(body.timestamp),
            };
            enriched.push({key: correlationKey(usage), messageId: rec.messageId, body, usage});
        } catch (err: any) {
            preValidationErrors.push({messageId: rec.messageId, error: err?.message || String(err)});
        }
    }

    // Mark validation failures in Dynamo and continue
    for (const e of preValidationErrors) {
        try {
            const body: MeteringMessageBody = JSON.parse(
                event.Records.find((r) => r.messageId === e.messageId)!.body
            );
            await updateDdbFailure(body, e.error);
        } catch {
            // if we can't parse / update, just log
            console.error(`Could not update DDB for pre-validation failure: ${e.messageId}`, e);
        }
    }

    if (enriched.length === 0) {
        console.log('No valid usage records to send. Exiting.');
        return;
    }

    // 2) Send in one go (chunked to API limit 25) instead of per-message
    const chunks = chunk(enriched, MAX_BATCH);

    let totalSuccess = 0;
    let totalFailed = 0;

    for (const group of chunks) {
        console.log(`Sending batch of ${group.length} usage records to AWS Marketplace`);
        const resp = await sendBatchWithRetry(group.map((g) => g.usage));

        console.log('Batch response:', resp);

        // Build failure map from UnprocessedRecords
        const failures = new Map<string, { code?: string; message?: string }>();
        if (resp.UnprocessedRecords?.length) {
            for (const f of resp.UnprocessedRecords as any[]) {
                if (f.UsageRecord) {
                    const key = correlationKey(f.UsageRecord);
                    failures.set(key, { code: f.ErrorCode, message: f.ErrorMessage });
                } else {
                    console.warn("Unprocessed record without UsageRecord:", f);
                }
            }
            console.warn('Unprocessed usage records:', resp.UnprocessedRecords);
        }

        // Update DDB per record based on success/failure
        for (const item of group) {
            const fail = failures.get(item.key);
            try {
                if (fail) {
                    totalFailed++;
                    await updateDdbFailure(
                        item.body,
                        `${fail.code ?? 'Error'}: ${fail.message ?? 'Unprocessed'}`
                    );
                } else {
                    totalSuccess++;
                    await updateDdbSuccess(item.body);
                }
            } catch (e) {
                // do not throw—preserve marketplace result; just log DDB issues
                console.error('DynamoDB update error:', {
                    messageId: item.messageId,
                    error: (e as any)?.message || String(e),
                });
            }
        }

        // Optional: surface Results for debugging
        if (resp.Results?.length) {
            console.log('Batch results (sample):', resp.Results.slice(0, 3));
        }
    }

    console.log('Metering processor job completed', {
        totalParsed: event.Records.length,
        validSent: enriched.length,
        validationErrors: preValidationErrors.length,
        successCount: totalSuccess,
        failedCount: totalFailed,
        executionTimeRemaining: context.getRemainingTimeInMillis(),
    });
}
