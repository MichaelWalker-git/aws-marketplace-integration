#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { SaasIntegrationStack } from '../lib/saas-integration-stack';

const app = new cdk.App();
new SaasIntegrationStack(app, 'SaasIntegrationStack');
