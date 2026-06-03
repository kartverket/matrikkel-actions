import {ApplicationExpansionContext, type ExpansionRule} from "../ApplicationExpansionContext.ts";
import {createAzureAdApplication} from "../crd/AzureAdApplication.ts";
import z from 'zod';

const Config = z.object({
    azure: z.strictObject({
        application: z.object({
            enabled: z.boolean()
        })
    }).optional()
});
type Config = z.infer<typeof Config>;

export const azureApplicationRule: ExpansionRule = {
    name: 'azureApplication',
    async apply(context: ApplicationExpansionContext): Promise<void> {
        const config: Config = z.parse(Config, context.appManifest.spec)

        if (config.azure == null) return;

        const isEnabled = config.azure.application.enabled

        if (!isEnabled) return;

        delete context.appManifest.spec.azure;
        context.appManifest.spec.accessPolicy ??= {};
        context.appManifest.spec.accessPolicy.outbound ??= {};
        context.appManifest.spec.accessPolicy.outbound.external ??= [];
        context.appManifest.spec.accessPolicy.outbound.external.push({
            host: 'login.microsoftonline.com'
        });

        const { secretName, manifest } = createAzureAdApplication(context.namespace, context.appname);
        context.addManifest(manifest);

        context.appManifest.spec.env ??= [];
        context.appManifest.spec.env.push(secretRef(secretName, 'AZURE_APP_CLIENT_ID'));
        context.appManifest.spec.env.push(secretRef(secretName, 'AZURE_APP_CLIENT_SECRET'));
        context.appManifest.spec.env.push(secretRef(secretName, 'AZURE_APP_JWK'));
        context.appManifest.spec.env.push(secretRef(secretName, 'AZURE_APP_JWKS'));
        context.appManifest.spec.env.push(secretRef(secretName, 'AZURE_APP_TENANT_ID'));
        context.appManifest.spec.env.push(secretRef(secretName, 'AZURE_APP_WELL_KNOWN_URL'));
        context.appManifest.spec.env.push(secretRef(secretName, 'AZURE_OPENID_CONFIG_ISSUER'));
        context.appManifest.spec.env.push(secretRef(secretName, 'AZURE_OPENID_CONFIG_JWKS_URI'));
        context.appManifest.spec.env.push(secretRef(secretName, 'AZURE_OPENID_CONFIG_TOKEN_ENDPOINT'));
    }
}

function secretRef(secretName: string, envName: string) {
    return {
        name: envName,
        valueFrom: {
            secretKeyRef: {
                name: secretName,
                key: envName
            },
        }
    }
}