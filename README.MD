# Why not use a regular logger

Two reasons: 
1. This might be used in an environment where for security we want to own the whole stack (e.g. authorisation). 
2. We don't want heavyweight enterprise solutions, but still want the value of distributed tracing. 
