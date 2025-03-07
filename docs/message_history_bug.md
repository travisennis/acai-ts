I have a bug that I'm can't quite track down. Randomly I get an error:

```
  "responseBody": "{\"type\":\"error\",\"error\":{\"type\":\"invalid_request_error\",\"message\":\"messages.5: all messages must have non-empty content except for the optional final assistant message\"}}",
  "isRetryable": false,
  "data": {
    "type": "error",
    "error": {
      "type": "invalid_request_error",
      "message": "messages.5: all messages must have non-empty content except for the optional final assistant message"
    }
  }  
```

Looking at the messages being sent I see:
```
      {
        "role": "assistant",
        "content": []
      },
      {
        "role": "user",
        "content": [
          {
            "type": "text",
            "text": "double check the plan you just made. make sure steps are comprehensive and detailed. I would this planning doc in the future as input to a code editing agent. make sure are clear where all changes should be made and in the proper order"
          }
        ]
      }
```

Inside of the repl.ts file I have some code that tries to filter out messages with empty content arrays, but the problem is still happening, so it would appear the bug is elsewhere.
