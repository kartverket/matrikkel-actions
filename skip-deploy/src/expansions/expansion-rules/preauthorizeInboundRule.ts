import z from 'zod';
import {ApplicationExpansionContext, type ExpansionRule} from "../ApplicationExpansionContext.ts";
import {addPreauthorizedApp} from "../crd/AzureAdApplication.ts";

const Config = z.object({
    accessPolicy: z.object({
        inbound: z.object({
            rules: z.array(
                z.object({
                    application: z.string("spec.accessPolicy.inbound.rules[].application is required"),
                    namespace: z.string("spec.accessPolicy.inbound.rules[].namespace must not be blank").min(1).optional(),
                })
            ).optional()
        }).optional()
    }).optional()
});
type Config = z.infer<typeof Config>;

export const preauthorizeInboundRule: ExpansionRule = {
    name: 'preauthorizeInboundRule',
    async apply(context: ApplicationExpansionContext): Promise<void> {
        const azureAdAppRegistration = context.findManifestOfKind('AzureAdApplication');
        if (!azureAdAppRegistration) return;

        const config: Config = z.parse(Config, context.appManifest.spec)

        const inboundRules = config.accessPolicy?.inbound?.rules ?? [];

        for (const { application, namespace } of inboundRules) {
            addPreauthorizedApp(azureAdAppRegistration, {
                cluster: context.cluster,
                namespace: namespace ?? context.namespace,
                application
            })
        }
    }
}