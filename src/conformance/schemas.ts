import { z } from "zod";


/**
 * What is under a store: `none`, `private` or `shared`. See {@link SubstrateChoice}.
 */
export const SubstrateChoiceSchema = z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('none') }),
    z.object({ mode: z.literal('private') }),
    z.object({ mode: z.literal('shared') }),
]);

/**
 * What a store does with entries an older library wrote: `migrates`, or `discards-old-entries` with a
 * non-blank reason. See {@link MigrationChoice}.
 */
export const MigrationChoiceSchema = z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('migrates') }),
    z.object({ mode: z.literal('discards-old-entries'), because: z.string().trim().min(1) }),
]);

/**
 * Every capability a harness must declare. The suite checks a harness against it at run time too, so a
 * JavaScript or cast caller that leaves a choice out fails rather than skips.
 */
export const LogStorageCapabilitiesSchema = z.object({
    substrate: SubstrateChoiceSchema,
    migration: MigrationChoiceSchema,
});
