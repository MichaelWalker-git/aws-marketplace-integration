import {DockerImage, NestedStack, RemovalPolicy, Stack, StackProps} from "aws-cdk-lib";
import {Construct} from "constructs";
import {Bucket} from "aws-cdk-lib/aws-s3";
import {
    CachePolicy,
    Distribution,
    SecurityPolicyProtocol,
    ViewerProtocolPolicy
} from "aws-cdk-lib/aws-cloudfront";
import {S3Origin} from "aws-cdk-lib/aws-cloudfront-origins";
import {execSync, ExecSyncOptions} from "child_process";
import {BucketDeployment, Source} from "aws-cdk-lib/aws-s3-deployment";
import * as fsExtra from 'fs-extra';
import {Runtime} from "aws-cdk-lib/aws-lambda";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {join} from "path";
import { getRegisterNewSubscriberLambdaRole} from "../helpers/iam-roles-helper";
import {CorsHttpMethod, HttpApi, HttpMethod} from "aws-cdk-lib/aws-apigatewayv2";
import {HttpLambdaIntegration} from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {AttributeType, BillingMode, StreamViewType, Table} from "aws-cdk-lib/aws-dynamodb";


export class SignupAppStack extends NestedStack {
    public readonly siteBucket: Bucket;
    public readonly distribution: Distribution;

    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        this.siteBucket = new Bucket(this, 'signupSiteBucket', {
            publicReadAccess: false,
            removalPolicy: RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
        });

        const subscribersTableName = 'SubscribersTable';

        const subscribersTable = new Table(this, "SubscribersTable", {
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

        const registerLambda = new NodejsFunction(this, "RegisterLambda", {
            runtime: Runtime.NODEJS_18_X,
            handler: "handler",
            functionName: "RegisterLambda",
            entry: registerLambdaFilePath,
            role,
            environment: {
                SUBSCRIBERS_TABLE: subscribersTableName
            }
        });

        // Set up API Gateway
        const httpApi = new HttpApi(this, "RegisterApi", {
            apiName: "RegisterApi",
            corsPreflight: {
                allowMethods: [
                    CorsHttpMethod.POST,
                ],
                allowOrigins: ["*"],
            },
        });

        const templateLambdaIntegration = new HttpLambdaIntegration('TemplateIntegration', registerLambda);

        httpApi.addRoutes({
            path: '/register',
            methods: [HttpMethod.POST],
            integration: templateLambdaIntegration,
        })


        this.distribution = new Distribution(this, 'CloudfrontDistribution', {
            enableLogging: true,
            minimumProtocolVersion: SecurityPolicyProtocol.TLS_V1_2_2021,
            defaultBehavior: {
                origin: new S3Origin(this.siteBucket),
                viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cachePolicy: CachePolicy.CACHING_DISABLED,
            },
            defaultRootObject: 'index.html',
        });

        const execOptions: ExecSyncOptions = { stdio: 'inherit' };

        const bundle = Source.asset('./client-app', {
            bundling: {
                command: [
                    'sh',
                    '-c',
                    'echo "Docker build not supported."',
                ],
                image: DockerImage.fromRegistry('alpine'),
                local: {
                    /* istanbul ignore next */
                    tryBundle(outputDir: string) {
                        execSync(
                            'cd client-app && yarn install && yarn build',
                            execOptions,
                        );

                        fsExtra.copySync('./client-app/dist', outputDir, {
                            ...execOptions,
                            // @ts-ignore
                            recursive: true,
                        });
                        return true;
                    },
                },
            },
        });

        const config = {
           apiUrl: httpApi.url,
        };

        new BucketDeployment(this, 'DeployBucket', {
            sources: [bundle, Source.jsonData('config.json', config)],
            destinationBucket: this.siteBucket,
            distribution: this.distribution,
            distributionPaths: ['/*'],
        });
    }
}
