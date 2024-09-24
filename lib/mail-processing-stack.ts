import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as events from 'aws-cdk-lib/aws-events';
import * as path from 'path';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { Code, Runtime, Function, Architecture } from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

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
    Pass,
    ProcessorType,
    ProcessorMode,
} from 'aws-cdk-lib/aws-stepfunctions';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { TextractGenericAsyncSfnTask, TextractPOCDecider } from 'amazon-textract-idp-cdk-constructs';

export class MailProcessingStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        const S3_TEMP_OUTPUT_PREFIX = 'mail-textract-temp-output';

        // Create a Secrets Manager secret to store sensitive information
        const secret = new secretsmanager.Secret(this, 'MailTextractSecret', {
            secretName: 'mail-textract-secret', // The name of the secret
            secretStringValue: cdk.SecretValue.unsafePlainText(JSON.stringify({
                apiToken: '1085503|Ayp8V5GvuGgD9oj4v40AvGUE9LjpARlBatuLIC9z', // API token for authentication
                apiToken2Capture: 'b4f22af45ef2998917dd348aff47bc76', // API token for 2Captcha
                anytimeMailUser: 'aaandre94@gmail.com', // AnytimeMail user
                anytimeMailPassword: 'XZR-qnb1rvu2bdc1zhj', // AnytimeMail password
                anytimeMailSiteKey: '6LcYxHEUAAAAAPnZvF9fus2A095V1i2m3rguU3j7' // AnytimeMail SiteKey for reCapture v2
            })),
        });

        // Create an S3 bucket to store images with a removal policy for development purposes
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
            timeout: cdk.Duration.minutes(15), // Set timeout to 15 minutes
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
            memorySize: 512, // Set memory size to 1024 MB
            timeout: cdk.Duration.minutes(5), // Set timeout to 10 minutes
            environment: {
                IMAGE_BUCKET_NAME: imageBucket.bucketName,
                MAIL_METADATA_TABLE_NAME: mailMetadataTable.tableName,
                REGION: this.region,
            },
        });

        const getImageLambda = new NodejsFunction(this, 'GetImageLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, 'lambda', 'get-image.ts'),
            memorySize: 512, // Set memory size to 1024 MB
            timeout: cdk.Duration.minutes(5), // Set timeout to 10 minutes
            environment: {
                IMAGE_BUCKET_NAME: imageBucket.bucketName,
                REGION: this.region,
            },
        });

        const callApiLambda = new NodejsFunction(this, 'CallApiLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, 'lambda', 'call-api.ts'),
            environment: {
                MAIL_METADATA_TABLE_NAME: mailMetadataTable.tableName,
                REGION: this.region,
                SECRET_ARN: secret.secretArn,
                API_URL: 'https://api.chanced.com',
            },
            memorySize: 1024, // Set memory size to 1024 MB
            timeout: cdk.Duration.minutes(10), // Set timeout to 10 minutes
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
                IMAGE_BUCKET_NAME: imageBucket.bucketName,
                REGION: this.region,
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
                timeout: cdk.Duration.seconds(30),
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
                'InputParameters.$': '$$.Execution.Input', 
                'Payload.$': '$' 
            }),
            outputPath: '$.Payload',
        });

        const afterTextractRotateTask = new LambdaInvoke(this, 'TextractRotateTask', {
            lambdaFunction: textractLambda,
            payload: TaskInput.fromObject({
                'InputParameters.$': '$$.Execution.Input', 
                'Payload.$': '$' 
            }),
            outputPath: '$.Payload',
        });

        const completionTask = new LambdaInvoke(this, 'CompletionTask', {
            lambdaFunction: completionLambda,
            outputPath: '$.Payload',
            payload: TaskInput.fromObject({
                'InputParameters.$': '$$.Execution.Input', 
                'Payload.$': '$' 
            }),
        });

        const callApiTask = new LambdaInvoke(this, 'CallApiTask', {
            lambdaFunction: callApiLambda,
            outputPath: '$.Payload',
            payload: TaskInput.fromObject({
                'InputParameters.$': '$$.Execution.Input', 
                'Payload.$': '$' 
            }),
        });

        imageBucket.grantReadWrite(mailFetchingLambda);
        imageBucket.grantReadWrite(rotateImageLambda);
        imageBucket.grantReadWrite(textractLambda);
        imageBucket.grantReadWrite(getImageLambda);
        mailMetadataTable.grantReadWriteData(textractLambda);
        mailMetadataTable.grantReadWriteData(mailFetchingLambda);
        mailMetadataTable.grantReadWriteData(s3ProcessingLambda);
        mailMetadataTable.grantReadWriteData(callApiLambda);
        mailMetadataTable.grantReadWriteData(completionLambda);

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
            )
            .otherwise(new Pass(this, 'else-block-pass'))
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
        });

        textractMapTask.itemProcessor(
            textractChain,
            {
                mode: ProcessorMode.DISTRIBUTED,
                executionType: ProcessorType.STANDARD,
            }
        );

        const checkMorePages = new Choice(this, 'CheckIfMorePages')
            .when(Condition.booleanEquals('$.body.toNextPage', true),
                new Wait(this, 'wait', { time: WaitTime.duration(cdk.Duration.seconds(5)) }).next(mailFetchingTask))
            .otherwise(s3ProcessingTask)
            .afterwards();

        const mailFetchingChain = Chain.sequence(mailFetchingTask.next(checkMorePages), s3ProcessingTask);

        const definition = mailFetchingChain
            .next(textractMapTask)
            .next(callApiTask)
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
            layers: [layerChrome, layerDateFns],
            memorySize: 1024, // Set memory size to 1024 MB
            timeout: cdk.Duration.minutes(15), // Set timeout to 15 minutes
            architecture: lambda.Architecture.X86_64,
            maxEventAge: cdk.Duration.minutes(15),
            environment: {
                STATE_MACHINE_ARN: stateMachine.stateMachineArn,
                REGION: this.region,
                SECRET_ARN: secret.secretArn
            },
            bundling: {
                externalModules: ['aws-sdk', '@sparticuz/chromium'] // Add any external modules here
            },
        });

        stateMachine.grantStartExecution(triggerLambda);

        // Attach a policy to the Lambda execution role
        triggerLambda.addToRolePolicy(new PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: [secret.secretArn],
        }));
        callApiLambda.addToRolePolicy(new PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: [secret.secretArn],
        }));
        stateMachine.addToRolePolicy(new PolicyStatement({
            actions: ['states:StartExecution'],
            resources: ['*'],
        }));

        const api = new apigateway.RestApi(this, 'MailProcessingApi', {
            restApiName: 'Mail Processing Service',
            description: 'This service automates the process of downloading, processing, validating, and uploading mail data from Anytime Mailbox',
            deployOptions: {
                stageName: 'dev',
            },
        });

        // Create a resource and method for the API
        const mails = api.root.addResource('mails');
        mails.addMethod('POST', new apigateway.LambdaIntegration(triggerLambda));

        const getImage = api.root.addResource('get-image');
        getImage.addMethod('POST', new apigateway.LambdaIntegration(getImageLambda));

        // Define the EventBridge rule
        new events.Rule(this, 'ScheduledRule', {
            schedule: events.Schedule.cron({ minute: '0', hour: '0' }),
            targets: [new targets.LambdaFunction(triggerLambda, {
                event: events.RuleTargetInput.fromObject({
                    body: { }
                })
            })],
        });
    }
}
