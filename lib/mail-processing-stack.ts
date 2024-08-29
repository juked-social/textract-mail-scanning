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
    WaitTime, IntegrationPattern, TaskInput, JsonPath
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

        const textractLambda = new NodejsFunction(this, 'TextractLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, 'lambda', 'textract.ts'),
            environment: {
                MAIL_METADATA_TABLE_NAME: mailMetadataTable.tableName,
                REGION: this.region,
            },
            timeout: cdk.Duration.minutes(2),
        });

        imageBucket.grantReadWrite(mailFetchingLambda);
        imageBucket.grantRead(s3ProcessingLambda);
        imageBucket.grantRead(textractLambda);
        mailMetadataTable.grantReadWriteData(textractLambda);
        mailMetadataTable.grantReadWriteData(mailFetchingLambda);
        mailMetadataTable.grantReadWriteData(s3ProcessingLambda);

        // Grant textract lambda permission to textract
        textractLambda.addToRolePolicy(new PolicyStatement({
            actions: ['textract:*'],
            resources: ['*'],
        }));

        // We will then click delete on the mail website.
        const completionLambda = new NodejsFunction(this, 'CompletionLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, 'lambda', 'completion.ts'),
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

        const addQueriesTask = new LambdaInvoke(
            this,
            'AddQueries',
            {
                lambdaFunction: addQueriesFunction,
                resultPath: '$.Payload',
            },
        );

        const afterTextractTask = new LambdaInvoke(this, 'TextractTask', {
            lambdaFunction: textractLambda,
            outputPath: '$.Payload',
        });

        const completionTask = new LambdaInvoke(this, 'CompletionTask', {
            lambdaFunction: completionLambda,
            outputPath: '$.Payload',
        });

        const textractDecider = new TextractPOCDecider(this, 'TextractDeciderChainStart', {});

        // This allows us to get each s3 image and then process it with textract, then write it to dynamodb
        const textractChain = Chain.start(textractDecider).next(addQueriesTask).next(textractAsyncTask).next(afterTextractTask);

        const textractMapTask = new Map(this, 'TextractMapTask', {
            maxConcurrency: 10,
            itemsPath: '$.images',
            itemSelector: {
                's3Path.$': '$$.Map.Item.Value.s3Key', // Fix to set s3Path to s3Key
            },
        }).itemProcessor(
            textractChain
        );

        const checkMorePages = new Choice(this, 'CheckIfMorePages')
            .when(Condition.booleanEquals('$.body.toNextPage', false),
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
            timeout: cdk.Duration.minutes(120),
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
