export function createAzureAdApplication(namespace: string, appname: string) {
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
            allowAllUsers: false,
            singlePageApplication: false,
            claims: {
                groups: [
                    // AAD - TF - TEAM - Heimdall
                    { id: 'efa96215-e137-4850-bc85-744a869f6ef5' }
                ]
            },
        },
    };
    return { secretName, manifest };
}