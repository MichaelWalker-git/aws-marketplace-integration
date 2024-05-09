import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";
import {Runtime} from "aws-cdk-lib/aws-lambda";
import { join } from 'path';
import {CorsHttpMethod, HttpApi, HttpMethod} from "aws-cdk-lib/aws-apigatewayv2";
import {HttpLambdaIntegration} from "aws-cdk-lib/aws-apigatewayv2-integrations";
import {getRedirectLambdaRole} from "../helpers/iam-roles-helper";

export class SaasIntegrationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const myLambdaFilePath = join(__dirname, "..", "lambda", "edge-redirect.ts");

   const role = getRedirectLambdaRole(this);

    const edgeRedirectLambda = new NodejsFunction(this, "EdgeRedirect", {
      runtime: Runtime.NODEJS_18_X,
      handler: "handler",
      functionName: "edge-redirect",
      entry: myLambdaFilePath,
      role
    });

    const httpApi = new HttpApi(this, "MainApi", {
      apiName: "My API",
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
  };
}
