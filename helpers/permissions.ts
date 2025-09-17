import { IAM } from "@aws-sdk/client-iam";

const crossAccountRoleName = 'UsageReportingRole';
const region = process.env.REGION || 'us-east-2';
const usageTableName = process.env.USAGE_TABLE;
const iam = new IAM({ region: region });

export async function grantCrossAccountAccess(customerAccountId: string, customerIdentifier: string): Promise<string> {
    const roleName = `${crossAccountRoleName}-${customerIdentifier}`;
    const roleArn = `arn:aws:iam::${process.env.AWS_ACCOUNT_ID}:role/${roleName}`;

    console.log('grantCrossAccountAccess roleArn: ', roleArn)
    console.log('grantCrossAccountAccess customerAccountId: ', customerAccountId)

    // Trust policy allowing the customer account to assume this role
    const trustPolicy = {
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Principal: {
                    AWS: `arn:aws:iam::${customerAccountId}:root`
                },
                Action: "sts:AssumeRole",
                Condition: {
                    StringEquals: {
                        "sts:ExternalId": customerIdentifier // Additional security
                    }
                }
            }
        ]
    };

    // Permission policy for DynamoDB usage table access
    const permissionPolicy = {
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Action: [
                    "dynamodb:PutItem",
                    "dynamodb:UpdateItem"
                ],
                Resource: `arn:aws:dynamodb:${region}:${process.env.AWS_ACCOUNT_ID}:table/${usageTableName}`,
                Condition: {
                    "ForAllValues:StringEquals": {
                        "dynamodb:Attributes": ["customerIdentifier", "timestamp", "usageQuantity", "dimension",
                            "metering_pending", "create_timestamp", "quantity", "ttl"]
                    }
                }
            }
        ]
    };

    try {
        // Create the cross-account role
        await iam.createRole({
            RoleName: roleName,
            AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
            Description: `Cross-account usage reporting role for customer ${customerIdentifier}`,
            Tags: [
                {Key: 'CustomerIdentifier', Value: customerIdentifier},
                {Key: 'CustomerAccountId', Value: customerAccountId},
                {Key: 'Purpose', Value: 'UsageReporting'}
            ]
        });

        console.log(`Created role: ${roleName}`);

        // Create and attach the permission policy
        const policyName = `${roleName}-Policy`;
        await iam.createPolicy({
            PolicyName: policyName,
            PolicyDocument: JSON.stringify(permissionPolicy),
            Description: `Usage reporting permissions for customer ${customerIdentifier}`
        });

        await iam.attachRolePolicy({
            RoleName: roleName,
            PolicyArn: `arn:aws:iam::${process.env.AWS_ACCOUNT_ID}:policy/${policyName}`
        });

        console.log(`Attached policy to role: ${roleName}`);

    } catch (error: any) {
        if (error.name === 'EntityAlreadyExistsException') {
            console.log(`Role ${roleName} already exists, skipping creation`);
        } else {
            console.error('Error creating cross-account role:', error);
            throw error;
        }
    }

    return roleArn;
}
