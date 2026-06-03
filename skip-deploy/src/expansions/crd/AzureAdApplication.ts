export function createAzureAdApplication(namespace: string, appname: string, spec: any) {
    const secretName = `azuread-${appname}`;
    const manifest =  {
        apiVersion: 'nais.io/v1',
        kind: 'AzureAdApplication',
        metadata: {
            name: appname,
            namespace,
        },
        spec: {
            secretName: secretName,
            ...spec,
        },
    };
    return { secretName, manifest };
}

export type AppReference = {
    cluster: string;
    namespace: string;
    application: string;
}
export function addPreauthorizedApp(manifest: any, app: AppReference) {
    manifest.spec ??= {};
    manifest.spec.preAuthorizedApplications ??= [];
    manifest.spec.preAuthorizedApplications.push(app);
}