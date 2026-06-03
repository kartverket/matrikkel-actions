import {ApplicationExpansionContext, type ExpansionRule} from "../ApplicationExpansionContext.ts";
import {createAzureAdApplication} from "../crd/AzureAdApplication.ts";

export const azureApplicationRule: ExpansionRule = {
    name: 'azureApplication',
    async apply(context: ApplicationExpansionContext): Promise<void> {
        const azureAdCtx = context.appDoc.spec.azure;
        if (azureAdCtx == null) return;

        const isEnabled = azureAdCtx.application?.enabled === true

        if (!isEnabled) return;

        delete context.appDoc.spec.azure;
        context.appDoc.spec.accessPolicy ??= {};
        context.appDoc.spec.accessPolicy.outbound ??= {};
        context.appDoc.spec.accessPolicy.outbound.external ??= [];
        context.appDoc.spec.accessPolicy.outbound.external.push({
            host: 'login.microsoftonline.com'
        });

        const { secretName, manifest } = createAzureAdApplication(context.namespace, context.appname);
        context.addDoc(manifest);

        context.appDoc.spec.env ??= [];
        context.appDoc.spec.env.push(secretRef(secretName, 'AZURE_APP_CLIENT_ID'));
        context.appDoc.spec.env.push(secretRef(secretName, 'AZURE_APP_CLIENT_SECRET'));
        context.appDoc.spec.env.push(secretRef(secretName, 'AZURE_APP_JWK'));
        context.appDoc.spec.env.push(secretRef(secretName, 'AZURE_APP_JWKS'));
        context.appDoc.spec.env.push(secretRef(secretName, 'AZURE_APP_TENANT_ID'));
        context.appDoc.spec.env.push(secretRef(secretName, 'AZURE_APP_WELL_KNOWN_URL'));
        context.appDoc.spec.env.push(secretRef(secretName, 'AZURE_OPENID_CONFIG_ISSUER'));
        context.appDoc.spec.env.push(secretRef(secretName, 'AZURE_OPENID_CONFIG_JWKS_URI'));
        context.appDoc.spec.env.push(secretRef(secretName, 'AZURE_OPENID_CONFIG_TOKEN_ENDPOINT'));
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