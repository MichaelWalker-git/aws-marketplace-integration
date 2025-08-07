import {Construct} from "constructs";
import * as cdk from 'aws-cdk-lib';
import {Table} from "aws-cdk-lib/aws-dynamodb";
import {Queue} from "aws-cdk-lib/aws-sqs";

export function createIAMRoleWithBasicExecutionPolicy(
    cdkStack: Construct,
    roleId: string,
    roleDescription: string,
): cdk.aws_iam.Role {
    const role = new cdk.aws_iam.Role(
        cdkStack,
        roleId,
        {
            description: roleDescription,
            assumedBy: new cdk.aws_iam.ServicePrincipal('lambda.amazonaws.com'),
        },
    );

    role.addManagedPolicy(
        cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName(
            'service-role/AWSLambdaBasicExecutionRole',
        ),
    );

    return role;
}

export function getRedirectLambdaRole(scope: Construct) {
    const role = createIAMRoleWithBasicExecutionPolicy(scope, 'RedirectLambdaRole', 'Role used by the redirect function');
    addRolePolicies(role, [
        {
            actions: [
                "ec2:DescribeInstances",
                "ec2:CreateNetworkInterface",
                "ec2:AttachNetworkInterface",
                "ec2:DescribeNetworkInterfaces",
                "autoscaling:CompleteLifecycleAction",
                "ec2:DeleteNetworkInterface"
            ],
            resources: ["*"]
        },
        {
            actions: [
                "aws-marketplace:Unsubscribe",
                "aws-marketplace:ViewSubscriptions",
                "aws-marketplace:Subscribe"
            ],
            resources: ["*"]
        }
    ]);
    return role;
}

export function getRegisterNewSubscriberLambdaRole(scope: Construct, table: Table,) {
    const role = createIAMRoleWithBasicExecutionPolicy(scope, 'RegisterNewSubscriberLambdaRole', 'Role used by the register-new-subscriber function');
    addRolePolicies(role, [
        {
            actions: [
                "ec2:DescribeInstances",
                "ec2:CreateNetworkInterface",
                "ec2:AttachNetworkInterface",
                "ec2:DescribeNetworkInterfaces",
                "autoscaling:CompleteLifecycleAction",
                "ec2:DeleteNetworkInterface"
            ],
            resources: ["*"]
        },
        {
            actions: [
                "aws-marketplace:Unsubscribe",
                "aws-marketplace:ViewSubscriptions",
                "aws-marketplace:Subscribe",
                "aws-marketplace:ResolveCustomer",
                "aws-marketplace:BatchMeterUsage",
                "aws-marketplace:GetEntitlements"

            ],
            resources: ["*"]
        },
        {
            actions: ['dynamodb:PutItem', 'dynamodb:Query', 'dynamodb:GetItem', 'dynamodb:UpdateItem'],
            resources: [table.tableArn],
        },
    ]);
    return role;
}

/**
 * Creates IAM role for the hourly metering collection Lambda
 * This Lambda queries DynamoDB for pending records and sends them to SQS
 */
export function getHourlyMeteringLambdaRole(
    scope: Construct,
    meteringTable: Table,
    meteringQueue: Queue
) {
    const role = createIAMRoleWithBasicExecutionPolicy(
        scope,
        'HourlyMeteringLambdaRole',
        'Role used by the hourly metering collection Lambda function'
    );

    addRolePolicies(role, [
        // DynamoDB permissions for reading metering records
        {
            actions: [
                'dynamodb:Query',
                'dynamodb:GetItem',
                'dynamodb:Scan',
                'dynamodb:BatchGetItem'
            ],
            resources: [
                meteringTable.tableArn,
                `${meteringTable.tableArn}/index/*`, // Allow GSI access
            ],
        },
        // SQS permissions for sending messages to the metering queue
        {
            actions: [
                'sqs:SendMessage',
                'sqs:GetQueueAttributes'
            ],
            resources: [meteringQueue.queueArn],
        },
        // CloudWatch permissions for enhanced monitoring (optional but recommended)
        {
            actions: [
                'cloudwatch:PutMetricData'
            ],
            resources: ['*'],
        },
        // X-Ray tracing permissions (if tracing is enabled)
        {
            actions: [
                'xray:PutTraceSegments',
                'xray:PutTelemetryRecords'
            ],
            resources: ['*'],
        }
    ]);

    return role;
}

/**
 * Creates IAM role for the metering processor Lambda
 * This Lambda processes SQS messages and sends usage reports to AWS Marketplace
 */
export function getMeteringProcessorLambdaRole(
    scope: Construct,
    meteringTable: Table,
    meteringQueue: Queue,
    meteringDLQ: Queue
) {
    const role = createIAMRoleWithBasicExecutionPolicy(
        scope,
        'MeteringProcessorLambdaRole',
        'Role used by the metering processor Lambda function'
    );

    addRolePolicies(role, [
        // DynamoDB permissions for updating processed records
        {
            actions: [
                'dynamodb:UpdateItem',
                'dynamodb:DeleteItem',
                'dynamodb:GetItem'
            ],
            resources: [meteringTable.tableArn],
        },
        // SQS permissions for processing messages
        {
            actions: [
                'sqs:ReceiveMessage',
                'sqs:DeleteMessage',
                'sqs:GetQueueAttributes'
            ],
            resources: [meteringQueue.queueArn, meteringDLQ.queueArn],
        },
        // AWS Marketplace Metering API permissions
        {
            actions: [
                'aws-marketplace:MeterUsage',
                'aws-marketplace:BatchMeterUsage',
                'aws-marketplace:ResolveCustomer'
            ],
            resources: ['*'], // AWS Marketplace API requires * resource
        },
        // CloudWatch permissions for enhanced monitoring
        {
            actions: [
                'cloudwatch:PutMetricData'
            ],
            resources: ['*'],
        },
    ]);

    return role;
}

export function addRolePolicies(role: cdk.aws_iam.Role, statements: cdk.aws_iam.PolicyStatementProps[]): cdk.aws_iam.Role {
    statements.forEach(props => {
        role.addToPolicy(new cdk.aws_iam.PolicyStatement(props));
    });
    return role;
}
