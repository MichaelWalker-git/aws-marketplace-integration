# AWS Marketplace AI Document Processor - Complete Deployment Guide

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Project Creation](#project-creation)
4. [Configuration](#configuration)
5. [Deployment](#deployment)
6. [Post-Deployment](#post-deployment)
7. [Troubleshooting](#troubleshooting)

---

## 🎯 Prerequisites

Before you begin, ensure you have the following:

### Required Software
- **Node.js** 18+ ([Download](https://nodejs.org/))
- **AWS CLI** ([Installation Guide](https://aws.amazon.com/cli/))
- **AWS CDK v2**
  ```bash
  npm install -g aws-cdk
  ```
- **Git** (for version control)

### Required Accounts & Access
- **AWS Account** with appropriate permissions
- **Hugging Face Account** with API token ([Get Token](https://huggingface.co/settings/tokens))
- **NPM Account** with auth token (if using private packages)

### AWS Permissions
Ensure your AWS IAM user/role has permissions for:
- CloudFormation
- S3
- Lambda
- API Gateway
- Cognito
- SageMaker
- DynamoDB
- KMS
- VPC
- SQS
- CloudFront
- IAM (for service roles)

---

## 🚀 Initial Setup

### Step 1: Configure AWS Credentials

```bash
# Configure AWS CLI with your credentials
aws configure

# Verify configuration
aws sts get-caller-identity
```

### Step 2: Get Your AWS Account Information

```bash
# Get your AWS account ID
export CDK_DEFAULT_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo "Your AWS Account ID: $CDK_DEFAULT_ACCOUNT"

# Set your preferred region
export CDK_DEFAULT_REGION=us-east-1
echo "Your AWS Region: $CDK_DEFAULT_REGION"
```

### Step 3: Bootstrap CDK (First-time setup)

```bash
# Bootstrap CDK in your account/region
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION
```

---

## 📁 Project Creation

### Option A: Starting from Scratch (New Project)

#### Step 1: Create New CDK Project

```bash
# Create project directory
mkdir ai-document-processor-marketplace
cd ai-document-processor-marketplace

# Initialize CDK TypeScript project
cdk init app --language=typescript

# Install the AI Document Processor package
npm config set //registry.npmjs.org/:_authToken {{NPM_AUTH_TOKEN}}
npm install -S @miketran/ai-document-processor-cdk

# Install additional dependencies
npm install dotenv
```

#### Step 2: Create Environment Configuration File

Create a `.env` file in your project root:

```bash
cat > .env << 'EOF'
# ============================================
# AWS CONFIGURATION (Required)
# ============================================
CDK_DEFAULT_ACCOUNT=YOUR_ACCOUNT_ID_HERE
CDK_DEFAULT_REGION=us-east-1

# ============================================
# MARKETPLACE INTEGRATION (DO NOT MODIFY)
# These values are provided by AWS Marketplace
# ============================================
CUSTOMER_IDENTIFIER=YOUR_CUSTOMER_ID_HERE
CROSS_ACCOUNT_ROLE_ARN=arn:aws:iam::ACCOUNT:role/ROLE_NAME
EXTERNAL_ID=YOUR_EXTERNAL_ID_HERE
REPORTS_TABLE_NAME=YOUR_REPORTS_TABLE_HERE
TARGET_REGION=YOUR_TARGET_REGION_HERE

# ============================================
# APPLICATION CONFIGURATION (Customizable)
# ============================================
APP_NAME=ai-document-processor
APP_LABEL=AiDocProcessor
APP_REGION=eu-central-1

# Compliance: hipaa | nist | pci | all
COMPLIANCE_FRAMEWORK=hipaa

# Admin user configuration
ADMIN_EMAIL=admin@yourcompany.com
ADMIN_FAMILY_NAME=Admin
ADMIN_GIVEN_NAME=Super

# Frontend URL (update after deployment or use localhost for development)
CLIENT_URL=http://localhost:5173/

# Hugging Face token (required for model access)
HUGGINGFACE_HUB_TOKEN=YOUR_HF_TOKEN_HERE

# Vendor information
VENDOR_NAME=Horustech
EOF
```

#### Step 3: Update CDK Application Entry Point

Replace the contents of `bin/app.ts`:

```typescript
#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

import { STAGES, Labels, ProdStage } from '@miketran/ai-document-processor-cdk';

// AWS Account Configuration
const CDK_DEFAULT_REGION  = process.env.CDK_DEFAULT_REGION  || 'us-east-1';
const CDK_DEFAULT_ACCOUNT = process.env.CDK_DEFAULT_ACCOUNT || '';

if (!CDK_DEFAULT_ACCOUNT) {
  throw new Error('CDK_DEFAULT_ACCOUNT is required. Please set it in your .env file');
}

// Application Configuration
const APP_NAME   = process.env.APP_NAME   || 'ai-document-processor';
const APP_LABEL  = process.env.APP_LABEL  || 'AiDocProcessor';
const APP_REGION = process.env.APP_REGION || 'eu-central-1';

// Compliance Configuration
const COMPLIANCE_FRAMEWORK = process.env.COMPLIANCE_FRAMEWORK || 'hipaa';

// Admin Configuration
const ADMIN_EMAIL       = process.env.ADMIN_EMAIL       || 'admin@example.com';
const ADMIN_FAMILY_NAME = process.env.ADMIN_FAMILY_NAME || 'Admin';
const ADMIN_GIVEN_NAME  = process.env.ADMIN_GIVEN_NAME  || 'Super';
const CLIENT_URL        = process.env.CLIENT_URL        || 'http://localhost:5173/';

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

// Deploy Production Stage
new ProdStage(
  app,
  STAGES.prod,
  {
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
    env: { region: CDK_DEFAULT_REGION, account: CDK_DEFAULT_ACCOUNT },
  },
  { env: { region: CDK_DEFAULT_REGION, account: CDK_DEFAULT_ACCOUNT } },
);

app.synth();
```

### Option B: Using Existing CDK Project

If you already have a CDK project, follow these steps:

1. Install the package:
   ```bash
   npm install -S @miketran/ai-document-processor-cdk dotenv
   ```

2. Create the `.env` file as shown in Option A, Step 2

3. Update your `bin/app.ts` as shown in Option A, Step 3

---

## ⚙️ Configuration

### Step 1: Obtain Marketplace Integration Values

Contact AWS Marketplace or check your seller portal for:
- `CUSTOMER_IDENTIFIER`
- `CROSS_ACCOUNT_ROLE_ARN`
- `EXTERNAL_ID`
- `REPORTS_TABLE_NAME`
- `TARGET_REGION`

### Step 2: Get Hugging Face Token

1. Go to [Hugging Face Settings](https://huggingface.co/settings/tokens)
2. Create a new token with read access
3. Copy the token to your `.env` file

### Step 3: Update Environment Variables

Edit your `.env` file with actual values:

```bash
# Edit the .env file
nano .env

# Or use your preferred editor
code .env
```

### Step 4: Prepare Frontend Application (Optional)

If you have a custom frontend:

```bash
# Create frontend directory structure
mkdir -p ../client-app
cd ../client-app

# Initialize your frontend (React, Vue, etc.)
npm init -y
npm install react react-dom vite @vitejs/plugin-react

# Create build script in package.json
# Ensure "build" script outputs to "dist" folder

# Return to CDK project
cd ../ai-document-processor-marketplace
```

---

## 🚢 Deployment

### Step 1: Synthesize CDK Application

```bash
# Generate CloudFormation templates
npx cdk synth

# Review the generated templates
ls -la cdk.out/
```

### Step 2: Review Stack Changes

```bash
# See what will be deployed
npx cdk diff
```

### Step 3: Deploy the Application

```bash
# Deploy all stacks
npx cdk deploy --all

# Or deploy with specific options
npx cdk deploy --all \
  --require-approval never \
  --outputs-file outputs.json
```

### Step 4: Monitor Deployment

The deployment will create multiple stacks in order:
1. **KMS Stack** - Encryption keys
2. **S3 Stack** - Storage buckets
3. **Backend App Stack** - API, Cognito, SageMaker
4. **Frontend Stack** - CloudFront distribution

Expected deployment time: 20-30 minutes

---

## ✅ Post-Deployment

### Step 1: Save Important Outputs

After deployment, save the outputs:

```bash
# View all outputs
aws cloudformation describe-stacks \
  --stack-name prod-AiDocProcessor-prod-eu-central-1-backend-app \
  --query 'Stacks[0].Outputs' \
  --output table
```

Key outputs to note:
- **API Endpoint URL**
- **Cognito User Pool ID**
- **Cognito Client ID**
- **Cognito Domain**
- **S3 Bucket Names**
- **CloudFront Distribution URL**

### Step 2: Create Admin User

```bash
# Using AWS CLI
aws cognito-idp admin-create-user \
  --user-pool-id YOUR_USER_POOL_ID \
  --username admin@yourcompany.com \
  --user-attributes Name=email,Value=admin@yourcompany.com \
  --temporary-password TempPass123! \
  --message-action SUPPRESS
```

### Step 3: Update Frontend Configuration

If using CloudFront URL:

```bash
# Update CLIENT_URL in .env
CLIENT_URL=https://YOUR_CLOUDFRONT_DISTRIBUTION.cloudfront.net

# Redeploy to update configuration
npx cdk deploy prod-AiDocProcessor-prod-eu-central-1-FrontEnd-Stack
```

### Step 4: Test the Application

1. Navigate to your CloudFront URL
2. Log in with admin credentials
3. Upload a test document
4. Verify processing works

---

## 🔍 Verification Checklist

- [ ] All stacks deployed successfully
- [ ] Admin user can log in
- [ ] API Gateway responds to requests
- [ ] S3 buckets are accessible
- [ ] SageMaker endpoint is active
- [ ] CloudFront distribution is accessible
- [ ] Document upload works
- [ ] Document processing completes

---

## 🐛 Troubleshooting

### Common Issues and Solutions

#### 1. Deployment Fails with "No credentials"
```bash
# Solution: Configure AWS credentials
aws configure
```

#### 2. "Stack already exists" Error
```bash
# Solution: Delete existing stack
npx cdk destroy --all
# Then redeploy
npx cdk deploy --all
```

#### 3. SageMaker Endpoint Creation Fails
- Check Hugging Face token is valid
- Verify you have ml.g5.2xlarge quota in your region
- Check CloudWatch logs for detailed errors

#### 4. Frontend Build Fails
```bash
# Ensure client-app exists and builds correctly
cd ../client-app
npm install
npm run build
# Verify dist folder is created
ls -la dist/
```

#### 5. Cognito Login Issues
- Verify CLIENT_URL matches your actual frontend URL
- Check Cognito app client settings in AWS Console
- Ensure callback URLs are configured correctly

### Getting Help

- Check CloudWatch Logs for detailed error messages
- Review CloudFormation events for stack creation issues
- Enable CDK debug mode: `export CDK_DEBUG=true`

---

## 📚 Additional Resources

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [AWS Marketplace Seller Guide](https://docs.aws.amazon.com/marketplace/latest/userguide/)
- [SageMaker Async Inference](https://docs.aws.amazon.com/sagemaker/latest/dg/async-inference.html)
- [Cognito User Pools](https://docs.aws.amazon.com/cognito/latest/developerguide/)

---

## 🔐 Security Best Practices

1. **Never commit `.env` file to version control**
   ```bash
   echo ".env" >> .gitignore
   ```

2. **Use AWS Secrets Manager for production**
   ```bash
   aws secretsmanager create-secret \
     --name ai-doc-processor/prod \
     --secret-string file://.env
   ```

3. **Enable MFA for admin users**

4. **Regularly rotate API tokens and credentials**

5. **Monitor AWS CloudTrail for API activity**

---

## 📝 License

MIT © HorusTech

## 🙋 Support

For issues or questions:
- Open an issue in the GitHub repository
- Contact AWS Marketplace support
- Review CloudWatch logs for debugging
