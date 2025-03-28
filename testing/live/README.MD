# Troubleshooting

## Using old/cached npm module

It might be cached. Make Vite do-over with `npm run clean-dev`


# Roadmap

## Optimise package size

### Work on the upstream @andyrmitchell/objects to make sure that importing @andyrmitchell/objects/where-filter will not import zod

At least not after being tree-shaken. Try compiling this with iife and tree-shaking.

### Split out react into its own package (logging-ui-react)