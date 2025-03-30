# Why not use a regular logger

Two reasons: 
1. This might be used in an environment where for security we want to own the whole stack (e.g. authorisation). 
2. We don't want heavyweight enterprise solutions, but still want the value of distributed tracing. 




# Roadmap

## Optimise package size

### Work on the upstream @andyrmitchell/objects to make sure that importing @andyrmitchell/objects/where-filter will not import zod

At least not after being tree-shaken. Try compiling this with iife and tree-shaking.

### Split out react into its own package (logging-ui-react)

## Rethink the debugger

A lot of times it'll run in an environment without UI (e.g. service worker). 
Need to control from command line. 

I imagine a flow to be like: 
* It's been set up in the service worker, and I can 'unpack' it to use it, e.g. with globalThis._begin (probably defined per app)
* That exposes a common object that has addBreakpoint, removeBreakpoint (if none provided, it lists them and prompts you to choose), listBreakpoints in it
    * It probably has some kind of serialisation, or perma storage (key store), to handle refreshes
* In the prettier UI I can be listing them, then adding them 


## Integrate into AIB

What it benefits from: 
* Being able to just list errors
* Being able to match any object 

* Put in a popup modal
* Wrap the client side session to get traces 
