import type {ExpansionRule} from "../ApplicationExpansionContext.ts";
import z from 'zod';

const Config = z.object({
    env: z.array(
        z.union([
            z.object({
                name: z.string(),
                value: z.string(),
            }),
            z.object({
                name: z.string("spec.env[].name is required when gsmSecretName is used").min(1),
                gsmSecretName: z.string("spec.env[].gsmSecretName is required").min(1),
            }),
        ])
    ).optional()
})
type Config = z.infer<typeof Config>;

export const envGsmSecretRule: ExpansionRule = {
    name: 'env-gsm-secret',
    apply: (context) => {
        const config: Config = z.parse(Config, context.appDoc.spec)
        if (config.env == null) return;

        const remainingEnv: unknown[] = [];
        for (const entry of config.env) {
            if (!('gsmSecretName' in entry) ) {
                remainingEnv.push(entry);
                continue;
            }

            context.addExternalSecretData({ secretKey: entry.name, remoteKey: entry.gsmSecretName });
        }

        if (remainingEnv.length > 0) {
            context.appDoc.spec.env = remainingEnv;
        } else {
            delete context.appDoc.spec.env;
        }
    },
};