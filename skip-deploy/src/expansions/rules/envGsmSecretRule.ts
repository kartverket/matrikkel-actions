import {require, requireNotNullOrEmpty} from "../../../../utils/fn-utils.ts";
import type {ExpansionRule} from "../ApplicationExpansionContext.ts";
import {isObject} from "../../utils.ts";

export const envGsmSecretRule: ExpansionRule = {
    name: 'env-gsm-secret',
    apply: (context) => {
        const env = context.appDoc.spec?.env;
        if (env == null) return;
        require(Array.isArray(env), () => `spec.env must be a list`);

        const remainingEnv: unknown[] = [];
        for (const entry of env) {
            if (!isObject(entry) || entry.gsmSecretName == null) {
                remainingEnv.push(entry);
                continue;
            }

            requireNotNullOrEmpty(entry.name, () => `spec.env[].name is required when gsmSecretName is used`);
            requireNotNullOrEmpty(entry.gsmSecretName, () => `spec.env[].gsmSecretName is required`);
            context.addExternalSecretData({ secretKey: entry.name, remoteKey: entry.gsmSecretName });
        }

        if (remainingEnv.length > 0) {
            context.appDoc.spec.env = remainingEnv;
        } else {
            delete context.appDoc.spec.env;
        }
    },
};