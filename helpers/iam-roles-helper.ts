import {Construct} from "constructs";
import * as cdk from 'aws-cdk-lib';

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

export function addRolePolicies(role: cdk.aws_iam.Role, statements: cdk.aws_iam.PolicyStatementProps[]): cdk.aws_iam.Role {
    statements.forEach(props => {
        role.addToPolicy(new cdk.aws_iam.PolicyStatement(props));
    });
    return role;
}
