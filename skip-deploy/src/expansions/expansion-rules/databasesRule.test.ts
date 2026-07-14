import { describe, it  } from 'bun:test';
import {testContext, yamlMatch} from "./rule.testutils.ts";
import {databasesRule} from "./databasesRule.ts";
import {ensureStringEnv} from "../post-processing-rules/ensure-string-env.ts";

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