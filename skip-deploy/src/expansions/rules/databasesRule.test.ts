import { describe, it, expect, spyOn } from 'bun:test';
import {testContext, yamlMatch} from "./rule.testutils.ts";
import {envGsmSecretRule} from "./envGsmSecretRule.ts";
import {databasesRule} from "./databasesRule.ts";

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
            spec:
              databases:
                - name: my-db
                  envName: MY_DB_URL
       `, dbConfig);

       await databasesRule.apply(ctx);

       yamlMatch(ctx.serialize(), `
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
});