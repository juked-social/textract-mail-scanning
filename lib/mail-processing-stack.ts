import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import path from 'path';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';

export class MailProcessingStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props?: cdk.StackProps) {
        super(scope, id, props);

        // Create Secrets Manager secret
        const secret = new secretsmanager.Secret(this, 'MailTextractSecret', {
            secretName: 'mail-textract-secret',
            secretStringValue: cdk.SecretValue.unsafePlainText(JSON.stringify({
                apiToken: '1085503|Ayp8V5GvuGgD9oj4v40AvGUE9LjpARlBatuLIC9z',
                apiToken2Capture: 'b4f22af45ef2998917dd348aff47bc76',
            })),
        });

        // Create S3 bucket
        const imageBucket = new Bucket(this, 'MailImageBucket', {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Define DynamoDB Table
        const mailMetadataTable = new dynamodb.Table(this, 'MailMetadataTable', {
            partitionKey: { name: 'ScrapPostCard', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'any_mail_id', type: dynamodb.AttributeType.NUMBER },
            tableName: 'MailMetadataTable',
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
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

        const publicRouteTableId = 'rtb-04320199e084ea958';
        const privateRouteTableId = 'rtb-0d28edab8eef65ca5';
        const internetGatewayId = 'igw-05802ae55402d1499';
        const natEip1 = 'eipalloc-06057fdfab51299c2';
        const natEip2 = 'eipalloc-02fbe291d19c94160';

        // Create VPC
        const vpc = new ec2.Vpc(this, 'MyVpc', {
            ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/16'),
            maxAzs: 3,
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'PublicSubnet',
                    subnetType: ec2.SubnetType.PUBLIC,
                },
                {
                    cidrMask: 24,
                    name: 'PrivateSubnet',
                    subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
                },
            ],
        });

        // NAT Gateways with provided Elastic IPs
        const natGateway1 = new ec2.CfnNatGateway(this, 'NatGateway1', {
            subnetId: vpc.publicSubnets[0].subnetId,
            allocationId: natEip1,
        });

        const natGateway2 = new ec2.CfnNatGateway(this, 'NatGateway2', {
            subnetId: vpc.publicSubnets[1].subnetId,
            allocationId: natEip2,
        });

        // Public Routes: Skip creation for existing routes
        vpc.publicSubnets.forEach((subnet, index) => {
            console.log(`Skipping route creation for public subnet: ${subnet.subnetId}`);
        });

        // Private Routes: Update route table with NAT Gateways
        vpc.privateSubnets.forEach((subnet, index) => {
            new ec2.CfnRoute(this, `PrivateRoute${index + 1}`, {
                routeTableId: privateRouteTableId,
                destinationCidrBlock: '0.0.0.0/0',
                natGatewayId: index === 0 ? natGateway1.ref : natGateway2.ref,
            });
        });

        // Lambda function for Trigger
        const triggerLambda = new NodejsFunction(this, 'TriggerLambda', {
            runtime: lambda.Runtime.NODEJS_18_X,
            entry: path.join(__dirname, 'lambda', 'trigger.ts'),
            layers: [layerChrome, layerDateFns],
            memorySize: 1024, // Set memory size to 1024 MB
            timeout: cdk.Duration.minutes(15), // Set timeout to 15 minutes
            architecture: lambda.Architecture.X86_64,
            maxEventAge: cdk.Duration.minutes(15),
            vpc,
            vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
            environment: {
                REGION: this.region,
                STATIC_IP_TEST: 'true',
                SECRET_ARN: secret.secretArn,
            },
        });

        // Grant permissions
        secret.grantRead(triggerLambda);

        // Create API Gateway
        const api = new apigateway.RestApi(this, 'MailProcessingApi', {
            restApiName: 'Mail Processing Service',
            deployOptions: {
                stageName: 'dev',
            },
        });

        api.root.addResource('trigger').addMethod('POST', new apigateway.LambdaIntegration(triggerLambda));

        // Outputs
        new cdk.CfnOutput(this, 'VpcId', { value: vpc.vpcId });
        new cdk.CfnOutput(this, 'NatEip1Output', { value: natGateway1.ref });
        new cdk.CfnOutput(this, 'NatEip2Output', { value: natGateway2.ref });
    }
}
