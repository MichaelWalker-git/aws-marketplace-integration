import { MarketplaceMetering } from "@aws-sdk/client-marketplace-metering";
import {APIGatewayProxyEventV2, APIGatewayProxyResultV2} from "aws-lambda";
import {DynamoDB} from "@aws-sdk/client-dynamodb";

const marketplacemetering = new MarketplaceMetering({ apiVersion: '2016-01-14', region: 'us-east-2' });
const dynamodb = new DynamoDB({ apiVersion: '2012-08-10', region: 'us-east-2' });

const { SUBSCRIBERS_TABLE } = process.env;

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
    if (!event.body) {
        return {
            statusCode: 400,
            body: JSON.stringify({ message: 'No body present', event }),
        }
    }

    try {

        const {
            regToken,contactPerson, contactPhone, contactEmail,
        } = JSON.parse(event.body);

        console.log('event', event, contactPerson, contactPhone, contactEmail, regToken, SUBSCRIBERS_TABLE);

 // TODO: connect with marketplace

/*        // Call resolveCustomer to validate the subscriber
        const resolveCustomerParams = {
            RegistrationToken: regToken,
        };

        const resolveCustomerResponse = await marketplacemetering
            .resolveCustomer(resolveCustomerParams);

        // Store new subscriber data in dynamoDb
        const { CustomerIdentifier, ProductCode, CustomerAWSAccountId } = resolveCustomerResponse;*/

        const { CustomerIdentifier, ProductCode, CustomerAWSAccountId } = marketplaceAnswerMock;

        const datetime = new Date().getTime().toString();

        const dynamoDbParams = {
            TableName: SUBSCRIBERS_TABLE,
            Item: {
                contactPerson: { S: contactPerson },
                contactPhone: { S: contactPhone },
                contactEmail: { S: contactEmail },
                customerIdentifier: { S: CustomerIdentifier },
                productCode: { S: ProductCode },
                customerAWSAccountID: { S: CustomerAWSAccountId },
                created: { S: datetime },
            },
        };

        await dynamodb.putItem(dynamoDbParams);

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

const marketplaceAnswerMock = {
    CustomerIdentifier: "123456789012",
    ProductCode: "testCode",
    CustomerAWSAccountId: "123456789012",
}
