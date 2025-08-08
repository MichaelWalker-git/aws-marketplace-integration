import {Duration, NestedStack} from "aws-cdk-lib";
import {Construct} from "constructs";
import {AttributeType, BillingMode, ProjectionType, Table} from "aws-cdk-lib/aws-dynamodb";
import {Queue} from "aws-cdk-lib/aws-sqs";
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import {SqsEventSource} from "aws-cdk-lib/aws-lambda-event-sources";
import {getResourceId} from "../helpers/common";
import {join} from "path";
import {
    getHourlyMeteringLambdaRole,
    getMeteringProcessorLambdaRole
} from "../helpers/iam-roles-helper";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {Runtime} from "aws-cdk-lib/aws-lambda";

const APP_NAME = process.env.APP_NAME || 'SaaS';

export class MeteringStack extends NestedStack {

    constructor(scope: Construct, id: string) {
        super(scope, id);

        const meteringRecordsTable = new Table(this, getResourceId("MeteringRecordsTable"), {
            tableName: getResourceId("MeteringRecordsTable"),
            partitionKey: {
                name: "customerIdentifier",
                type: AttributeType.STRING,
            },
            sortKey: {
                name: "create_timestamp",
                type: AttributeType.NUMBER,
            },
            billingMode: BillingMode.PAY_PER_REQUEST,

        })

        meteringRecordsTable.addGlobalSecondaryIndex({
            indexName: "PendingMeteringRecordsIndex",
            partitionKey: {
                name: "metering_pending",
                type: AttributeType.STRING
            },
            projectionType: ProjectionType.ALL,
        })

        const meteringRecordsDLQ = new Queue(this, `${APP_NAME}-MeteringRecordsDLQ`, {
            queueName: `${APP_NAME}-MeteringRecordsDLQ.fifo`,
            retentionPeriod: Duration.days(14), // Keep failed messages for 14 days
        });

        const sqsMeteringRecordsQueueName = `${APP_NAME}-MeteringRecordsQueue.fifo`;
        const sqsMeteringRecordsQueue = new Queue(this, sqsMeteringRecordsQueueName, {
            queueName: sqsMeteringRecordsQueueName,
            retentionPeriod: Duration.seconds(3000),
            fifo: true,
            contentBasedDeduplication: true,
            deadLetterQueue: {
                queue: meteringRecordsDLQ,
                maxReceiveCount: 3, // Retry 3 times before sending to DLQ
            },
            // Configure visibility timeout for processing time
            visibilityTimeout: Duration.minutes(5),
        })


        const hourlyLambdaFilePath = join(__dirname, "..", "lambda", "metering-hourly-job.ts");

        const hourlyLambdaRole = getHourlyMeteringLambdaRole(this, meteringRecordsTable, sqsMeteringRecordsQueue);

        const hourlyLambda = new NodejsFunction(this, getResourceId("HourlyFunction"), {
            runtime: Runtime.NODEJS_18_X,
            handler: "handler",
            functionName: getResourceId("HourlyFunction"),
            entry: hourlyLambdaFilePath,
            role: hourlyLambdaRole,
            timeout: Duration.minutes(5),
            environment: {
                SQSMeteringRecordsUrl: sqsMeteringRecordsQueue.queueUrl,
                AWSMarketplaceMeteringRecordsTableName: meteringRecordsTable.tableName,
                REGION: process.env.REGION || '',
            },
        });

        // Attach policies to the Lambda function
        hourlyLambda.addToRolePolicy(new iam.PolicyStatement({
            actions: ['dynamodb:Query', 'dynamodb:GetItem', 'dynamodb:Scan', 'dynamodb:BatchGetItem'],
            resources: [meteringRecordsTable.tableArn],
        }));
        hourlyLambda.addToRolePolicy(new iam.PolicyStatement({
            actions: ['sqs:SendMessage'],
            resources: [sqsMeteringRecordsQueue.queueArn],
        }));

        const processorLambdaFilePath = join(__dirname, "..", "lambda", "metering-processor-job.ts");

        const processorLambdaRole = getMeteringProcessorLambdaRole(this, meteringRecordsTable, sqsMeteringRecordsQueue, meteringRecordsDLQ);

        const processorLambda = new NodejsFunction(this, getResourceId("ProcessorFunction"), {
            runtime: Runtime.NODEJS_18_X,
            handler: "handler",
            functionName: getResourceId("ProcessorFunction"),
            entry: processorLambdaFilePath,
            role: processorLambdaRole,
            timeout: Duration.minutes(5),
            environment: {
                AWSMarketplaceMeteringRecordsTableName: meteringRecordsTable.tableName,
                AWS_MARKETPLACE_PRODUCT_CODE: process.env.AWS_MARKETPLACE_PRODUCT_CODE || '',
                REGION: process.env.REGION || '',
            },
            reservedConcurrentExecutions: 10,
        });

        // AWS Marketplace Metering permissions
        processorLambda.addToRolePolicy(new iam.PolicyStatement({
            actions: [
                'aws-marketplace:MeterUsage'
            ],
            resources: ['*'], // AWS Marketplace API requires * resource
        }));

        // Connect SQS to processor Lambda
        processorLambda.addEventSource(new SqsEventSource(sqsMeteringRecordsQueue, {
            batchSize: 10, // Process up to 10 messages at once
            reportBatchItemFailures: true, // Enable partial batch failure handling
        }));


        new events.Rule(this, 'Schedule', {
            // TODO decreased for test
            // schedule: events.Schedule.rate(Duration.hours(1)),
            schedule: events.Schedule.rate(Duration.minutes(3)),
            targets: [new targets.LambdaFunction(hourlyLambda)],
            description: 'SaaS Metering',
            enabled: true,
        });

    }
}
