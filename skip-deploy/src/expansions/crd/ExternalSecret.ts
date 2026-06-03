import {addSecretRef} from "../operations/addSecretRef.ts";

type SecretRefs = {
    readonly secretKey: string;
    readonly remoteKey: string;
};

export function createExternalSecretManifest(namespace: string, appname: string, data: SecretRefs[]) {
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
            data: [],
        },
    };

    for (const { secretKey, remoteKey } of data) {
        addSecretRef(manifest, secretKey, remoteKey)
    }
    return { name, manifest };
}