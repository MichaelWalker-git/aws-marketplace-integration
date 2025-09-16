# AWS Marketplace AI Document Processor - Deployment Guide

## 📋 Quick Navigation
1. [Prerequisites](#prerequisites)
2. [Setup](#setup)
3. [Configuration](#configuration)
4. [Deployment](#deployment)
5. [Verification](#verification)
6. [Troubleshooting](#troubleshooting)

---

## 🎯 Prerequisites

### Required Software
- **Node.js** 18+ ([Download](https://nodejs.org/))
- **AWS CLI** ([Install](https://aws.amazon.com/cli/))
- **AWS CDK v2**: `npm install -g aws-cdk`
- **Git** for version control

### Required Accounts
- **AWS Account** with admin permissions
- **Hugging Face Token** ([Get Token](https://huggingface.co/settings/tokens))
- **NPM Token** if using private packages

---

## 🚀 Setup

### Step 1: Configure AWS

```bash
# Configure AWS credentials
aws configure

# Verify and export account info
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
export CDK_DEFAULT_REGION=us-east-1

# Bootstrap CDK (first time only)
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION
```

### Step 2: Create Project

```bash
# Create and enter project directory
mkdir ai-document-processor && cd ai-document-processor

# Initialize CDK project
cdk init app --language=typescript

# Install dependencies
npm config set //registry.npmjs.org/:_authToken {{NPM_AUTH_TOKEN}}
npm install -S @miketran/ai-document-processor-cdk dotenv

# Create assets folder
mkdir -p assets && touch assets/.gitkeep
```

---

## ⚙️ Configuration

### Step 1: Create `.env` File

```bash
cat > .env << 'EOF'
# AWS Configuration (Required)
CDK_DEFAULT_ACCOUNT={{CUSTOMER_ACCOUNT_ID}}
CDK_DEFAULT_REGION=us-east-1

# Marketplace Integration (Required - Get from AWS Marketplace)
CUSTOMER_IDENTIFIER={{CUSTOMER_IDENTIFIER}}
CROSS_ACCOUNT_ROLE_ARN={{CROSS_ACCOUNT_ROLE_ARN}}
EXTERNAL_ID={{EXTERNAL_ID}}
REPORTS_TABLE_NAME={{REPORTS_TABLE_NAME}}

# Application Settings
APP_NAME=ai-document-processor
APP_LABEL=AiDocProcessor
APP_REGION=eu-central-1
COMPLIANCE_FRAMEWORK=hipaa

# Admin Configuration
ADMIN_EMAIL=admin@yourcompany.com
ADMIN_FAMILY_NAME=Admin
ADMIN_GIVEN_NAME=Super

# External Services
HUGGINGFACE_HUB_TOKEN={{HUGGINGFACE_HUB_TOKEN}}

# Frontend & Vendor
CLIENT_URL=http://localhost:5173/
VENDOR_NAME=Horustech
STAGE=prod
EOF
```

### Step 2: Update `bin/app.ts`

Replace the entire contents with:

```typescript
#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import {config} from 'dotenv';

// Load environment variables from .env file
config();

import {STAGES, Labels, KmsStack, S3Stack, BackendAppStack, FrontendStack} from '@miketran/ai-document-processor-cdk';

// AWS Account Configuration
const CDK_DEFAULT_REGION = process.env.CDK_DEFAULT_REGION || 'us-east-1';
const CDK_DEFAULT_ACCOUNT = process.env.CDK_DEFAULT_ACCOUNT || '';

if (!CDK_DEFAULT_ACCOUNT) {
    throw new Error('CDK_DEFAULT_ACCOUNT is required. Please set it in your .env file');
}

// Application Configuration
const APP_NAME = process.env.APP_NAME || 'ai-document-processor';
const APP_LABEL = process.env.APP_LABEL || 'AiDocProcessor';
const APP_REGION = process.env.APP_REGION || 'eu-central-1';

// Compliance Configuration
const COMPLIANCE_FRAMEWORK = process.env.COMPLIANCE_FRAMEWORK || 'hipaa';

// Admin Configuration
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_FAMILY_NAME = process.env.ADMIN_FAMILY_NAME || 'Admin';
const ADMIN_GIVEN_NAME = process.env.ADMIN_GIVEN_NAME || 'Super';
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173/';

// External Services
const HUGGINGFACE_HUB_TOKEN = process.env.HUGGINGFACE_HUB_TOKEN || '';

if (!HUGGINGFACE_HUB_TOKEN) {
    console.warn('WARNING: HUGGINGFACE_HUB_TOKEN is not set. Model access may fail.');
}

// Marketplace Configuration
const VENDOR_NAME = process.env.VENDOR_NAME || 'Horustech';
const TARGET_REGION = process.env.TARGET_REGION || '';
const REPORTS_TABLE_NAME = process.env.REPORTS_TABLE_NAME || '';
const CROSS_ACCOUNT_ROLE_ARN = process.env.CROSS_ACCOUNT_ROLE_ARN || '';
const EXTERNAL_ID = process.env.EXTERNAL_ID || '';
const CUSTOMER_IDENTIFIER = process.env.CUSTOMER_IDENTIFIER || '';

// Create CDK App
const app = new cdk.App();

// Create Labels for resource naming
const labels = new Labels(
    APP_LABEL,
    STAGES.prod,
    APP_REGION,
    APP_NAME,
    'marketplace',
    '-',
);

const args = {
    labels,
    complianceFramework: COMPLIANCE_FRAMEWORK,
    description: 'AI Document Processing Platform - Marketplace Edition',
    adminEmail: ADMIN_EMAIL,
    adminFamilyName: ADMIN_FAMILY_NAME,
    adminGivenName: ADMIN_GIVEN_NAME,
    clientUrl: CLIENT_URL,
    vendorName: VENDOR_NAME,
    huggingfaceHubToken: HUGGINGFACE_HUB_TOKEN,
    targetRegion: TARGET_REGION,
    reportsTableName: REPORTS_TABLE_NAME,
    crossAccountRoleArn: CROSS_ACCOUNT_ROLE_ARN,
    externalId: EXTERNAL_ID,
    customerIdentifier: CUSTOMER_IDENTIFIER,
    env: {region: CDK_DEFAULT_REGION, account: CDK_DEFAULT_ACCOUNT},
}

// KMS Stack - Enhanced for marketplace with customer-managed keys
const kmsStack = new KmsStack(app, 'Kms-Stack', {
    labels: labels,
});

// S3 Stack
const s3Stack = new S3Stack(
    app,
    `${labels.name()}-s3`,
    args,
);
s3Stack.addDependency(kmsStack);

// Backend App Stack
const backendAppStack = new BackendAppStack(
    app,
    `${labels.name()}-backend-app`,
    args,
    {
        env: {region: CDK_DEFAULT_REGION},
        description: 'AI-powered document processing platform with SageMaker integration - Marketplace Edition',
    },
);
backendAppStack.addDependency(s3Stack);
backendAppStack.addDependency(kmsStack);

// Frontend Stack
const frontendStack = new FrontendStack(app, `${labels.name()}-FrontEnd-Stack`, args);
frontendStack.addDependency(backendAppStack);

app.synth();
```

### Step 3: Add `.env` to `.gitignore`

```bash
echo ".env" >> .gitignore
```

---

## 🚢 Deployment

### Deploy All Stacks

```bash
# Synthesize to verify configuration
npx cdk synth

# Review changes
npx cdk diff

# Deploy all stacks (20-30 minutes)
npx cdk deploy --all --require-approval never --outputs-file outputs.json
```

The deployment creates these stacks in order:
1. **Kms-Stack** - Encryption keys
2. **S3 Stack** - Storage buckets
3. **Backend App Stack** - API, Cognito, SageMaker
4. **Frontend Stack** - CloudFront distribution

---

## ✅ Verification

### Check Stack Outputs

```bash
# View all outputs
cat outputs.json | jq '.'

# Get specific stack outputs
aws cloudformation describe-stacks \
  --stack-name AiDocProcessor-prod-eu-central-1-backend-app \
  --query 'Stacks[0].Outputs' \
  --output table
```

### Key Outputs to Note:
- **API Endpoint URL**
- **Cognito User Pool ID & Client ID**
- **S3 Bucket Names**
- **CloudFront Distribution URL**

### Test the Application

1. Navigate to CloudFront URL (from outputs)
2. Sign up/sign in via Cognito
3. Upload a test document
4. Verify processing completes

---

## 🐛 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| **No AWS credentials** | Run `aws configure` |
| **Stack already exists** | `npx cdk destroy --all` then redeploy |
| **SageMaker fails** | Check HuggingFace token & ml.g5.2xlarge quota |
| **Frontend build fails** | Ensure `../client-app` exists with valid build |
| **CDK bootstrap needed** | `npx cdk bootstrap aws://ACCOUNT/REGION` |

### Debug Commands

```bash
# Enable debug mode
export CDK_DEBUG=true

# View CloudFormation events
aws cloudformation describe-stack-events --stack-name STACK_NAME

# Check SageMaker endpoint
aws sagemaker describe-endpoint --endpoint-name ENDPOINT_NAME

# View Lambda logs
aws logs tail /aws/lambda/FUNCTION_NAME --follow
```

---

## 🔐 Security Best Practices

- Never commit `.env` to version control
- Use AWS Secrets Manager for production
- Enable MFA for admin users
- Rotate tokens regularly
- Monitor CloudTrail logs

---

## 📚 Resources

- [AWS CDK Docs](https://docs.aws.amazon.com/cdk/)
- [AWS Marketplace Guide](https://docs.aws.amazon.com/marketplace/)
- [SageMaker Async Inference](https://docs.aws.amazon.com/sagemaker/latest/dg/async-inference.html)

---

**Support**: Open issues on GitHub | Contact AWS Marketplace support | Check CloudWatch logs
