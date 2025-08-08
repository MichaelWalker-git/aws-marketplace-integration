import { MarketplaceMetering } from "@aws-sdk/client-marketplace-metering";
import {APIGatewayProxyEventV2, APIGatewayProxyResultV2} from "aws-lambda";
import {DynamoDB} from "@aws-sdk/client-dynamodb";
import {grantCrossAccountAccess} from "../helpers/permissions";
import {sendGreetingEmail} from "../helpers/greeting-email";

const tableName = process.env.SUBSCRIBERS_TABLE;
const region = process.env.REGION || 'us-east-1';

const marketplacemetering = new MarketplaceMetering({ apiVersion: '2016-01-14', region: region });
const dynamodb = new DynamoDB({ apiVersion: '2012-08-10', region: region });



export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    if (!event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'No body present', event }),
        }
    }

    try {
        const {
            regToken, firstName, lastName, email,
        } = JSON.parse(event.body);

        console.log('event', event, firstName, lastName, email, regToken, tableName);

        // Call resolveCustomer to validate the subscriber
        const resolveCustomerParams = {
            RegistrationToken: regToken,
        };

        const resolveCustomerResponse = await marketplacemetering
            .resolveCustomer(resolveCustomerParams);

        // Store new subscriber data in dynamoDb
        const { CustomerIdentifier, ProductCode, CustomerAWSAccountId } = resolveCustomerResponse;

        console.log('resolveCustomerResponse', resolveCustomerResponse);

        if (!CustomerIdentifier || !ProductCode || !CustomerAWSAccountId) {
            throw new Error("Marketplace did not return a complete customer record");
        }

        // Grant cross-account access for usage reporting
        const usageRoleArn = await grantCrossAccountAccess(CustomerAWSAccountId, CustomerIdentifier);

        const datetime = new Date().getTime().toString();

        const dynamoDbParams = {
            TableName: tableName,
            Item: {
                firstName: { S: firstName },
                lastName: { S: lastName },
                email: { S: email },
                customerIdentifier: { S: CustomerIdentifier },
                productCode: { S: ProductCode },
                customerAWSAccountID: { S: CustomerAWSAccountId },
                created: { S: datetime },
            },
        };

        await dynamodb.putItem(dynamoDbParams);

        // Send greeting email with installation instructions
        await sendGreetingEmail(email, firstName, lastName, {
            customerIdentifier: CustomerIdentifier,
            usageRoleArn: usageRoleArn,
            customerAccountId: CustomerAWSAccountId
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'New subscriber registered successfully', event }),
        };
    } catch (error) {
        console.error(error)
        return {
            statusCode: 400,
            body: JSON.stringify(error),
        }
    }

}
