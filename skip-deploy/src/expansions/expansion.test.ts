import {describe, expect, it} from "bun:test";
import {mkdir, mkdtemp, rm, writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import * as yaml from "yaml";
import {expandKubernetesManifests} from "./expansion.ts";
import {createAppsRepoDatabaseMetadataResolver, type DatabaseMetadataResolver} from "./expansion-rules/databasesRule.ts";
import {trimIndent} from "./expansion-rules/rule.testutils.ts";

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

const unexpectedDatabaseResolver: DatabaseMetadataResolver = async (namespace, databaseName) => {
    throw new Error(`Unexpected database lookup: ${namespace}/${databaseName}`);
};

describe('expandKubernetesManifests', () => {
    it('keeps plain manifests semantically unchanged', async () => {
        const expanded = await expand(baseApplication);

        const manifest = parseManifest(expanded.manifest);
        expect(manifest).toHaveLength(1);
        expect(manifest[0].kind).toBe('Application');
        expect(manifest[0].spec.image).toBe('ghcr.io/kartverket/matrikkel-ekstern-data:1.2.3');
        expect(manifest[0].spec.envFrom).toBeUndefined();
    });

    it('should keep extra resources', async () => {
        const manifest = trimIndent(`
          apiVersion: skiperator.kartverket.no/v1alpha1
          kind: Application
          metadata:
            namespace: main
            name: matrikkel-ekstern-data
          spec:
            image: ghcr.io/kartverket/matrikkel-ekstern-data:1.2.3
            port: 8080
          ---
          # Just comment
          apiVersion: networking.istio.io/v1
          kind: VirtualService
          metadata:
            name: api-ingresses
          spec:
            gateways:
              - istoio-gateways/test-gateway
          ---
          apiVersion: networking.k8s.io/v1
          kind:NetworkPolicy
          metadata:
            name: appname-allow-tcp
          spec:
            podSelector:
              matchLabels:
                app: appname
            policyTypes:
              - Ingress
        `);

        const manifests: string[] = (await expandKubernetesManifests('dev', manifest, {databases: unexpectedDatabaseResolver}))
            .map(it => it.manifest);

        expect(manifests.some(it => it.includes('VirtualService'))).toBeTrue();
        expect(manifests.some(it => it.includes('NetworkPolicy'))).toBeTrue();
    });

    it('collects inline GSM env shortcuts into one ExternalSecret', async () => {
        const expanded = await expand(`
${baseApplication}
  env:
    - name: DB_ADMIN_PASSWORD
      gsmSecretName: prod-matrikkel-db-admin-password
    - name: NORMAL_ENV
      value: normal
`);

        const [app, externalSecret] = parseManifest(expanded.manifest);
        expect(app.spec.env).toEqual([{name: 'NORMAL_ENV', value: 'normal'}]);
        expect(app.spec.envFrom).toEqual([{secret: 'matrikkel-ekstern-data-secrets'}]);

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

    it('expands namespace database metadata into env and outbound policy', async () => {
        const databaseResolver: DatabaseMetadataResolver = async (namespace, databaseName) => {
            expect(namespace).toBe('main');
            expect(databaseName).toBe('primary');
            return {
                name: 'primary',
                url: 'jdbc:postgresql://db-host:5432/sergreg',
                host: 'db-host',
                ip: '10.0.0.12',
                ports: [{name: 'sql', port: 5432, protocol: 'TCP'}],
            };
        }
        const expanded = await expand(`
${baseApplication}
  databases:
    - name: primary
      envName: DATABASE_URL
`, databaseResolver);

        const [app] = parseManifest(expanded.manifest);
        expect(app.spec.databases).toBeUndefined();
        expect(app.spec.env).toEqual([
            {name: 'DATABASE_URL', value: 'jdbc:postgresql://db-host:5432/sergreg'},
        ]);
        expect(app.spec.accessPolicy.outbound.external).toEqual([
            {
                host: 'db-host',
                ip: '10.0.0.12',
                ports: [{name: 'sql', port: 5432, protocol: 'TCP'}],
            },
        ]);
    });

    it('reads database metadata from the namespace apps-repo file', async () => {
        await withAppsRepoMetadata(`
databases:
  - name: primary
    url: jdbc:postgresql://kv-vm.statkart.no:5432/sergreg
    host: kv-vm.statkart.no
    ip: 10.0.0.12
    ports:
      - name: sql
        port: 5432
        protocol: TCP
`, async root => {
            const expanded = await expand(`
${baseApplication}
  databases:
    - name: primary
      envName: DATABASE_URL
`, createAppsRepoDatabaseMetadataResolver('cluster1', root));
            const [app] = parseManifest(expanded.manifest);
            expect(app.spec.env).toEqual([
                {name: 'DATABASE_URL', value: 'jdbc:postgresql://kv-vm.statkart.no:5432/sergreg'},
            ]);
            expect(app.spec.accessPolicy.outbound.external).toEqual([
                {
                    host: 'kv-vm.statkart.no',
                    ip: '10.0.0.12',
                    ports: [{name: 'sql', port: 5432, protocol: 'TCP'}],
                },
            ]);
        });
    });

    it('rejects missing database metadata files', async () => {
        const root = await mkdtemp(join(tmpdir(), 'skip-deploy-test-'));
        try {
            await expect(expand(`
${baseApplication}
  databases:
    - name: primary
      envName: DATABASE_URL
`, createAppsRepoDatabaseMetadataResolver('cluster1', root))).rejects.toThrow('database-metadata.yaml');
        } finally {
            await rm(root, {recursive: true, force: true});
        }
    });

    it('rejects unknown database names', async () => {
        await withAppsRepoMetadata(`
databases:
  - name: secondary
    url: jdbc:postgresql://db-host:5432/sergreg
    host: db-host
    ip: 10.0.0.12
    ports:
      - name: sql
        port: 5432
        protocol: TCP
`, async root => {
            await expect(expand(`
${baseApplication}
  databases:
    - name: primary
      envName: DATABASE_URL
`, createAppsRepoDatabaseMetadataResolver('cluster1', root))).rejects.toThrow('Could not find database metadata for "primary"');
        });
    });

    it('rejects duplicate database metadata names', async () => {
        await withAppsRepoMetadata(`
databases:
  - name: primary
    url: jdbc:postgresql://db-host:5432/sergreg
    host: db-host
    ip: 10.0.0.12
    ports:
      - name: sql
        port: 5432
        protocol: TCP
  - name: primary
    url: jdbc:postgresql://other-db-host:5432/sergreg
    host: other-db-host
    ip: 10.0.0.13
    ports:
      - name: sql
        port: 5432
        protocol: TCP
`, async root => {
            await expect(expand(`
${baseApplication}
  databases:
    - name: primary
      envName: DATABASE_URL
`, createAppsRepoDatabaseMetadataResolver('cluster1', root))).rejects.toThrow('Duplicate database metadata name "primary"');
        });
    });

    it('rejects database metadata fields in source manifests', async () => {
        await expect(expandKubernetesManifests('dev', `
${baseApplication}
  databases:
    - name: primary
      envName: DATABASE_URL
      host: db-host
      ip: 10.0.0.12
      ports: []
      url: jdbc:postgresql://db-host:5432/sergreg
      gsmMetadataSecret: prod-matrikkel-db-metadata
`, {databases: unexpectedDatabaseResolver})).rejects.toThrow();
    });

    it('rejects database env without envName', async () => {
        await expect(expandKubernetesManifests('dev',`
${baseApplication}
  databases:
    - name: primary
`, {databases: unexpectedDatabaseResolver})).rejects.toThrow('spec.databases[].envName is required');
    });

    it('rejects database envName conflicts with existing env', async () => {
        await expect(expand(`
${baseApplication}
  env:
    - name: DATABASE_URL
      value: existing
  databases:
    - name: primary
      envName: DATABASE_URL
`, async () => ({
            name: 'primary',
            url: 'jdbc:postgresql://db-host:5432/sergreg',
            host: 'db-host',
            ip: '10.0.0.12',
            ports: [{name: 'sql', port: 5432, protocol: 'TCP'}],
        }))).rejects.toThrow('Conflicting env var generated from database: DATABASE_URL');
    });
});

function parseManifest(manifest: string): any[] {
    return yaml.parseAllDocuments(manifest)
        .map(it => it.toJSON())
        .filter(Boolean);
}

async function expand(
    manifest: string,
    resolver: DatabaseMetadataResolver = unexpectedDatabaseResolver,
) {
    const [expanded] = await expandKubernetesManifests('dev', manifest, {databases: resolver});
    expect(expanded).toBeDefined();
    return expanded!;
}

async function withAppsRepoMetadata(content: string, test: (root: string) => Promise<void>) {
    const root = await mkdtemp(join(tmpdir(), 'skip-deploy-test-'));
    try {
        const metadataDir = join(root, 'env', 'cluster1', 'main');
        await mkdir(metadataDir, {recursive: true});
        await writeFile(join(metadataDir, 'database-metadata.yaml'), content);
        await test(root);
    } finally {
        await rm(root, {recursive: true, force: true});
    }
}
