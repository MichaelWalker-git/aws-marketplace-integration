import { SES } from "@aws-sdk/client-ses";
import * as fs from 'fs';
import * as path from 'path';

const senderEmail = process.env.SENDER_EMAIL;
const region = process.env.REGION || 'us-east-2';
const instructionsFilePath = process.env.INSTRUCTIONS_FILE_PATH || './installation-instructions.md';
const usageTableName = process.env.USAGE_TABLE;

const ses = new SES({ region: region });

export async function sendGreetingEmail(
    customerEmail: string,
    firstName: string,
    lastName: string,
    customerData: {
        customerIdentifier: string;
        usageRoleArn: string;
        customerAccountId: string;
    }
): Promise<void> {
    try {
        // Read installation instructions from MD file
        const instructionsContent = await readInstructionsFile();

        // Replace placeholders in instructions with actual customer data
        const personalizedInstructions = personalizeInstructions(instructionsContent, customerData);

        // Create email content
        const emailContent = createEmailContent(firstName, lastName, personalizedInstructions);

        const emailParams = {
            Destination: {
                ToAddresses: [customerEmail],
            },
            Message: {
                Body: {
                    Html: {
                        Charset: 'UTF-8',
                        Data: emailContent.html,
                    },
                    Text: {
                        Charset: 'UTF-8',
                        Data: emailContent.text,
                    },
                },
                Subject: {
                    Charset: 'UTF-8',
                    Data: `Welcome! Your App Installation Guide`,
                },
            },
            Source: senderEmail!,
            ReplyToAddresses: [senderEmail!],
        };

        const result = await ses.sendEmail(emailParams);
        console.log(`Email sent successfully to ${customerEmail}:`, result.MessageId);

    } catch (error) {
        console.error('Error sending greeting email:', error);
        // @ts-ignore
        throw new Error(`Failed to send greeting email: ${error?.message}`);
    }
}

async function readInstructionsFile(): Promise<string> {
    try {
        // For Lambda, the file should be included in the deployment package
        const filePath = path.join(process.cwd(), instructionsFilePath);
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error('Error reading instructions file:', error);
        throw new Error(`Could not read installation instructions file: ${(error as Error )?.message}`);
    }
}

function personalizeInstructions(content: string, customerData: {
    customerIdentifier: string;
    usageRoleArn: string;
    customerAccountId: string;
}): string {
    return content
        .replace(/\{\{CUSTOMER_IDENTIFIER\}\}/g, customerData.customerIdentifier)
        .replace(/\{\{USAGE_ROLE_ARN\}\}/g, customerData.usageRoleArn)
        .replace(/\{\{CUSTOMER_ACCOUNT_ID\}\}/g, customerData.customerAccountId)
        .replace(/\{\{YOUR_ACCOUNT_ID\}\}/g, process.env.AWS_ACCOUNT_ID || 'YOUR_ACCOUNT_ID')
        .replace(/\{\{USAGE_TABLE_NAME\}\}/g, usageTableName || 'your-usage-table');
}

function createEmailContent(firstName: string, lastName: string, instructions: string): {html: string, text: string} {
    const greeting = `Dear ${firstName} ${lastName},`;

    const introText = `
Thank you for subscribing to our application through AWS Marketplace! We're excited to have you on board.

Below you'll find detailed installation instructions to get your app up and running in your AWS account. If you have any questions during the setup process, please don't hesitate to reach out to our support team.

Best regards,
The Support Team
`;

    // Convert markdown to HTML (basic conversion)
    const htmlInstructions = markdownToHtml(instructions);

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
        .greeting { color: #2c5aa0; font-size: 18px; margin-bottom: 20px; }
        .intro { background: #f8f9fa; padding: 15px; border-left: 4px solid #2c5aa0; margin: 20px 0; }
        pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
        code { background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; }
    </style>
</head>
<body>
    <div class="greeting">${greeting}</div>
    <div class="intro">${introText.replace(/\n/g, '<br>')}</div>
    <div class="instructions">
        ${htmlInstructions}
    </div>
    <div class="footer">
        <p>If you need assistance, please contact our support team.</p>
        <p>This is an automated email. Please do not reply directly to this message.</p>
    </div>
</body>
</html>
`;

    const textContent = `
${greeting}

${introText}

INSTALLATION INSTRUCTIONS:
${instructions}

---
If you need assistance, please contact our support team.
This is an automated email. Please do not reply directly to this message.
`;

    return {
        html: htmlContent,
        text: textContent
    };
}

function markdownToHtml(markdown: string): string {
    return markdown
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // Bold
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.*)\*/gim, '<em>$1</em>')
        // Code blocks
        .replace(/```([\s\S]*?)```/gim, '<pre><code>$1</code></pre>')
        // Inline code
        .replace(/`([^`]*)`/gim, '<code>$1</code>')
        // Line breaks
        .replace(/\n/gim, '<br>')
        // Lists (basic)
        .replace(/^\- (.*$)/gim, '<li>$1</li>')
        .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
}
