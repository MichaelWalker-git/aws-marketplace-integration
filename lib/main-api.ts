import {NestedStack, Stack, StackProps} from "aws-cdk-lib";
import {Construct} from "constructs";
import {join} from "path";
import {getRedirectLambdaRole} from "../helpers/iam-roles-helper";
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {Runtime} from "aws-cdk-lib/aws-lambda";
import {CorsHttpMethod, HttpApi, HttpMethod} from "aws-cdk-lib/aws-apigatewayv2";
import {HttpLambdaIntegration} from "aws-cdk-lib/aws-apigatewayv2-integrations";

interface MainApiStackProps extends StackProps {
    signupApiUrl: string
}

export class MainApiStack extends NestedStack {

    public readonly httpApi: HttpApi;

    constructor(scope: Construct, id: string, props: MainApiStackProps) {
        super(scope, id, props);
        const myLambdaFilePath = join(__dirname, "..", "lambda", "edge-redirect.ts");

        const role = getRedirectLambdaRole(this);

        const edgeRedirectLambda = new NodejsFunction(this, "EdgeRedirect", {
            runtime: Runtime.NODEJS_18_X,
            handler: "handler",
            functionName: "edge-redirect",
            entry: myLambdaFilePath,
            role,
            environment: {
                SIGNUP_API_URL: props.signupApiUrl,
            }
        });

        const httpApi = new HttpApi(this, "MainApi", {
            apiName: "MainApi",
            corsPreflight: {
                allowMethods: [
                    CorsHttpMethod.POST,
                ],
                allowOrigins: ["*"],
            },
        });

        const templateLambdaIntegration = new HttpLambdaIntegration('TemplateIntegration', edgeRedirectLambda);

        httpApi.addRoutes({
            path: '/',
            methods: [HttpMethod.POST],
            integration: templateLambdaIntegration,
        })

        this.httpApi = httpApi;
    };

}
