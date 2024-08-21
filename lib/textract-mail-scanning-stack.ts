import * as cdk from 'aws-cdk-lib';
import {Construct} from 'constructs';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as path from 'path';


export class TextractMailScanningStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Define the Lambda layers
        const layerChrome = new lambda.LayerVersion(this, "ChromeLayer", {
            code: lambda.Code.fromAsset(path.join(__dirname, '../layer/chromium-layer/chromium-layer.zip')),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
        });

        const layerDateFns = new lambda.LayerVersion(this, "DateFnsLayer", {
            code: lambda.Code.fromAsset(path.join(__dirname, '../layer/date-fns/date-fns.zip')),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
        });

        // Define the Lambda function
        const mailFetcherLambda = new lambda.Function(this, 'MailFetcherLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'mail-fetcher.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
            layers: [layerChrome, layerDateFns],
            memorySize: 1024, // Set memory size to 1024 MB
            timeout: cdk.Duration.minutes(5), // Set timeout to 5 minutes
        });

        // Define the API Gateway
        const api = new apigateway.RestApi(this, 'TextractMailApi', {
            restApiName: 'Textract Mail Service',
            description: 'This service automates the process of downloading, processing, validating, and uploading mail data from Anytime Mailbox',
        });

        // Create a resource and method for the API
        const mails = api.root.addResource('mails');
        mails.addMethod('POST', new apigateway.LambdaIntegration(mailFetcherLambda), {});
    }
}
