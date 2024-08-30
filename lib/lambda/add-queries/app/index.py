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
                "text": "What is the Sender's Code?",
                "alias": "UserCode"
            },
            {
                "text": "What is the Sender's Address?",
                "alias": "Address"
            },
            {
                "text": "What is the Sender's Email?",
                "alias": "Email"
            },
            {
                "text": "What is the Entire Text?",
                "alias": "Message"
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
