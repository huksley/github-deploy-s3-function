"use strict";

class ServerlessExistingLayer {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.commands = {
      deploy: {
        lifecycleEvents: ["resources", "functions"]
      }
    };

    const handler = this.beforeDeployFunctions.bind(this);
    this.hooks = {
      "after:aws:package:finalize:mergeCustomProviderResources": handler
    };
  }

  beforeDeployFunctions() {
    const aws = this.serverless.service.provider;
    const template = aws.compiledCloudFormationTemplate;
    const layers = [
      "arn:aws:lambda:eu-west-1:553035198032:layer:git-lambda2:4"
    ];
    template.Resources.HandlePostLambdaFunction.Properties.Layers = layers;
  }
}

module.exports = ServerlessExistingLayer;
