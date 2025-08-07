const APP_NAME = process.env.APP_NAME || 'SaaS';

export const getResourceId = (name: string) => {
    return `${APP_NAME}-${name}`;
}
