# Mail Processing Project

Welcome to Mail Processing project! This project uses the AWS Cloud Development Kit (CDK) with TypeScript to define and deploy AWS infrastructure.

## Project Overview

This repository contains an AWS CDK application written in TypeScript that automates the deployment of AWS resources. The application is configured through the `cdk.json` file, which guides the CDK Toolkit in executing the app.


- Need to get the token from the website (https://packmail.anytimemailbox.com/app/home)
- Go to Applications -> Cookies -> packmail.anytimemailbox.com -> ASP.NET_SessionId -> Value (ie. 554ke5b00xqr5dnmnxasim3t)

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- [Node.js](https://nodejs.org/) (>= 18.x)
- [AWS CLI](https://aws.amazon.com/cli/) (configured with your credentials)
- [AWS CDK CLI](https://docs.aws.amazon.com/cdk/latest/guide/work-with-cdk.html#install) (globally installed via `npm install -g aws-cdk`)

### Installation

1. **Clone the Repository**

   ```bash
   git clone <repository-url>
   cd <repository-directory>
   
2. **Install Dependencies**

    ```bash
   npm install

### Project Structure

- **`bin/`**: Contains the entry point for your CDK application.
- **`lib/`**: Contains the CDK stack definitions and AWS resources.
- **`lib/lambda/`**: Contains the AWS lambdas.
- **`lib/layer/`**: Contains the Layers for AWS lambdas.
- **`cdk.json`**: Configuration file for the CDK Toolkit.
- **`package.json`**: Node.js project file with dependencies and scripts.
- **`tsconfig.json`**: TypeScript configuration file.
- **`test/`**: Contains unit tests for your CDK stacks.

## Useful Commands

### Build the Project

Compile TypeScript code to JavaScript:

   ```bash
   npm run build
   ```

Compile TypeScript code to JavaScript:

### eslint run

   ```bash
   npm run lint
   ```
   
### Deployment
To deploy your stack, use the `cdk deploy` command. This command will create or update the AWS resources defined in your CDK stack.

   ```bash
   cdk deploy --profile <your profile> --account <your account Id>
   ```

## Configuration

### AWS Credentials

Ensure your AWS credentials are configured. You can set them up using the AWS CLI:

```bash
aws configure
```
### CDK Context
Adjust the cdk.json file to configure context values and other settings required by your CDK application.

## Troubleshooting

If you encounter issues, consider the following:

- Verify AWS IAM permissions are correctly configured.
- Ensure the AWS CLI is properly configured with your credentials.
- Check for TypeScript compilation issues.

For additional help, refer to the [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/latest/guide/work-with-cdk-cli.html).

## Contributing

Contributions are welcome! To contribute, please:

- Submit a pull request.
- Open an issue for any improvements or bug fixes.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
