import {describe, expect, it} from "bun:test";
import * as yaml from "yaml";
import {expandKubernetesManifests, redactSensitiveValues} from "./expansion.ts";

const baseApplication = `
apiVersion: skiperator.kartverket.no/v1alpha1
kind: Application
metadata:
  namespace: main
  name: matrikkel-ekstern-data
spec:
  image: ghcr.io/kartverket/matrikkel-ekstern-data:1.2.3
  port: 8080
`;

describe('expandKubernetesManifests', () => {
    it('keeps plain manifests semantically unchanged', async () => {
        const expanded = await firstExpanded(baseApplication);

        const docs = parseDocs(expanded.manifest);
        expect(docs).toHaveLength(1);
        expect(docs[0].kind).toBe('Application');
        expect(docs[0].spec.image).toBe('ghcr.io/kartverket/matrikkel-ekstern-data:1.2.3');
        expect(docs[0].spec.envFrom).toBeUndefined();
    });

    it('collects inline GSM env shortcuts into one ExternalSecret', async () => {
        const expanded = await firstExpanded(`
${baseApplication}
  env:
    - name: DB_ADMIN_PASSWORD
      gsmSecretName: prod-matrikkel-db-admin-password
    - name: NORMAL_ENV
      value: normal
`);

        const [app, externalSecret] = parseDocs(expanded.manifest);
        expect(app.spec.env).toEqual([{ name: 'NORMAL_ENV', value: 'normal' }]);
        expect(app.spec.envFrom).toEqual([{ secret: 'matrikkel-ekstern-data-secrets' }]);

        expect(externalSecret.kind).toBe('ExternalSecret');
        expect(externalSecret.metadata).toEqual({
            name: 'matrikkel-ekstern-data-externalsecrets',
            namespace: 'main',
        });
        expect(externalSecret.spec).toEqual({
            refreshInterval: '1h',
            secretStoreRef: {
                kind: 'SecretStore',
                name: 'gsm',
            },
            target: {
                name: 'matrikkel-ekstern-data-secrets',
            },
            data: [
                {
                    secretKey: 'DB_ADMIN_PASSWORD',
                    remoteRef: {
                        key: 'prod-matrikkel-db-admin-password',
                        metadataPolicy: 'None',
                    },
                },
            ],
        });
    });

    it('expands database metadata from GSM into outbound policy', async () => {
        const expanded = await firstExpanded(`
${baseApplication}
  databases:
    - name: primary
      gsmMetadataSecret: prod-matrikkel-db-metadata
`, async secret => {
            expect(secret).toBe('prod-matrikkel-db-metadata');
            return {
                host: 'db-host',
                ip: '10.0.0.12',
                ports: [{ name: 'sql', port: 5432, protocol: 'TCP' }],
            };
        });

        const [app] = parseDocs(expanded.manifest);
        expect(app.spec.databases).toBeUndefined();
        expect(app.spec.accessPolicy.outbound.external).toEqual([
            {
                host: 'db-host',
                ip: '10.0.0.12',
                ports: [{ name: 'sql', port: 5432, protocol: 'TCP' }],
            },
        ]);
        expect(expanded.sensitiveValues).toEqual(['db-host', '10.0.0.12']);
    });

    it('rejects database host and ip in source manifests', async () => {
        await expect(expandKubernetesManifests(`
${baseApplication}
  databases:
    - name: primary
      host: db-host
      ip: 10.0.0.12
      gsmMetadataSecret: prod-matrikkel-db-metadata
`)).rejects.toThrow('must not contain host or ip');
    });

    it('expands generic outbound shortcuts into accessPolicy outbound external', async () => {
        const expanded = await firstExpanded(`
${baseApplication}
  outbound:
    - host: login.microsoftonline.com
      ports:
        - name: https
          port: 443
          protocol: HTTPS
`);

        const [app] = parseDocs(expanded.manifest);
        expect(app.spec.outbound).toBeUndefined();
        expect(app.spec.accessPolicy.outbound.external).toEqual([
            {
                host: 'login.microsoftonline.com',
                ports: [{ name: 'https', port: 443, protocol: 'HTTPS' }],
            },
        ]);
    });

    it('merges idempotent outbound rules and fails on conflicts', async () => {
        const manifest = `
${baseApplication}
  accessPolicy:
    outbound:
      external:
        - host: login.microsoftonline.com
          ports:
            - name: https
              port: 443
              protocol: HTTPS
  outbound:
    - host: login.microsoftonline.com
      ports:
        - name: https
          port: 443
          protocol: HTTPS
`;
        const expanded = await firstExpanded(manifest);
        const [app] = parseDocs(expanded.manifest);
        expect(app.spec.accessPolicy.outbound.external).toHaveLength(1);

        await expect(expandKubernetesManifests(manifest.replace('protocol: HTTPS', 'protocol: HTTP'))).rejects.toThrow();
    });

    it('redacts sensitive values', () => {
        expect(redactSensitiveValues('host db-host ip 10.0.0.12', ['db-host', '10.0.0.12']))
            .toBe('host *** ip ***');
    });
});

function parseDocs(manifest: string): any[] {
    return yaml.parseAllDocuments(manifest).map(doc => doc.toJSON()).filter(Boolean);
}

async function firstExpanded(
    manifest: string,
    resolver?: Parameters<typeof expandKubernetesManifests>[1]
) {
    const [expanded] = await expandKubernetesManifests(manifest, resolver);
    expect(expanded).toBeDefined();
    return expanded!;
}
