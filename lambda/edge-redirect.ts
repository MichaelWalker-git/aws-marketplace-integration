import {APIGatewayProxyEventV2, APIGatewayProxyResultV2} from "aws-lambda";


export async function handler(event: APIGatewayProxyEventV2, context: any): Promise<APIGatewayProxyResultV2> {
    // Check if the method is POST and body is not undefined
    const redirect = event.requestContext.http.method === 'POST' && event.body;
    console.log('Event', event)
    if (redirect) {
        try{
            const body = Buffer.from(event.body as string, 'base64');
            console.log('Body', body)
            return {
                statusCode: 302,
                headers: {
                    Location: `https://${process.env.SIGNUP_API_URL}/?${body}`,
                },
                body: '',
            };
        } catch (e) {
            return {
                statusCode: 500,
                body: 'Error parsing body',
            };
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Method not POST or no body present', event }),
    };
}
