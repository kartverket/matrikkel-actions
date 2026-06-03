import type {ExpansionRule} from "../ApplicationExpansionContext.ts";
import z from 'zod';
import {createExternalSecretDoc} from "../crd/ExternalSecret.ts";
import {addSecretRef} from "../operations/addSecretRef.ts";

const EnvValue = z.object({
    name: z.string(),
    value: z.string(),
});
type EnvValue = z.infer<typeof EnvValue>;

const GSMSecretValue = z.object({
    name: z.string("spec.env[].name is required when gsmSecretName is used").min(1),
    gsmSecretName: z.string("spec.env[].gsmSecretName is required").min(1),
});
type GSMSecretValue = z.infer<typeof GSMSecretValue>;

const Config = z.object({
    env: z.array(
        z.union([EnvValue, GSMSecretValue])
    ).optional()
})
type Config = z.infer<typeof Config>;

export const envGsmSecretRule: ExpansionRule = {
    name: 'env-gsm-secret',
    apply: (context) => {
        const config: Config = z.parse(Config, context.appDoc.spec)
        if (config.env == null) return;

        const remainingEnv: EnvValue[] = [];
        const secretRefs: GSMSecretValue[] = [];
        for (const entry of config.env) {
            if ('gsmSecretName' in entry) {
                secretRefs.push(entry);
            } else {
                remainingEnv.push(entry);
            }
        }

        if (remainingEnv.length > 0) {
            context.appDoc.spec.env = remainingEnv;
        } else {
            delete context.appDoc.spec.env;
        }

        if (secretRefs.length > 0) {
            const existingSecretManifest = context.findDocument('ExternalSecret');
            if (existingSecretManifest == null) {
                const { name, manifest }  = createExternalSecretDoc(
                    context.namespace,
                    context.appname,
                    []
                );
                context.addDoc(manifest);
                context.appDoc.spec.envFrom ??= [];
                context.appDoc.spec.envFrom.push({ secret: name });
            }

            const secretsManifest = context.findDocument('ExternalSecret');
            for (const { name, gsmSecretName } of secretRefs) {
                addSecretRef(secretsManifest, name, gsmSecretName);
            }
        }
    },
};