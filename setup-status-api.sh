# Get your API ID and root resource ID
export API_ID=69zb4otc2h
export ROOT_RESOURCE_ID=$(aws apigateway get-resources --rest-api-id $API_ID --query 'items[?path==`/`].id' --output text)

# Create resource for /status
aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_RESOURCE_ID \
  --path-part "status"
export STATUS_RESOURCE_ID=$(aws apigateway get-resources --rest-api-id $API_ID --query 'items[?path==`/status`].id' --output text)

# Create GET method
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $STATUS_RESOURCE_ID \
  --http-method GET \
  --authorization-type NONE

# Set Lambda integration
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $STATUS_RESOURCE_ID \
  --http-method GET \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:163994052169:function:video-generator/invocations

# Add permission for Lambda
aws lambda add-permission \
  --function-name video-generator \
  --statement-id apigateway-status-invoke \
  --action lambda:InvokeFunction \
  --principal apigateway.amazonaws.com \
  --source-arn "arn:aws:execute-api:us-east-1:163994052169:$API_ID/*/GET/status"

# Deploy API to apply changes
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod