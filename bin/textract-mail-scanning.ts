#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import {TextractMailScanningStack} from '../lib/textract-mail-scanning-stack';


const app = new cdk.App();
new TextractMailScanningStack(app, 'TextractMailScanningStack', {
    env: {
        account: '911167884854',
        region: 'us-east-2'
    }
});
