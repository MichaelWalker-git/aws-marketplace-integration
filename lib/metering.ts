import {Duration, NestedStack} from "aws-cdk-lib";
import {Construct} from "constructs";
import {AttributeType, BillingMode, ProjectionType, Table} from "aws-cdk-lib/aws-dynamodb";
import {Queue} from "aws-cdk-lib/aws-sqs";
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

export class MeteringStack extends NestedStack {

    constructor(scope: Construct, id: string) {
        super(scope, id);

        const meteringRecordsTableName = 'MeteringRecordsTable';

        const meteringRecordsTable = new Table(this, "MeteringRecordsTable", {
            tableName: meteringRecordsTableName,
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

        const sqsMeteringRecordsQueueName = 'MeteringRecordsQueue';

        const sqsMeteringRecordsQueue = new Queue(this, "MeteringRecordsQueue", {
            queueName: sqsMeteringRecordsQueueName,
            retentionPeriod: Duration.seconds(3000),
            fifo: true,
            contentBasedDeduplication: true
        })

        // Define the Lambda function
        const hourlyLambda = new lambda.Function(this, 'HourlyFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            code: lambda.Code.fromAsset('lambda/metering-hourly-job.ts'),
            handler: 'handler',
            environment: {
                SQSMeteringRecordsUrl: sqsMeteringRecordsQueue.queueUrl,
                AWSMarketplaceMeteringRecordsTableName: meteringRecordsTable.tableName,
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

        new events.Rule(this, 'Schedule', {
            schedule: events.Schedule.rate(Duration.hours(1)),
            targets: [new targets.LambdaFunction(hourlyLambda)],
            description: 'SaaS Metering',
            enabled: true,
        });

    }
}
