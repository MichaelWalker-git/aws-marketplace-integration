#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SaasIntegrationStack } from '../lib/saas-integration-stack';
import {getResourceId} from "../helpers/common";

const app = new cdk.App();
new SaasIntegrationStack(app, getResourceId("MarketplaceIntegration"), {
    env: {
        region: 'us-east-2'
    }
});
