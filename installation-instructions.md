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
npm i -S @horustech/ai-document-processor-cdk
# or
yarn add @horustech/ai-document-processor-cdk
```

## Requires:

- Node.js 18+
- AWS CDK v2

## An AWS account & credentials

### ⚡ Quick start (use the prebuilt stage)
Create bin/app.ts:

```typescript
#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { config } from 'dotenv';
// Pull .env (recommended for secrets)
config();

import { ProdStage } from '@horustech/ai-document-processor-cdk/stages';
import { STAGES } from '@horustech/ai-document-processor-cdk/shared/constants';
import { Labels } from '@horustech/ai-document-processor-cdk/shared/labels';

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

const VENDOR_NAME = process.env.VENDOR_NAME || 'Horustech';

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
import { ProdStage } from '@horustech/ai-document-processor-cdk/stages';
import { BackendAppStack } from '@horustech/ai-document-processor-cdk/stacks/backend-app-stack';
import { FrontendStack } from '@horustech/ai-document-processor-cdk/stacks/FrontendStack';
import { S3Stack } from '@horustech/ai-document-processor-cdk/stacks/S3Stack';
import { Labels } from '@horustech/ai-document-processor-cdk/shared/labels';

class MyStage extends Stage {
constructor(scope: App, id: string) {
super(scope, id);

    const labels = new Labels('AiDocProcessor', 'prod', 'eu-central-1', 'ai-document-processor', 'marketplace', '-');

    const s3 = new S3Stack(this, `${labels.name()}-s3`, { labels });

    const backend = new BackendAppStack(this, `${labels.name()}-backend-app`, {
      labels,
      clientUrl: 'https://my-frontend.example.com',
      adminEmail: 'admin@example.com',
      adminFamilyName: 'Admin',
      adminGivenName: 'Super',
      vendorName: 'Horustech',
      huggingfaceHubToken: '',
    }, { description: 'App backend' });

    const frontend = new FrontendStack(this, `${labels.name()}-FrontEnd-Stack`, { labels });
    frontend.addDependency(backend);

    // (Optionally) add compliance with cdk-nag the way ProdStage does
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

```ini

CDK_DEFAULT_ACCOUNT=123456789012
CDK_DEFAULT_REGION=us-east-1

APP_NAME=ai-document-processor
APP_LABEL=AiDocProcessor
APP_REGION=eu-central-1

COMPLIANCE_FRAMEWORK=hipaa   # hipaa | nist | pci | all

ADMIN_EMAIL=admin@example.com
ADMIN_FAMILY_NAME=Admin
ADMIN_GIVEN_NAME=Super
CLIENT_URL=http://localhost:5173/

VENDOR_NAME=Horustech

HUGGINGFACE_HUB_TOKEN=
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

// Useful shared types/utilities:
export { Labels } from '@horustech/ai-document-processor-cdk/shared/labels';
export { STAGES } from '@horustech/ai-document-processor-cdk/shared/constants';
```

### 📝 License
MIT © HorusTech

### 🙋 Support
Feel free to open issues/PRs with improvements, or questions about customizing the stage/stacks for your environment.
