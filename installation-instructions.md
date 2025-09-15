# @horustech/ai-document-processor-cdk
Reusable AWS CDK constructs and stages for an AI-powered document-processing platform (SageMaker, Step Functions, API Gateway, Cognito, DynamoDB, S3, CloudFront, KMS, VPC, SQS).
Ship a full, production-ready stack (with optional HIPAA/NIST/PCI cdk-nag checks) in a few lines.

## ✨ What you get
- **ProdStage** – opinionated stage that wires everything together
- **Individual stacks if you need to compose things yourself:**
  - BackendAppStack
  - FrontendStack
  - S3Stack

## 📦 Install
```bash
npm config set //registry.npmjs.org/:_authToken {{NPM_AUTH_TOKEN}}

npm i -S @miketran/ai-document-processor-cdk
# or
yarn add @miketran/ai-document-processor-cdk
```

## Requires:

- Node.js 18+
- AWS CDK v2

## An AWS account & credentials

### ⚡ Quick start (use the prebuilt stage)
Create bin/app.ts:

```
#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { config } from 'dotenv';
// Pull .env (recommended for secrets)
config();

import { STAGES, Labels, ProdStage } from '@miketran/ai-document-processor-cdk';

const CDK_DEFAULT_REGION  = process.env.CDK_DEFAULT_REGION  || 'us-east-1';
const CDK_DEFAULT_ACCOUNT = process.env.CDK_DEFAULT_ACCOUNT || '';

const APP_NAME   = process.env.APP_NAME   || 'ai-document-processor';
const APP_LABEL  = process.env.APP_LABEL  || 'AiDocProcessor';
const APP_REGION = process.env.APP_REGION || 'eu-central-1';

// Compliance: hipaa | nist | pci | all
const COMPLIANCE_FRAMEWORK = process.env.COMPLIANCE_FRAMEWORK || 'hipaa';

const ADMIN_EMAIL       = process.env.ADMIN_EMAIL       || 'admin@example.com';
const ADMIN_FAMILY_NAME = process.env.ADMIN_FAMILY_NAME || 'Admin';
const ADMIN_GIVEN_NAME  = process.env.ADMIN_GIVEN_NAME  || 'Super';
const CLIENT_URL        = process.env.CLIENT_URL        || 'http://localhost:5173/';

const HUGGINGFACE_HUB_TOKEN = process.env.HUGGINGFACE_HUB_TOKEN || '';

// Marketplace-specific configuration
const VENDOR_NAME = process.env.VENDOR_NAME || 'Horustech';
const TARGET_REGION = process.env.TARGET_REGION || '';
const REPORTS_TABLE_NAME = process.env.REPORTS_TABLE_NAME || '';
const CROSS_ACCOUNT_ROLE_ARN = process.env.CROSS_ACCOUNT_ROLE_ARN || '';
const EXTERNAL_ID = process.env.EXTERNAL_ID || '';
const CUSTOMER_IDENTIFIER = process.env.CUSTOMER_IDENTIFIER || '';

const app = new cdk.App();

const labels = new Labels(
        APP_LABEL,
        STAGES.prod,
        APP_REGION,
        APP_NAME,
        'marketplace',
        '-',
);

new ProdStage(
        app,
        STAGES.prod,
        {
          labels,
          complianceFramework: COMPLIANCE_FRAMEWORK,
          description: 'AI Document Processing Platform',
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

### 🚀 Deploy:
```bash
# Set your account/region, then:
npx cdk bootstrap aws://$CDK_DEFAULT_ACCOUNT/$CDK_DEFAULT_REGION
npx cdk deploy
```

### 🧩 Compose it yourself (import stacks directly)
If you want to place the stacks into your own stage or customize wiring:

```ts
import { App, Stack, Stage } from 'aws-cdk-lib';
import { ProdStage } from '@miketran/ai-document-processor-cdk/stages';
import { BackendAppStack } from '@miketran/ai-document-processor-cdk/stacks/backend-app-stack';
import { FrontendStack } from '@miketran/ai-document-processor-cdk/stacks/FrontendStack';
import { S3Stack } from '@miketran/ai-document-processor-cdk/stacks/S3Stack';
import { Labels } from '@miketran/ai-document-processor-cdk/shared/labels';

class MyStage extends Stage {
constructor(scope: App, id: string) {
super(scope, id);

    const labels = new Labels('AiDocProcessor', 'prod', 'eu-central-1', 'ai-document-processor', 'marketplace', '-');
    
    // KMS Stack - Enhanced for marketplace with customer-managed keys
    const kmsStack = new KmsStack(this, 'Kms-Stack', {
      labels: args.labels,
    });
  
    // S3 Stack
    const s3Stack = new S3Stack(
      this,
      `${args.labels.name()}-s3`,
      args,
    );
    s3Stack.addDependency(kmsStack);
  
    // Backend App Stack
    const backendAppStack = new BackendAppStack(
      this,
      `${args.labels.name()}-backend-app`,
      args,
      {
        env: { region: REGION },
        description: 'AI-powered document processing platform with SageMaker integration - Marketplace Edition',
      },
    );
    backendAppStack.addDependency(s3Stack);
    backendAppStack.addDependency(kmsStack);
  
    // Frontend Stack
    const frontendStack = new FrontendStack(this, `${args.labels.name()}-FrontEnd-Stack`, args);
    frontendStack.addDependency(backendAppStack);
  
    // Apply comprehensive compliance checks based on configuration
    this.addComplianceChecks(backendAppStack, args.complianceFramework);

}
}
```

### 🔐 Compliance (cdk-nag)
ProdStage automatically attaches AWS Solutions checks and (optionally) one of:

- **hipaa** → HIPAASecurityChecks
- **nist** → NIST80053R5Checks
- **pci** → PCIDSS321Checks
- **all** → all of the above

```ts
new ProdStage(app, 'prod', { ... , complianceFramework: 'hipaa' });
```

If you don’t specify complianceFramework, HIPAA is applied by default.

### 🛠️ What each stack does (high level)
`KmsStack`
- KMS CMK for S3 encryption
- KMS CMK for SageMaker encryption
- Outputs: CMK ARNs

`S3Stack`
- KMS-encrypted S3 buckets:
  - input (uploads)
  - output (results)
  - sageMakerAsync (asynchronous inference IO)
- Logging bucket, strict SSL policies, CORS, and exports (Fn.exportValue) to share bucket names/ARNs.

`BackendAppStack`
- VPC with security groups
- KMS CMK, DynamoDB with PITR
- SQS (processing queue)
- SageMaker endpoint (default model Qwen/Qwen2.5-VL-7B-Instruct, async inference, ml.g5.2xlarge)
- Step Functions orchestration
- Cognito (User Pool, Identity Pool, Hosted UI)
- API Gateway (regional, structured access logs, CORS)
- Outputs: API URL, Cognito IDs, domain, etc.

Tight resource policies (execute-api IP allow-list example) and cdk-nag suppressions where needed.

`FrontendStack`
- S3 static hosting bucket + CloudFront distribution (TLS 1.2_2021)
- Build & deploy your client app (expects ../client-app with npm run build)
- Publishes config.json with:
  - API_ENDPOINT (imported from backend)
  - AWS_REGION
  - USER_POOL_CLIENT_ID

### 🔧 Environment variables
Put these in .env or your CI secrets:

```

# ============================================
# AWS CONFIGURATION (Required)
# ============================================
CDK_DEFAULT_ACCOUNT={{CUSTOMER_ACCOUNT_ID}}
CDK_DEFAULT_REGION=us-east-1  # Or your preferred region

# ============================================
# MARKETPLACE INTEGRATION (DO NOT MODIFY)
# These values are automatically configured for your account
# ============================================
CUSTOMER_IDENTIFIER={{CUSTOMER_IDENTIFIER}}
CROSS_ACCOUNT_ROLE_ARN={{CROSS_ACCOUNT_ROLE_ARN}}
EXTERNAL_ID={{EXTERNAL_ID}}
REPORTS_TABLE_NAME={{REPORTS_TABLE_NAME}}


# ============================================
# APPLICATION CONFIGURATION (Customizable)
# You can modify these values as needed
# ============================================
APP_NAME=ai-document-processor
APP_LABEL=AiDocProcessor
APP_REGION=eu-central-1  # Your deployment region

# Compliance framework: hipaa | nist | pci | all
COMPLIANCE_FRAMEWORK=hipaa

# Admin user configuration
ADMIN_EMAIL=admin@yourcompany.com  # Change to your admin email
ADMIN_FAMILY_NAME=Admin            # Change to admin's last name
ADMIN_GIVEN_NAME=Super             # Change to admin's first name

# Hugging Face token for model access
HUGGINGFACE_HUB_TOKEN={{HUGGINGFACE_HUB_TOKEN}}

# Vendor information (keep as is)
VENDOR_NAME=Horustech
TARGET_REGION={{REGION}}
```

You can also pass StageName via CDK context/env when needed:

```bash
npx cdk deploy -c StageName=prod
```

### 📤 Notable CloudFormation outputs (from BackendAppStack & S3Stack)
- `*-rest-api-uri`
- `*-user-pool-id`
- `*-client-id`
- `*-cognito-domain`
- `*-identity-pool-id`
- `*-input-bucket-name / *-arn`
- `*-output-bucket-name / *-arn`
- `*-sagemaker-async-bucket-name / *-arn`

These are consumed by sibling stacks (e.g., Frontend) via Fn.importValue.

### 🧪 Local/frontend build expectations
FrontendStack will:

1. Run npm install --legacy-peer-deps && npm run build inside ../client-app
2. Copy ../client-app/dist to your deployment bucket
3. Invalidate the CloudFront cache

TIP: Ensure your client app reads /config.json at runtime to pick up the API URL & Cognito client ID.

### 🐛 Troubleshooting
- `“Cannot find asset …/client-app”`
  Ensure ../client-app exists relative to the frontend stack and produces a dist/ folder on npm run build.

- `SageMaker cost/instance type`
  Override instanceType, inferenceType, and initialInstanceCount in the SageMakerStack props within BackendAppStack if you fork/customize.

- `cdk-nag violations`
  ProdStage applies suppressions for known, managed constructs. If you add resources, address or suppress findings accordingly.

- `VPC reuse`
  The included VPC stack can be swapped for an imported VPC if your environment requires it.

### 📚 Exports
```ts
// Pre-wired stage:
export { ProdStage } from '@horustech/ai-document-processor-cdk/stages';

// Individual stacks:
export { BackendAppStack } from '@horustech/ai-document-processor-cdk/stacks/backend-app-stack';
export { FrontendStack }   from '@horustech/ai-document-processor-cdk/stacks/FrontendStack';
export { S3Stack }         from '@horustech/ai-document-processor-cdk/stacks/S3Stack';
export { KmsStack }  from '@horustech/ai-document-processor-cdk/stacks/KmsStack';

// Useful shared types/utilities:
export { Labels } from '@horustech/ai-document-processor-cdk/shared/labels';
export { STAGES } from '@horustech/ai-document-processor-cdk/shared/constants';
```

### 📝 License
MIT © HorusTech

### 🙋 Support
Feel free to open issues/PRs with improvements, or questions about customizing the stage/stacks for your environment.
