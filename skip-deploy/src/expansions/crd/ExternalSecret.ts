type SecretRefs = {
    readonly secretKey: string;
    readonly remoteKey: string;
};
type ExternalSecretCRD = {};

export function createExternalSecretDoc(namespace: string, appname: string, data: SecretRefs[]) {
    const name = `${appname}-secrets`;
    const manifest =  {
        apiVersion: 'external-secrets.io/v1',
        kind: 'ExternalSecret',
        metadata: {
            name: `${appname}-externalsecrets`,
            namespace,
        },
        spec: {
            refreshInterval: '1h',
            secretStoreRef: {
                kind: 'SecretStore',
                name: 'gsm',
            },
            target: {
                name
            },
            data: data.map(entry => ({
                secretKey: entry.secretKey,
                remoteRef: {
                    key: entry.remoteKey,
                    metadataPolicy: 'None',
                },
            })),
        },
    };
    return { name, manifest };
}