#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MailProcessingStack } from '../lib/mail-processing-stack';


const app = new cdk.App();
new MailProcessingStack(app, 'MailProcessingStack', {
    env: {
        account: '911167884854',
        region: 'us-east-1'
    }
});
