import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as path from 'path';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Code, Runtime, Function, Architecture } from 'aws-cdk-lib/aws-lambda';

import { LambdaInvoke } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import {
    StateMachine,
    Map,
    DefinitionBody,
    Choice,
    Condition,
    Chain,
    Wait,
    WaitTime,
    IntegrationPattern,
    TaskInput,
    JsonPath,
} from 'aws-cdk-lib/aws-stepfunctions';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { TextractGenericAsyncSfnTask, TextractPOCDecider } from 'amazon-textract-idp-cdk-constructs';
import { Duration } from 'aws-cdk-lib';


export class MailProcessingStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const S3_TEMP_OUTPUT_PREFIX = 'mail-textract-temp-output';

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

        const layerSharp = new lambda.LayerVersion(this, 'SharpLayer', {
            code: lambda.Code.fromAsset(path.join(__dirname, 'layer/sharp/sharp.zip')),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
        });

        const layerFastLevenshtein = new lambda.LayerVersion(this, 'FastLevenshteinLayer', {
            code: lambda.Code.fromAsset(path.join(__dirname, 'layer/fast-levenshtein/fast-levenshtein.zip')),
            compatibleRuntimes: [lambda.Runtime.NODEJS_18_X],
        });


        // Define the Lambda function
        const mailFetchingLambda = new NodejsFunction(this, 'MailFetcherLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, 'lambda', 'mail-fetcher.ts'),
            layers: [layerChrome, layerDateFns],
            memorySize: 1024, // Set memory size to 1024 MB
            timeout: cdk.Duration.minutes(10), // Set timeout to 10 minutes
            architecture: lambda.Architecture.X86_64,
            environment: {
                IMAGE_BUCKET_NAME: imageBucket.bucketName,
                MAIL_METADATA_TABLE_NAME: mailMetadataTable.tableName,
                REGION: this.region,
            },
            bundling: {
                externalModules: ['aws-sdk', '@sparticuz/chromium'] // Add any external modules here
            },
        });

        const s3ProcessingLambda = new NodejsFunction(this, 'S3ProcessingLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, 'lambda', 's3-processor.ts'),
            environment: {
                IMAGE_BUCKET_NAME: imageBucket.bucketName,
                MAIL_METADATA_TABLE_NAME: mailMetadataTable.tableName,
                REGION: this.region,
            },
        });

        const rotateImageLambda = new NodejsFunction(this, 'TextractRotateLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, 'lambda', 'rotate-image.ts'),
            layers: [layerSharp],
            memorySize: 1024, // Set memory size to 1024 MB
            timeout: cdk.Duration.minutes(10), // Set timeout to 10 minutes
            environment: {
                IMAGE_BUCKET_NAME: imageBucket.bucketName,
                MAIL_METADATA_TABLE_NAME: mailMetadataTable.tableName,
                REGION: this.region,
            },
            bundling: {
                nodeModules: ['sharp'],
                forceDockerBundling: true,
            }
        });

        const textractLambda = new NodejsFunction(this, 'TextractLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, 'lambda', 'textract.ts'),
            layers: [layerFastLevenshtein],
            memorySize: 1024, // Set memory size to 1024 MB
            environment: {
                MAIL_METADATA_TABLE_NAME: mailMetadataTable.tableName,
                REGION: this.region,
                BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
            },
            timeout: cdk.Duration.minutes(2),
            bundling: {
                nodeModules: ['fast-levenshtein'],
            }
        });

        const validatorLambda = new NodejsFunction(this, 'ValidatorLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, 'lambda', 'validator.ts'),
            memorySize: 1024, // Set memory size to 1024 MB
            environment: {
                MAIL_METADATA_TABLE_NAME: mailMetadataTable.tableName,
                REGION: this.region,
            },
            timeout: cdk.Duration.minutes(2)
        });

        const textractAsyncTask = new TextractGenericAsyncSfnTask(
            this,
            'TextractAsync',
            {
                s3OutputBucket: imageBucket.bucketName,
                s3TempOutputPrefix: S3_TEMP_OUTPUT_PREFIX,
                integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
                lambdaLogLevel: 'DEBUG',
                lambdaTimeout: 900,
                input: TaskInput.fromObject({
                    Token: JsonPath.taskToken,
                    ExecutionId: JsonPath.stringAt('$$.Execution.Id'),
                    Payload: JsonPath.entirePayload,
                }),
                resultPath: '$.textract_result',
            },
        );

        const textractAsyncRotateTask = new TextractGenericAsyncSfnTask(
            this,
            'TextractAsyncRotate',
            {
                s3OutputBucket: imageBucket.bucketName,
                s3TempOutputPrefix: S3_TEMP_OUTPUT_PREFIX,
                integrationPattern: IntegrationPattern.WAIT_FOR_TASK_TOKEN,
                lambdaLogLevel: 'DEBUG',
                lambdaTimeout: 900,
                input: TaskInput.fromObject({
                    Token: JsonPath.taskToken,
                    ExecutionId: JsonPath.stringAt('$$.Execution.Id'),
                    Payload: JsonPath.entirePayload,
                }),
                resultPath: '$.textract_result',
            },
        );

        const completionLambda = new NodejsFunction(this, 'CompletionLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, 'lambda', 'completion.ts'),
            layers: [layerChrome, layerDateFns],
            memorySize: 1024, // Set memory size to 1024 MB
            timeout: cdk.Duration.minutes(10), // Set timeout to 10 minutes
            architecture: lambda.Architecture.X86_64,
            environment: {
                MAIL_METADATA_TABLE_NAME: mailMetadataTable.tableName,
                TEMP_BUCKET_NAME: imageBucket.bucketName,
                TEMP_TABLE_NAME: textractAsyncTask.taskTokenTableName,
                REGION: this.region,
                S3_TEMP_OUTPUT_PREFIX: S3_TEMP_OUTPUT_PREFIX,
            },
            bundling: {
                externalModules: ['aws-sdk', '@sparticuz/chromium'] // Add any external modules here
            },
        });

        // We will then click delete on the mail website.
        const mailFetchingTask = new LambdaInvoke(this, 'MailFetchingTask', {
            lambdaFunction: mailFetchingLambda,
            outputPath: '$.Payload',
        });

        const s3ProcessingTask = new LambdaInvoke(this, 'S3ProcessingTask', {
            lambdaFunction: s3ProcessingLambda,
            inputPath: '$',
            outputPath: '$.Payload',
        });

        const addQueriesFunction = new Function(
            this,
            'addQueriesFunction',
            {
                runtime: Runtime.PYTHON_3_9,
                handler: 'index.lambda_handler',
                code: Code.fromAsset(
                    path.join(__dirname, 'lambda/add-queries/app'),
                ),
                architecture: Architecture.X86_64,
                timeout: Duration.seconds(30),
            },
        );

        const rotateImage = new LambdaInvoke(this, 'RotateImageTask', {
            lambdaFunction: rotateImageLambda,
            outputPath: '$.Payload',
        });

        const addQueriesTask = new LambdaInvoke(
            this,
            'AddQueries',
            {
                lambdaFunction: addQueriesFunction,
                resultPath: '$.Payload',
            },
        );

        const addQueriesRotateTask = new LambdaInvoke(
            this,
            'AddQueriesRotate',
            {
                lambdaFunction: addQueriesFunction,
                resultPath: '$.Payload',
            },
        );

        const afterTextractTask = new LambdaInvoke(this, 'TextractTask', {
            lambdaFunction: textractLambda,
            payload: TaskInput.fromObject({
                'InputParameters.$': '$$.Execution.Input', // Pass the initial input to the completion task
                'Payload.$': '$' // Keep the payload from previous steps
            }),
            outputPath: '$.Payload',
        });

        const afterTextractRotateTask = new LambdaInvoke(this, 'TextractRotateTask', {
            lambdaFunction: textractLambda,
            payload: TaskInput.fromObject({
                'InputParameters.$': '$$.Execution.Input', // Pass the initial input to the completion task
                'Payload.$': '$' // Keep the payload from previous steps
            }),
            outputPath: '$.Payload',
        });

        const validatorTask = new LambdaInvoke(this, 'ValidatorTask', {
            lambdaFunction: validatorLambda,
            payload: TaskInput.fromObject({
                'InputParameters.$': '$$.Execution.Input', // Pass the initial input to the completion task
                'Payload.$': '$' // Keep the payload from previous steps
            }),
            outputPath: '$.Payload',
        });

        const completionTask = new LambdaInvoke(this, 'CompletionTask', {
            lambdaFunction: completionLambda,
            outputPath: '$.Payload',
            payload: TaskInput.fromObject({
                'InputParameters.$': '$$.Execution.Input', // Pass the initial input to the completion task
                'Payload.$': '$' // Keep the payload from previous steps
            }),
        });

        imageBucket.grantReadWrite(mailFetchingLambda);
        imageBucket.grantReadWrite(rotateImageLambda);
        imageBucket.grantRead(textractLambda);
        imageBucket.grantReadWrite(completionLambda);
        mailMetadataTable.grantReadWriteData(textractLambda);
        mailMetadataTable.grantReadWriteData(mailFetchingLambda);
        mailMetadataTable.grantReadWriteData(s3ProcessingLambda);
        mailMetadataTable.grantReadWriteData(validatorLambda);
        textractAsyncTask.taskTokenTable.grantReadWriteData(completionLambda);

        // Grant textract lambda permission to textract
        textractLambda.addToRolePolicy(new PolicyStatement({
            actions: ['bedrock:InvokeModel'],
            resources: [
                'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-haiku-20240307-v1:0'
            ],
        }));

        const textractDecider = new TextractPOCDecider(this, 'TextractDeciderChainStart', {});
        const textractDeciderRotate = new TextractPOCDecider(this, 'TextractDeciderChainRotate', {});

        const checkRotateImage = new Choice(this, 'CheckIfRotateImage')
            .when(Condition.or(Condition.isNotPresent('$.id'), Condition.stringEquals('$.id', '')),
                Chain
                    .start(rotateImage)
                    .next(textractDeciderRotate)
                    .next(addQueriesRotateTask)
                    .next(textractAsyncRotateTask)
                    .next(afterTextractRotateTask)
                    .next(validatorTask)
            )
            .otherwise(validatorTask)
            .afterwards();

        const textractChain = Chain
            .start(textractDecider)
            .next(addQueriesTask)
            .next(textractAsyncTask)
            .next(afterTextractTask)
            .next(checkRotateImage);

        const textractMapTask = new Map(this, 'TextractMapTask', {
            maxConcurrency: 10,
            itemsPath: '$.images',
            itemSelector: {
                's3Path.$': '$$.Map.Item.Value.s3Key'
            },
        }).itemProcessor(
            textractChain
        );

        const checkMorePages = new Choice(this, 'CheckIfMorePages')
            .when(Condition.booleanEquals('$.body.toNextPage', true),
                new Wait(this, 'wait', { time: WaitTime.duration(cdk.Duration.seconds(5)) }).next(mailFetchingTask))
            .otherwise(s3ProcessingTask)
            .afterwards();

        const mailFetchingChain = Chain.sequence(mailFetchingTask.next(checkMorePages), s3ProcessingTask);

        const definition = mailFetchingChain
            .next(textractMapTask)
            .next(completionTask);

        // Create the State Machine
        const stateMachine = new StateMachine(this, 'MailProcessingStateMachine', {
            definitionBody: DefinitionBody.fromChainable(definition),
            timeout: cdk.Duration.hours(24),
        });

        // Define the Trigger Lambda function
        const triggerLambda = new NodejsFunction(this, 'TriggerLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, 'lambda', 'trigger.ts'),
            environment: {
                STATE_MACHINE_ARN: stateMachine.stateMachineArn,
            },
        });

        stateMachine.grantStartExecution(triggerLambda);

        const api = new apigateway.RestApi(this, 'MailProcessingApi', {
            restApiName: 'Mail Processing Service',
            description: 'This service automates the process of downloading, processing, validating, and uploading mail data from Anytime Mailbox',
        });

        // Create a resource and method for the API
        const mails = api.root.addResource('mails');
        mails.addMethod('POST', new apigateway.LambdaIntegration(triggerLambda));
    }
}
