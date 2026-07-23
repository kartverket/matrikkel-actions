import { describe, expect, it } from 'bun:test';
import {testContext, trimIndent, yamlMatch} from "./rule.testutils.ts";
import {DatabaseMetadataFile, databasesRule} from "./databasesRule.ts";
import {ensureStringEnv} from "../post-processing-rules/ensure-string-env.ts";
import * as yaml from "yaml";

const dbConfig = `
databases:
  - name: my-db
    url: jdbc:postgresql://database-host:5432/database-name
    host: database-host
    ip: 10.0.0.12
    ports:
      - name: sql
        port: 5432
        protocol: TCP
  - names: [dummy1, dummy2]
    url: jdbc:postgresql://database-host:5432/database-name
    host: database-host
    ip: 10.0.0.12
    ports:
      - name: sql
        port: 5432
        protocol: TCP
`;

describe('databasesRule', () => {
    it('should validate database configuration', async () => {
        const ctx = testContext(`
            metadata:
              name: appname
              namespace: main
            spec:
              databases:
                - name: my-db
                  envName: MY_DB_URL
       `, dbConfig);

        await databasesRule.apply(ctx);

        yamlMatch(ctx.serialize(), `
            metadata:
              name: appname
              namespace: main
            spec:
              accessPolicy:
                outbound:
                  external:
                    - host: database-host
                      ip: 10.0.0.12
                      ports:
                        - name: sql
                          port: 5432
                          protocol: TCP
              env:
                - name: MY_DB_URL
                  value: jdbc:postgresql://database-host:5432/database-name
       `)
    });

    it('should use the specified config-field', async () => {
        const ctx = testContext(`
            metadata:
              name: appname
              namespace: main
            spec:
              databases:
                - name: my-db
                  fields:
                    - path: ports[0].port
                      envName: MY_DB_PORT
                    - path: ip
                      envName: MY_DB_IP
       `, dbConfig);

        await databasesRule.apply(ctx);
        await ensureStringEnv.apply(ctx);

        yamlMatch(ctx.serialize(), `
            metadata:
              name: appname
              namespace: main
            spec:
              accessPolicy:
                outbound:
                  external:
                    - host: database-host
                      ip: 10.0.0.12
                      ports:
                        - name: sql
                          port: 5432
                          protocol: TCP
              env:
                - name: MY_DB_PORT
                  value: "5432"
                - name: MY_DB_IP
                  value: 10.0.0.12
       `)
    });
});

describe('Parsing DatabaseMetadataFile', () => {
    it('should support single name', () => {
        const data = trimIndent(`
            databases:
              - name: my-db
                url: jdbc:postgresql://database-host:5432/database-name
                host: database-host
                ip: 10.0.0.12
                ports:
                  - name: sql
                    port: 5432
                    protocol: TCP
        `)
        const result = DatabaseMetadataFile.safeParse(yaml.parse(data));

        expect(result.success).toBeTrue();
        expect(result.data?.databases.length).toBe(1);
    });
    it('should support multiple names', () => {
        const data = trimIndent(`
            databases:
              - names: [my-db, my-db2]
                url: jdbc:postgresql://database-host:5432/database-name
                host: database-host
                ip: 10.0.0.12
                ports:
                  - name: sql
                    port: 5432
                    protocol: TCP
        `)
        const result = DatabaseMetadataFile.safeParse(yaml.parse(data));
        expect(result.success).toBeTrue();
        expect(result.data?.databases.length).toBe(1);
    });
    it('should fail if no names are present', () => {
        const data = trimIndent(`
            databases:
              - url: jdbc:postgresql://database-host:5432/database-name
                host: database-host
                ip: 10.0.0.12
                ports:
                  - name: sql
                    port: 5432
                    protocol: TCP
        `)
        const result = DatabaseMetadataFile.safeParse(yaml.parse(data));

        expect(result.error).not.toBeUndefined();
    });
    it('should fail if both name-fields are used', () => {
        const data = trimIndent(`
            databases:
              - name: my-db
                names: [db1, db2]
                url: jdbc:postgresql://database-host:5432/database-name
                host: database-host
                ip: 10.0.0.12
                ports:
                  - name: sql
                    port: 5432
                    protocol: TCP
        `)
        const result = DatabaseMetadataFile.safeParse(yaml.parse(data));

        expect(result.error).not.toBeUndefined();
    });
});