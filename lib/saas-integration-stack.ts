import {CfnOutput, Stack, StackProps} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {MainApiStack} from "./main-api";
import {SignupAppStack} from "./signup-app";
import {getResourceId} from "../helpers/common";

export class SaasIntegrationStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

   const signupApp = new SignupAppStack(this, getResourceId("SignupAppStack"))

    const mainApi = new MainApiStack(this, "SignupAppStack", {
      signupApiUrl: process.env.SIGNUP_API_URL || ''   });


    new CfnOutput(this, 'mainApi', {value: mainApi.httpApi.url || ''});

    new CfnOutput(this, 'signupApi', {value: signupApp.httpApi.url || ''});

  }
}
