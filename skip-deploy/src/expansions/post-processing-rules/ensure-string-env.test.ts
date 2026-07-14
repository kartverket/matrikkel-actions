import { describe, it } from 'bun:test';
import {testContext, yamlMatch} from "../expansion-rules/rule.testutils.ts";
import {ensureStringEnv} from "./ensure-string-env.ts";

describe('ensure-string-env', () => {
    it('should rewrite env-values', async () => {
        const ctx = testContext(`
            metadata:
              name: appname
              namespace: main
            spec:
              env:
                - name: TEST
                  value: hello
                - name: NUMERIC
                  value: 1231
                - name: WRAPPED
                  value: "9876"
       `, null);

        await ensureStringEnv.apply(ctx);

        yamlMatch(ctx.serialize(), `
            metadata:
              name: appname
              namespace: main
            spec:
              env:
                - name: TEST
                  value: hello
                - name: NUMERIC
                  value: "1231"
                - name: WRAPPED
                  value: "9876"
        `);
    });

    it('should rewrite env-values for extraContainers', async () => {
        const ctx = testContext(`
            metadata:
              name: appname
              namespace: main
            spec:
              extraContainers:
                - image: testing
                  env:
                  - name: TEST
                    value: hello
                  - name: NUMERIC
                    value: 1231
                  - name: WRAPPED
                    value: "9876"
                - image: another
                  env:
                  - name: TEST
                    value: hello
                  - name: NUMERIC
                    value: 1231
                  - name: WRAPPED
                    value: "9876"
       `, null);

        await ensureStringEnv.apply(ctx);

        yamlMatch(ctx.serialize(), `
            metadata:
              name: appname
              namespace: main
            spec:
              extraContainers:
                - image: testing
                  env:
                  - name: TEST
                    value: hello
                  - name: NUMERIC
                    value: "1231"
                  - name: WRAPPED
                    value: "9876"
                - image: another
                  env:
                  - name: TEST
                    value: hello
                  - name: NUMERIC
                    value: "1231"
                  - name: WRAPPED
                    value: "9876"
        `);
    });
})