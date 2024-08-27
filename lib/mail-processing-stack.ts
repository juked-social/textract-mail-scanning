import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { StateMachine, Map, DefinitionBody } from 'aws-cdk-lib/aws-stepfunctions';
import {NodejsFunction} from "aws-cdk-lib/aws-lambda-nodejs";

export class MailProcessingStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const imageBucket = new Bucket(this, 'MailImageBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY, // Only for dev environments
        });

        // Define the DynamoDB table
        const mailMetadataTable = new dynamodb.Table(this, 'MailMetadataTable', {
            partitionKey: { name: 'ScrapPostCard', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'any_mail_id', type: dynamodb.AttributeType.NUMBER },
            tableName: 'MailMetadataTable',
            removalPolicy: cdk.RemovalPolicy.DESTROY, // Only for dev environments
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
        });

        // Define the Lambda layers
        const layerChrome = new lambda.LayerVersion(this, 'ChromeLayer', {
            code: lambda.Code.fromAsset(path.join(__dirname, 'layer/chromium-layer/chromium-layer.zip')),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
        });

        const layerDateFns = new lambda.LayerVersion(this, 'DateFnsLayer', {
            code: lambda.Code.fromAsset(path.join(__dirname, 'layer/date-fns/date-fns.zip')),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
        });

        // Define the Lambda function
        const mailFetchingLambda = new NodejsFunction(this, 'MailFetcherLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'mailFetcher.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, 'lambda')),
            layers: [layerChrome, layerDateFns],
            memorySize: 1024, // Set memory size to 1024 MB
            timeout: cdk.Duration.minutes(10), // Set timeout to 10 minutes
            architecture: lambda.Architecture.X86_64,
            environment: {
                IMAGE_BUCKET_NAME: imageBucket.bucketName,
                MAIL_METADATA_TABLE_NAME: mailMetadataTable.tableName,
                REGION: this.region,
            },
        });

        const s3ProcessingLambda = new NodejsFunction(this, 'S3ProcessingLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 's3-processor.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, 'lambda')),
            environment: {
                IMAGE_BUCKET_NAME: imageBucket.bucketName,
                REGION: this.region,
            },
        });

        const textractLambda = new NodejsFunction(this, 'TextractLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'textract.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, 'lambda')),
            environment: {
                MAIL_METADATA_TABLE_NAME: mailMetadataTable.tableName,
                REGION: this.region,
            },
        });

        imageBucket.grantReadWrite(mailFetchingLambda);
        imageBucket.grantRead(s3ProcessingLambda);
        mailMetadataTable.grantReadWriteData(textractLambda);
        mailMetadataTable.grantReadWriteData(mailFetchingLambda);

        const completionLambda = new NodejsFunction(this, 'CompletionLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            handler: 'completion.handler',
            code: lambda.Code.fromAsset(path.join(__dirname, 'lambda')),
            environment: {
                MAIL_METADATA_TABLE_NAME: mailMetadataTable.tableName,
            },
        });

        const mailFetchingTask = new LambdaInvoke(this, 'MailFetchingTask', {
            lambdaFunction: mailFetchingLambda,
            outputPath: '$.Payload',
        });

        const s3ProcessingTask = new LambdaInvoke(this, 'S3ProcessingTask', {
            lambdaFunction: s3ProcessingLambda,
            outputPath: '$.Payload',
        });

        const textractMapTask = new Map(this, 'TextractMapTask', {
            maxConcurrency: 10, // Adjust concurrency as needed
            itemsPath: '$.images',
            itemSelector: {
                'image.$': '$$.Map.Item.Value',
            },
        }).itemProcessor(
            new LambdaInvoke(this, 'TextractTask', {
                lambdaFunction: textractLambda,
                outputPath: '$.Payload',
            })
        );

        const completionTask = new LambdaInvoke(this, 'CompletionTask', {
            lambdaFunction: completionLambda,
            outputPath: '$.Payload',
        });

        const definition = mailFetchingTask
            .next(s3ProcessingTask)
            .next(textractMapTask)
            .next(completionTask);

        // Create the State Machine
        new StateMachine(this, 'MailProcessingStateMachine', {
            definitionBody: DefinitionBody.fromChainable(definition),
            timeout: cdk.Duration.minutes(15),
        });

        // Grant the Lambda function permissions to write to the DynamoDB table

        // Define the API Gateway
        const api = new apigateway.RestApi(this, 'MailProcessingApi', {
            restApiName: 'Mail Processing Service',
            description: 'This service automates the process of downloading, processing, validating, and uploading mail data from Anytime Mailbox',
        });

        // Create a resource and method for the API
        const mails = api.root.addResource('mails');
        mails.addMethod('POST', new apigateway.LambdaIntegration(mailFetchingLambda));
    }
}
