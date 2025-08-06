Your task it to add a new model to the ./source/model/openrouter-provider.ts.

I want you to accomplish this by writing a javascript script and executing it with the code-interpreter tool.

This script should do the following:
1. fetch `openrouter.ai/api/v1/models` using https
2. parse the json response. the shape should be `{"data":[]}`
3. filter the `data` array to find the object whose `id` is `{{INPUT}}`
4. log the model information found in the object

Take that model information and use it to add a new model to openrouter-provider.ts. Follow the pattern that exists to add a new model. If any information is missing ask the user to provide guidance.

Create a new git branch before making any edits.
