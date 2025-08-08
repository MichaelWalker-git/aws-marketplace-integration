import {NestedStack, RemovalPolicy, StackProps} from "aws-cdk-lib";
import {Construct} from "constructs";
import {Runtime} from "aws-cdk-lib/aws-lambda";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {join} from "path";
import { getRegisterNewSubscriberLambdaRole} from "../helpers/iam-roles-helper";
import {CorsHttpMethod, HttpApi, HttpMethod} from "aws-cdk-lib/aws-apigatewayv2";
import {HttpLambdaIntegration} from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {AttributeType, BillingMode, StreamViewType, Table} from "aws-cdk-lib/aws-dynamodb";
import {getResourceId} from "../helpers/common";

const region = process.env.REGION || 'us-east-1';

export class SignupAppStack extends NestedStack {
    public readonly httpApi: HttpApi;

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const subscribersTableName = process.env.SUBSCRIBERS_TABLE_NAME ||  getResourceId('SubscribersTable');

        const subscribersTable = new Table(this, subscribersTableName, {
            partitionKey: {
                name: "customerIdentifier",
                type: AttributeType.STRING,
            },
            removalPolicy: RemovalPolicy.DESTROY,
            stream: StreamViewType.NEW_AND_OLD_IMAGES,
            billingMode: BillingMode.PAY_PER_REQUEST,
            tableName: subscribersTableName,
        });

        const registerLambdaFilePath = join(__dirname, "..", "lambda", "register-new-subscriber.ts");

        const role = getRegisterNewSubscriberLambdaRole(this, subscribersTable);

        const registerLambda = new NodejsFunction(this, getResourceId("RegisterLambda"), {
            runtime: Runtime.NODEJS_18_X,
            handler: "handler",
            functionName: getResourceId("RegisterLambda"),
            entry: registerLambdaFilePath,
            role,
            bundling: {
                commandHooks: {
                    beforeBundling(inputDir: string, outputDir: string): string[] {
                        return [];
                    },
                    beforeInstall(inputDir: string, outputDir: string): string[] {
                        return [];
                    },
                    afterBundling(inputDir: string, outputDir: string): string[] {
                        return [
                            `cp ${inputDir}/installation-instructions.md ${outputDir}/installation-instructions.md`,
                        ];
                    },
                },
            },
            environment: {
                SUBSCRIBERS_TABLE: subscribersTableName,
                REGION: region,
                USAGE_TABLE: getResourceId("MeteringRecordsTable"),
                SENDER_EMAIL: process.env.SENDER_EMAIL || '',
                AWS_ACCOUNT_ID: process.env.AWS_ACCOUNT_ID || '',
            }
        });

        // Set up API Gateway
        const httpApi = new HttpApi(this, "RegisterApi", {
            apiName: "RegisterApi",
            corsPreflight: {
                allowMethods: [
                    CorsHttpMethod.POST, CorsHttpMethod.OPTIONS
                ],
                allowOrigins: ["*"],
                allowHeaders: [
                    'Content-Type',
                    'X-Amz-Date',
                    'Authorization',
                    'X-Api-Key',
                    'X-Amz-Security-Token',
                    'Domain-Name',
                ],
            },
        });

        const templateLambdaIntegration = new HttpLambdaIntegration(getResourceId("TemplateIntegration"), registerLambda);

        httpApi.addRoutes({
            path: '/register',
            methods: [HttpMethod.POST],
            integration: templateLambdaIntegration,
        })

        this.httpApi = httpApi;

    }
}
