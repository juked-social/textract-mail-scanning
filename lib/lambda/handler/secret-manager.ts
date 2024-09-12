import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

// Create a Secrets Manager client
const secretsManagerClient = new SecretsManagerClient({ region: process.env.REGION });

export async function getSecret(secretArn: string) {
    try {
        const command = new GetSecretValueCommand({ SecretId: secretArn });

        const data = await secretsManagerClient.send(command);

        if (data.SecretString) {
            return JSON.parse(data.SecretString);
        } else if(data.SecretBinary) {
            const binaryData = new Uint8Array(data.SecretBinary);
            const buffer = Buffer.from(binaryData);
            const decodedString = buffer.toString('utf-8');
            return JSON.parse(decodedString);
        } else {
            throw new Error('Secret not found or is empty.');
        }
    } catch (error) {
        console.error('Error retrieving secret:', error);
        throw error;
    }
}
