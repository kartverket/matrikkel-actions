import type {PostProcessingRule} from "../ApplicationExpansionContext.ts";

export const ensureStringEnv: PostProcessingRule = {
    name: 'ensure-string-env',
    apply: (context) => {
        const appEnv = context.appManifest.spec?.env;
        const extraContainersEnv = context.appManifest.spec?.extraContainers
            ?.map((extraContainer: any) => extraContainer.env)
            ?? [];

        const allEnvs = [appEnv, ...extraContainersEnv].filter(Boolean)
        for (const env of allEnvs) {
            stringifyEnvValues(env);
        }
    },
}

function stringifyEnvValues(envValues: any[]) {
    for (const envEntry of envValues) {
        if ('value' in envEntry) {
            envEntry.value = envEntry.value.toString()
        } else if ('gsmSecretName' in envEntry) {
            envEntry.gsmSecretName = envEntry.gsmSecretName.toString()
        }
    }
}