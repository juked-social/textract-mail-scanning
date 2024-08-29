def lambda_handler(event, context):
    new_manifest = {
        "manifest": {
            "s3_path": event["manifest"]["s3Path"],
            "textract_features": ["QUERIES"],
            "queries_config": [
            {
                "text": "What is the Name?",
                "alias": "SenderName"
            },
            {
                "text": "What is the Sender's Address, usually starting with 'Ford'?",
                "alias": "SenderAddress"
            },
            {
                "text": "What is the Sender City?",
                "alias": "SenderCity"
            },
            {
                "text": "What is the Sender State?",
                "alias": "SenderStateProvince"
            },
            {
                "text": "What is the Sender Postal Code?",
                "alias": "SenderPostalCode"
            },
            {
                "text": "What is the Recipient Name?",
                "alias": "RecipientName"
            },
            {
                "text": "What is the Recipient Address?",
                "alias": "RecipientAddress"
            },
            {
                "text": "What is the Recipient Address City?",
                "alias": "DeliveryCity"
            },
            {
                "text": "What is the Recipient Address State?",
                "alias": "DeliveryStateProvince"
            },
            {
                "text": "What is the Recipient Address Postal Code?",
                "alias": "DeliveryPostalCode"
            },
        ]
        },
        "mime": event["mime"],
    }
    if "classification" in event:
        new_manifest["manifest"]["classification"] = event["classification"]
    if "numberOfPages" in event:
        new_manifest["manifest"]["numberOfPages"] = event["numberOfPages"]
    if "fileSize" in event:
        new_manifest["manifest"]["fileSize"] = event["fileSize"]
    if "numberOfQueries" in event:
        new_manifest["manifest"]["numberOfQueries"] = event["numberOfQueries"]

    return new_manifest
